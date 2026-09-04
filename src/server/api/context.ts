import 'server-only'
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import {
  authenticateApiKey,
  hasScope,
  type ApiKeyIdentity,
} from '@/server/services/apiKeyService'
import { runAsMachine } from '@/server/auth/actor'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import type { ApiScope } from '@/generated/prisma/client'

/**
 * The shared entry path for every `/api/v1` route.
 *
 * All of them need the same four things in the same order — authenticate the
 * bearer token, check the scope, rate-limit the key, and fail in a shape the
 * caller can parse — and each doing it slightly differently is how one endpoint
 * ends up accepting a revoked key or leaking another tenant's data through a
 * missing organisation filter. So a handler here receives an already-resolved
 * organisation id and cannot see a request that failed any of those checks.
 *
 * Errors are always `{ error: { code, message } }`. A machine caller has to be
 * able to branch on something stable, and a bare string forces integrators to
 * match on prose that changes the moment someone improves the wording.
 */

export interface ApiContext {
  organizationId: string
  key: ApiKeyIdentity
  ip: string
  /**
   * An extra budget for an endpoint that costs far more than an ordinary
   * write — image ingest re-encodes and uploads to a CDN. Returns a ready 429
   * response when the caller is over, or null to carry on.
   */
  rateLimit: (
    bucket: string,
    limit: number,
    windowSeconds: number
  ) => Promise<Response | null>
}

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'rate_limited'
  | 'conflict'
  | 'server_error'

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 422,
  rate_limited: 429,
  conflict: 409,
  server_error: 500,
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    { error: { code, message, ...extra } },
    { status: STATUS_BY_CODE[code] }
  )
}

export function apiOk(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

/**
 * A handler for an endpoint that used to exist.
 *
 * The catalogue endpoints — products, categories, inventory — were how a
 * merchant pushed their goods into this database. There is no longer a database
 * to push them into, so those paths answer 410 and say where the model went.
 *
 * 410 rather than 404 because the caller is not mistaken: the path was real,
 * their integration was correct when it was written, and the difference between
 * "gone, here is what replaced it" and "no such endpoint" is whether they read
 * the migration note or open a support ticket about our routing.
 *
 * Deliberately unauthenticated. Checking a key first would answer a different
 * question than the one being asked, and a 401 on a retired path sends an
 * integrator to rotate credentials that were never the problem.
 */
export function retiredEndpoint(message: string) {
  return function gone() {
    return NextResponse.json(
      {
        error: {
          code: 'gone',
          message,
          docs: '/docs#product-source',
        },
      },
      { status: 410 }
    )
  }
}

function tooManyRequests(retryAfterSeconds?: number) {
  return NextResponse.json(
    {
      error: {
        code: 'rate_limited',
        message: 'Too many requests. Slow down and retry.',
      },
    },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfterSeconds ?? 60) },
    }
  )
}

/**
 * Per-key limits.
 *
 * Generous enough for a full catalogue import at a sane pace, tight enough that
 * a runaway loop in someone's script cannot saturate the database for every
 * other tenant on the instance. Reads and writes are separate buckets because a
 * stock-sync daemon polls far more often than it writes, and one budget would
 * make its reads starve its writes.
 */
const READ_LIMIT = 600
const WRITE_LIMIT = 120
const WINDOW_SECONDS = 60

/**
 * Runs a handler with an authenticated context, or returns the right error.
 *
 * `scope` is required rather than optional: a route that forgets to declare
 * what it needs would otherwise be reachable by any valid key, which is the
 * failure that turns a read-only integration into a way to delete a catalogue.
 */
export async function withApiKey(
  scope: ApiScope,
  handler: (context: ApiContext) => Promise<Response>
): Promise<Response> {
  const headerList = await headers()
  const authorization = headerList.get('authorization') ?? ''

  const token = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : // Also accepted so `curl -H "X-API-Key: …"` works, which is what most
      // people reach for first.
      (headerList.get('x-api-key') ?? '').trim()

  if (token === '') {
    return apiError(
      'unauthorized',
      'Missing API key. Send it as `Authorization: Bearer <key>`.'
    )
  }

  const ip = await getClientIp()
  const key = await authenticateApiKey(token, ip)

  if (!key) {
    return apiError(
      'unauthorized',
      'That API key is not valid, has been revoked, or has expired.'
    )
  }

  if (!hasScope(key, scope)) {
    return apiError(
      'forbidden',
      `This key does not have the \`${scope}\` permission.`,
      { requiredScope: scope }
    )
  }

  const isWrite = scope.endsWith('_WRITE')
  const limit = await checkRateLimit(
    `api:${key.id}:${isWrite ? 'write' : 'read'}`,
    isWrite ? WRITE_LIMIT : READ_LIMIT,
    WINDOW_SECONDS
  )

  if (!limit.allowed) {
    return tooManyRequests(limit.retryAfterSeconds)
  }

  const perEndpointLimit = async (
    bucket: string,
    max: number,
    windowSeconds: number
  ) => {
    const result = await checkRateLimit(
      `api:${key.id}:${bucket}`,
      max,
      windowSeconds
    )
    return result.allowed ? null : tooManyRequests(result.retryAfterSeconds)
  }

  try {
    // Announced for the duration of the request so the service layer's
    // `requireOrgAccess` — which otherwise looks for a signed-in user — can see
    // that a key is acting, and for which organisation. See server/auth/actor.
    return await runAsMachine(
      {
        kind: 'apiKey',
        apiKeyId: key.id,
        keyName: key.name,
        organizationId: key.organizationId,
        role: 'ADMIN',
      },
      () =>
        handler({
          organizationId: key.organizationId,
          key,
          ip,
          rateLimit: perEndpointLimit,
        })
    )
  } catch (cause) {
    // Service-layer errors are merchant-facing sentences ("Category not
    // found"), so they are safe to return. Anything else is logged and
    // generalised — an unhandled Prisma error can carry column names and
    // constraint definitions.
    if (cause instanceof Error && isSafeMessage(cause.message)) {
      const code: ApiErrorCode = /not found/i.test(cause.message)
        ? 'not_found'
        : 'invalid_request'
      return apiError(code, cause.message)
    }

    console.error('[api] unhandled error', cause)
    return apiError('server_error', 'Something went wrong on our side.')
  }
}

/**
 * Whether an error message was written for a person rather than escaping from a
 * driver. Length and shape are a decent proxy: our service errors are short
 * sentences; Prisma's carry SQL, stack fragments and `prisma.` call paths.
 */
function isSafeMessage(message: string): boolean {
  return (
    message.length > 0 &&
    message.length <= 200 &&
    !message.includes('\n') &&
    !/prisma|invalid `|sql|constraint|column/i.test(message)
  )
}

/** Parses a JSON body, turning both malformed JSON and schema misses into 422s. */
export async function readJson<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return {
      ok: false,
      response: apiError('invalid_request', 'Request body must be valid JSON.'),
    }
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError('invalid_request', 'Some fields are not valid.', {
        // Field-level detail, because "some fields are not valid" is useless to
        // someone debugging a 200-product import at 3am.
        fields: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      }),
    }
  }

  return { ok: true, data: parsed.data }
}

/** Shared list paging, clamped so `?limit=100000` cannot become a table scan. */
export function readPaging(request: Request) {
  const url = new URL(request.url)
  const limit = Math.min(
    Math.max(Number(url.searchParams.get('limit')) || 50, 1),
    250
  )
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1)

  return { limit, page, skip: (page - 1) * limit }
}
