import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { authenticateApiKey, hasScope } from '@/server/services/apiKeyService'
import { runAsMachine } from '@/server/auth/actor'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { isTrustedOrigin } from '@/lib/security'
import {
  handleMessage,
  refuseMessage,
  RPC_ERRORS,
  type McpContext,
} from '@/server/mcp/protocol'

/**
 * `POST /api/mcp` — NCOM's MCP server, for AI code editors.
 *
 * A merchant connects Cursor, Claude Code, VS Code or Windsurf with an API key
 * from Settings → AI code editors, and the editor's AI can then read their
 * websites and build pages here. Authentication is that key, sent as
 * `Authorization: Bearer …`; it needs the "Read websites" permission to
 * connect and "Build websites" to change anything.
 *
 * Streamable HTTP without the stream: every answer is a single JSON response
 * (see server/mcp/protocol.ts), so GET — which would open a server-to-client
 * event stream — is answered 405, as the transport allows.
 *
 * Limits are per key and per message, not per POST: a batch of 20 costs what
 * 20 separate requests would, and every change also comes out of the same
 * per-key budget the REST API uses for changes.
 */

const REQUESTS_PER_MINUTE = 240
/** The REST API's WRITE_LIMIT (server/api/context.ts), for the bucket both share. */
const WRITES_PER_MINUTE = 120
/** The most messages one batch may carry; the rest are answered, not run. */
const MAX_BATCH = 20
/**
 * Past this, a batch is refused whole rather than answered message by message:
 * answering each costs work too, and a client sending thousands is not one
 * waiting on every id.
 */
const MAX_BATCH_ANSWERED = 100

function unauthorized(message: string) {
  return NextResponse.json(
    { jsonrpc: '2.0', id: null, error: { code: -32001, message } },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer realm="ncom", error="invalid_token"',
      },
    }
  )
}

export async function POST(request: Request) {
  // A browser page cannot attach the key on its own, but a page served from
  // somewhere else has no business talking to this endpoint at all.
  if (request.headers.get('origin') && !isTrustedOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin' },
      { status: 403 }
    )
  }

  const headerList = await headers()
  const authorization = headerList.get('authorization') ?? ''
  const token = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : (headerList.get('x-api-key') ?? '').trim()
  if (!token) {
    return unauthorized(
      'Missing API key. Create one in NCOM → Settings → AI code editors and send it as "Authorization: Bearer <key>".'
    )
  }

  const ip = await getClientIp()
  const key = await authenticateApiKey(token, ip)
  if (!key)
    return unauthorized(
      'That API key is not valid, has been revoked, or has expired.'
    )
  if (!hasScope(key, 'SITES_READ')) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32003,
          message:
            'This key does not have the "Read websites" permission. Create one in Settings → AI code editors.',
        },
      },
      { status: 403 }
    )
  }

  // Pays for the first message; each further one in a batch pays for itself
  // below, so batching buys no extra calls.
  const limit = await checkRateLimit(`mcp:${key.id}`, REQUESTS_PER_MINUTE, 60)
  if (!limit.allowed) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: RPC_ERRORS.rateLimited,
          message: 'Too many requests. Slow down and retry.',
        },
      },
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfterSeconds ?? 60) },
      }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: RPC_ERRORS.parse,
          message: 'Parse error: the body is not valid JSON.',
        },
      },
      { status: 400 }
    )
  }

  // An empty batch is malformed, and JSON-RPC answers it with one error —
  // not an empty array, and not the 202 that would say it was accepted.
  if (Array.isArray(body) && body.length === 0) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: RPC_ERRORS.invalidRequest,
          message: 'Invalid Request: the batch is empty.',
        },
      },
      { status: 400 }
    )
  }
  if (Array.isArray(body) && body.length > MAX_BATCH_ANSWERED) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: RPC_ERRORS.invalidRequest,
          message: `Batch too large: send at most ${MAX_BATCH} messages at a time.`,
        },
      },
      { status: 413 }
    )
  }

  const context: McpContext = {
    organizationId: key.organizationId,
    canWrite: hasScope(key, 'SITES_WRITE'),
    // The REST API's own bucket for this key's changes, so a key that uses
    // both cannot double what it may change in a minute.
    chargeWrite: () =>
      checkRateLimit(`api:${key.id}:write`, WRITES_PER_MINUTE, 60),
  }

  // Announced for the request so the services' own access checks see a key
  // acting for this workspace, exactly as the REST API does.
  const answer = await runAsMachine(
    {
      kind: 'apiKey',
      apiKeyId: key.id,
      keyName: key.name,
      organizationId: key.organizationId,
      role: 'ADMIN',
    },
    async () => {
      if (!Array.isArray(body)) return handleMessage(body, context)
      const replies = []
      for (const [index, message] of body.entries()) {
        // Past the cap a message is not run, but a request still gets an
        // answer: a client waits on every id it sent until it hears back.
        if (index >= MAX_BATCH) {
          const reply = refuseMessage(
            message,
            RPC_ERRORS.invalidRequest,
            `Batch too large: send at most ${MAX_BATCH} messages at a time, and the rest separately.`
          )
          if (reply) replies.push(reply)
          continue
        }
        if (index > 0) {
          const charge = await checkRateLimit(
            `mcp:${key.id}`,
            REQUESTS_PER_MINUTE,
            60
          )
          if (!charge.allowed) {
            const reply = refuseMessage(
              message,
              RPC_ERRORS.rateLimited,
              'Too many requests. Slow down and retry.'
            )
            if (reply) replies.push(reply)
            continue
          }
        }
        const reply = await handleMessage(message, context)
        if (reply) replies.push(reply)
      }
      return replies.length > 0 ? replies : null
    }
  )

  // Notifications and responses get no reply, only an acknowledgement.
  if (!answer) return new Response(null, { status: 202 })
  // A single message that is not a JSON-RPC message at all is input the server
  // cannot accept, which the transport answers with an HTTP error too.
  const malformed =
    !Array.isArray(answer) &&
    'error' in answer &&
    answer.error.code === RPC_ERRORS.invalidRequest
  return NextResponse.json(answer, { status: malformed ? 400 : 200 })
}

function notAllowed() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } })
}

export const GET = notAllowed
export const DELETE = notAllowed

export const runtime = 'nodejs'
