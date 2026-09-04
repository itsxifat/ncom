import 'server-only'
import { signatureHeader } from '@/lib/signature'
import { CONTRACT_VERSION } from './contract'
import {
  CatalogContractError,
  CatalogError,
  CatalogUnsupportedError,
} from './errors'
import type { CatalogCapabilities } from './types'

/**
 * One signed call to a merchant's website.
 *
 * Everything about this function is shaped by where it runs: inside the render
 * of a page a shopper is waiting for.
 *
 * **Nothing is cached.** `cache: 'no-store'` on every request, no Redis, no
 * memo that outlives the response. A price on a storefront is the price the
 * merchant's own site is quoting *now*, and a stock count is what they have
 * *now*. That is the whole point of reading live, and a cache — however
 * short — would reintroduce exactly the staleness this design exists to
 * remove. The cost is a hard dependency on their uptime, and it is a cost the
 * merchant chose by connecting a site.
 *
 * **Everything times out.** A merchant's shared host having a bad afternoon
 * must not hold our render open; the connection's own timeout applies to every
 * call and expiry is reported as a catalogue failure like any other.
 *
 * **A read that times out is tried once more.** Real connectors cold-start: the
 * first call after an idle spell wakes a container or opens a database pool and
 * blows the budget, and every call after it lands in under 200ms. Measured on a
 * live shop, that was one request at 4.07s followed by four at 0.12s — and the
 * one that lost was enough to replace a landing page's order form with
 * "Ordering is unavailable". Raising the timeout only makes the failure slower;
 * a second attempt succeeds, because the abandoned first one did the waking.
 *
 * Only requests that change nothing are replayed. `/reserve` and `/release`
 * move a merchant's stock, and the contract asks implementations to be
 * idempotent on `orderRef` without requiring it — so a retried reserve could
 * take the last shirt twice. Those get one attempt and an honest failure.
 *
 * **Failures are typed, not thrown strings.** Callers decide what a failure
 * means: a storefront section renders a placeholder, a checkout refuses to
 * take money, the dashboard prints the reason. None of them can do that with
 * `Error('fetch failed')`.
 *
 * Nothing here touches the database or the session. That is deliberate: this
 * module is on the hot path of every storefront render, and it can be exercised
 * against a fake connector with no Postgres behind it. The handshake that *does*
 * write — `checkConnection` — lives in connection.ts for that reason.
 */

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024

/**
 * What one call needs to know about a connection.
 *
 * Structural rather than importing the row type, so this module never reaches
 * the database module that loads it.
 */
export interface CatalogTarget {
  baseUrl: string
  keyId: string
  secret: string
  timeoutMs: number
  capabilities: CatalogCapabilities
}

export interface CatalogRequest {
  method: 'GET' | 'POST'
  /** Path under the connection's base URL, starting with a slash. */
  path: string
  query?: Record<string, string | number | boolean | null | undefined>
  body?: unknown
  /**
   * The capability this endpoint needs. Checked against what the site said at
   * its last handshake so a missing endpoint fails as "not implemented" rather
   * than as a mystery 404 — but only when we have actually been told; an
   * unchecked connection tries the call and finds out.
   */
  capability?: keyof CatalogCapabilities
  /** 404 is an answer rather than a failure, e.g. product-by-handle. */
  allowNotFound?: boolean
  /**
   * Whether sending this twice is harmless.
   *
   * GET is assumed replayable. A POST is not, unless it says so: `/stock` is a
   * read that uses POST only because it takes a list of ids, while `/reserve`
   * and `/release` are the two calls in the contract that change something on
   * the merchant's side and must never be duplicated.
   */
  replayable?: boolean
}

/** How long to wait before the second attempt. */
const RETRY_DELAY_MS = 150

/**
 * Failures worth a second attempt.
 *
 * A cold start looks like `timeout`; a container being replaced looks like
 * `unreachable` or a 502/503/504. Everything else is deterministic — a wrong
 * secret, a missing endpoint, malformed JSON — and repeating the call would
 * only mean the merchant's site is asked twice to say no. A 429 is excluded on
 * purpose: the answer to being rate limited is not more requests.
 */
function isWorthRetrying(error: unknown): boolean {
  if (!(error instanceof CatalogError)) return false
  if (error.failure === 'timeout' || error.failure === 'unreachable')
    return true
  return (
    error.failure === 'upstream_error' &&
    (error.status === 502 || error.status === 503 || error.status === 504)
  )
}

export async function catalogFetch(
  connection: CatalogTarget,
  request: CatalogRequest
): Promise<unknown> {
  const replayable = request.replayable ?? request.method === 'GET'

  try {
    return await attempt(connection, request)
  } catch (error) {
    if (!replayable || !isWorthRetrying(error)) throw error

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    return attempt(connection, request)
  }
}

/**
 * One signed call, start to finish.
 *
 * Split out so the retry above re-signs rather than replaying a stale
 * signature: `X-NCOM-Timestamp` is inside the signed payload and connectors
 * reject anything outside a five-minute window, so a second attempt built from
 * the first one's headers would be refused by a correct implementation the
 * moment the clocks drifted — or, far worse, accepted by a lax one and hide the
 * bug until someone else's connector was strict.
 */
async function attempt(
  connection: CatalogTarget,
  request: CatalogRequest
): Promise<unknown> {
  if (
    request.capability &&
    hasBeenProbed(connection) &&
    !connection.capabilities[request.capability]
  ) {
    throw new CatalogUnsupportedError(request.capability)
  }

  const url = buildUrl(connection.baseUrl, request.path, request.query)
  const body = request.body === undefined ? '' : JSON.stringify(request.body)
  const timestamp = Math.floor(Date.now() / 1000)

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'NCOM-Catalog/1',
    'X-NCOM-Key': connection.keyId,
    'X-NCOM-Contract': CONTRACT_VERSION,
    'X-NCOM-Timestamp': String(timestamp),
    'X-NCOM-Signature': signatureHeader(connection.secret, timestamp, body),
  }
  if (request.method === 'POST') headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(url, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? body : undefined,
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(connection.timeoutMs),
    })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new CatalogError(
        'timeout',
        `The website did not answer within ${connection.timeoutMs}ms.`,
        { cause: error }
      )
    }
    throw new CatalogError(
      'unreachable',
      `The website could not be reached: ${describeNetworkError(error)}`,
      { cause: error }
    )
  }

  if (response.status === 401 || response.status === 403) {
    throw new CatalogError(
      'unauthorized',
      'The website rejected our key. Check that the shared secret matches the one in NCOM, and that the clock on the server is correct.',
      { status: response.status }
    )
  }

  if (response.status === 404 && request.allowNotFound) return null

  if (response.status === 404) {
    throw new CatalogError(
      'contract',
      `The website has no endpoint at ${request.path}. Check the base URL and that the connector is deployed.`,
      { status: 404 }
    )
  }

  if (response.status === 429) {
    throw new CatalogError(
      'upstream_error',
      'The website is rate limiting our requests. Raise the limit for our IP, or the storefront will show gaps.',
      { status: 429 }
    )
  }

  if (!response.ok) {
    throw new CatalogError(
      'upstream_error',
      `The website answered ${response.status}.`,
      { status: response.status }
    )
  }

  return readJson(response, request.path)
}

async function readJson(response: Response, path: string): Promise<unknown> {
  const declared = Number(response.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new CatalogContractError(
      `The response to ${path} is larger than 8MB. Return a page of products with a cursor instead of the whole catalogue.`
    )
  }

  const text = await response.text()
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new CatalogContractError(
      `The response to ${path} is larger than 8MB. Return a page of products with a cursor instead of the whole catalogue.`
    )
  }

  const trimmed = text.trimStart()
  if (trimmed.startsWith('<')) {
    // Overwhelmingly the first failure of any new connector: the base URL
    // points at a page, or the site's router served its 200-with-HTML fallback.
    throw new CatalogContractError(
      `The website returned HTML rather than JSON for ${path}. That usually means the base URL points at a web page instead of the connector.`
    )
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new CatalogContractError(
      `The response to ${path} was not valid JSON.`
    )
  }
}

function buildUrl(
  baseUrl: string,
  path: string,
  query: CatalogRequest['query']
): string {
  const url = new URL(`${baseUrl}${path}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined || value === '') continue
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

/**
 * A connection that has never been checked has no capability list, and an empty
 * list must not be read as "implements nothing" — that would make every call
 * fail before it was ever tried.
 */
function hasBeenProbed(connection: CatalogTarget): boolean {
  return Object.values(connection.capabilities).some(Boolean)
}

function describeNetworkError(error: unknown): string {
  const cause = (error as { cause?: { code?: string } })?.cause
  const code = cause?.code
  if (code === 'ENOTFOUND') return 'the hostname does not resolve'
  if (code === 'ECONNREFUSED') return 'the connection was refused'
  if (code === 'ECONNRESET') return 'the connection was reset'
  if (code === 'CERT_HAS_EXPIRED') return 'its TLS certificate has expired'
  if (code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
    return 'its TLS certificate is self-signed'
  }
  if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    return 'its TLS certificate chain is incomplete'
  }
  return error instanceof Error ? error.message : 'unknown error'
}
