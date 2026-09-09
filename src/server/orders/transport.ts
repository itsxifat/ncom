import 'server-only'
import { signatureHeader } from '@/lib/signature'
import type { OrderTarget } from './destination'
import type { SyncAck } from './types'

/**
 * The one signed POST every message to a merchant's website goes through.
 *
 * Shared by the initial handoff and by every change that follows it, because
 * they are the same request with a different topic — same credential, same
 * signature, same idempotency header, same rules about what may be retried.
 * Two copies of this would be two places for those rules to drift.
 *
 * Signed byte-for-byte the way catalogue reads and webhooks are, so a merchant
 * who already verifies one of those verifies this with the function they have
 * written.
 */

/** How much of a receiver's reply is kept, for debugging without storing a page. */
const RESPONSE_SNIPPET_LENGTH = 2_000

export interface DeliveryResult {
  ok: boolean
  /** True when repeating the identical request cannot produce a better answer. */
  terminal: boolean
  /**
   * The receiver says it holds a different revision than this message assumed.
   * Not a transport failure and not a refusal of the content — the two sides
   * have diverged, and only a human can say which is right.
   */
  conflict: boolean
  statusCode: number | null
  error: string | null
  snippet: string | null
  ack: SyncAck | null
}

/**
 * The signed POST itself.
 *
 * Signed byte-for-byte the way catalogue reads and webhooks are — same header,
 * same `${timestamp}.${body}` payload — so a merchant who already verifies one
 * of those verifies this with the function they have written.
 */
export async function deliver(
  target: OrderTarget,
  idempotencyKey: string,
  body: string
): Promise<DeliveryResult> {
  const timestamp = Math.floor(Date.now() / 1000)

  let response: Response
  try {
    response = await fetch(target.endpointUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'NCOM-Orders/1',
        'X-NCOM-Key': target.keyId,
        'X-NCOM-Contract': '1',
        'X-NCOM-Timestamp': String(timestamp),
        'X-NCOM-Signature': signatureHeader(target.secret, timestamp, body),
        // Repeated in the body as `idempotencyKey`. In a header too because a
        // receiver should be able to dedupe before it parses anything, and
        // because some frameworks make the raw body awkward to reach twice.
        'X-NCOM-Idempotency-Key': idempotencyKey,
      },
      body,
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(target.timeoutMs),
    })
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : ''
    const timedOut = name === 'TimeoutError' || name === 'AbortError'
    return {
      ok: false,
      // Never terminal. A request that got no answer may well have been
      // processed, so the only safe thing to do is ask again with the same key.
      terminal: false,
      conflict: false,
      statusCode: null,
      error: timedOut
        ? `The website did not answer within ${target.timeoutMs}ms.`
        : `The website could not be reached: ${describe(cause)}`,
      snippet: null,
      ack: null,
    }
  }

  const snippet = await readSnippet(response)

  if (response.ok) {
    return {
      ok: true,
      terminal: false,
      conflict: false,
      statusCode: response.status,
      error: null,
      snippet,
      ack: readAck(snippet),
    }
  }

  // 408 and 429 are 4xx by number and "come back later" by meaning; everything
  // else in the 4xx range is a refusal that identical bytes cannot change.
  const retryable =
    response.status >= 500 || response.status === 408 || response.status === 429

  // 409 is its own thing, and conflating it with either of the above would be
  // wrong in both directions. It is not transient — repeating the message
  // cannot help, because the receiver holds a different revision than this
  // message assumed. And it is not a refusal of the content — the change may
  // be perfectly valid against what they actually have. It means the two sides
  // have diverged, which only a human can resolve.
  const conflict = response.status === 409

  return {
    ok: false,
    terminal: !retryable,
    conflict,
    statusCode: response.status,
    error: explain(response.status, snippet),
    snippet,
    ack: conflict ? readAck(snippet) : null,
  }
}

async function readSnippet(response: Response): Promise<string | null> {
  try {
    const text = await response.text()
    return text.slice(0, RESPONSE_SNIPPET_LENGTH) || null
  } catch {
    return null
  }
}

/**
 * The receiver's own identifiers, if it sent any.
 *
 * Everything about this is optional and nothing about it can fail the delivery.
 * A receiver that answers `200 OK` with an empty body has accepted the order,
 * and a receiver that answers with HTML has too — we simply learn nothing about
 * what they called it.
 */
function readAck(snippet: string | null): SyncAck | null {
  if (!snippet) return null
  try {
    const parsed = JSON.parse(snippet) as Record<string, unknown>
    const order = (parsed.order ?? parsed) as Record<string, unknown>
    const id = order.orderId ?? order.id
    const number = order.orderNumber ?? order.number
    // Read from the top level as well as from `order`: a 409 is a refusal, not
    // an order, and a receiver reporting which version it holds puts that
    // beside the error rather than inside an order object it is declining to
    // send. Without this the conflict is detected but not explained, and the
    // merchant is told the two sides disagree without being told how.
    const revision = parsed.revision ?? order.revision
    return {
      orderId: typeof id === 'string' ? id : null,
      orderNumber: typeof number === 'string' ? number : null,
      revision: typeof revision === 'number' ? revision : undefined,
    }
  } catch {
    return null
  }
}

function explain(status: number, snippet: string | null): string {
  const detail = snippet?.trim().slice(0, 200)
  const suffix = detail ? ` — ${detail}` : ''

  if (status === 401 || status === 403) {
    return `The website rejected our key (${status}). Check the secret matches and that its clock is correct.${suffix}`
  }
  if (status === 404) {
    return `There is no endpoint at that address (404). Check the URL and that the handler is deployed.${suffix}`
  }
  if (status === 409) {
    return `The website says it holds a different version of this order (409). Somebody changed it in both places; compare the two and resend.${suffix}`
  }
  if (status === 429) {
    return `The website is rate limiting us (429). It will be retried.${suffix}`
  }
  if (status >= 500) {
    return `The website answered ${status}. It will be retried.${suffix}`
  }
  return `The website refused the order with ${status}.${suffix}`
}

function describe(cause: unknown): string {
  const code = (cause as { cause?: { code?: string } })?.cause?.code
  if (code === 'ENOTFOUND') return 'the hostname does not resolve'
  if (code === 'ECONNREFUSED') return 'the connection was refused'
  if (code === 'ECONNRESET') return 'the connection was reset'
  if (code === 'CERT_HAS_EXPIRED') return 'its TLS certificate has expired'
  return cause instanceof Error ? cause.message : 'unknown error'
}
