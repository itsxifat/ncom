import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The HMAC scheme NCOM uses in both directions.
 *
 * Outbound webhooks (NCOM → merchant) and catalogue reads (NCOM → merchant's
 * connector) are signed identically, on purpose: a merchant who has already
 * written a webhook verifier can paste the same five lines into their connector
 * and be done. Two schemes would mean two verifiers, two sets of documentation
 * and two chances to get a comparison wrong.
 *
 * Lives in lib rather than in webhookService because the catalogue client must
 * not import the webhook module to sign a GET.
 */

/**
 * Signed over `${timestamp}.${body}` rather than the body alone, so a captured
 * request cannot be replayed hours later against a receiver that checks the age
 * of the timestamp. Receivers are told to reject anything older than five
 * minutes — see the docs page.
 *
 * A request with no body (every catalogue GET) signs the empty string. The
 * signature then proves two things: the caller holds the secret, and the
 * request is fresh. It deliberately does not bind the path — a read key may
 * read every read endpoint anyway, and path canonicalisation across Apache,
 * nginx, WordPress rewrites and CDN normalisation is exactly the kind of detail
 * that makes signatures fail for honest integrators.
 */
export function signPayload(
  secret: string,
  timestamp: number,
  body: string
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')
}

/** The `t=…,v1=…` header value a receiver checks. */
export function signatureHeader(
  secret: string,
  timestamp: number,
  body: string
): string {
  return `t=${timestamp},v1=${signPayload(secret, timestamp, body)}`
}

/** The verification a receiver performs, exposed so our own tests use it too. */
export function verifySignature(
  secret: string,
  header: string,
  body: string,
  toleranceSeconds = 300
): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((piece) => {
      const [key, ...rest] = piece.trim().split('=')
      return [key, rest.join('=')]
    })
  )

  const timestamp = Number(parts.t)
  const provided = parts.v1
  if (!Number.isFinite(timestamp) || !provided) return false
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false

  const expected = signPayload(secret, timestamp, body)
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(provided, 'hex')
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false, and a wrong-length signature is wrong regardless.
  return a.length === b.length && timingSafeEqual(a, b)
}
