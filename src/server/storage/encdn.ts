import 'server-only'
import { createHmac } from 'crypto'
import { env } from '@/lib/env'

/**
 * EnCDN assigns its own UUID filename on upload — there is no
 * "upload to this key" endpoint — so `filename` is the only handle we get
 * back, and it is what deletion and URL signing are keyed on. It is stored
 * on `MediaAsset.storageKey`.
 */
export interface CdnUpload {
  /** EnCDN's media id — kept alongside the filename for delete-by-id. */
  id: string
  filename: string
  /** Delivery URL to persist on the asset and embed in rendered pages. */
  url: string
}

/**
 * The `expires` value used for lifetime (never-expiring) signed URLs —
 * 9999-12-31T23:59:59Z, per the EnCDN docs.
 */
const LIFETIME_EXPIRES = 253402300799

const REQUEST_TIMEOUT_MS = 30_000

/** Attempts per upload, including the first. */
const MAX_UPLOAD_ATTEMPTS = 4

/**
 * Longest we wait between upload attempts.
 *
 * EnCDN rate-limits uploads, and a catalogue import is exactly the shape of
 * traffic that trips it: a few hundred images pushed back to back. A rejection
 * here is not an image problem — `resolveProductImages` runs before the product
 * write, so a throttled upload fails the *whole product*, and the caller sees a
 * catalogue that imported with half its artwork missing and no obvious reason.
 * Waiting a few seconds is strictly better than losing the product.
 *
 * Capped rather than unbounded because this runs inside a request: honouring a
 * `Retry-After` of several minutes would hang the batch until the proxy times
 * it out, which loses the rows that already succeeded. If the wait is longer
 * than this, the upload gives up and says so.
 */
const MAX_RETRY_WAIT_MS = 15_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * How long to wait before retrying, or null if we should not.
 *
 * Prefers the server's `Retry-After` over a guess — it knows when its window
 * rolls over and we do not.
 */
function retryDelayMs(response: Response, attempt: number): number | null {
  if (response.status !== 429 && response.status < 500) return null

  const header = response.headers.get('retry-after')
  const seconds = Number(header)
  const advised =
    Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : null

  // Exponential fallback for a server that throttles without advising: 1s, 2s, 4s.
  const wait = advised ?? 2 ** (attempt - 1) * 1_000

  return wait <= MAX_RETRY_WAIT_MS ? wait : null
}

/** EnCDN filenames are `<uuid>.<ext>`; anything else can't be one of ours. */
const CDN_FILENAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

const baseUrl = env.CDN_BASE_URL.replace(/\/$/, '')

function authHeaders(): Record<string, string> {
  return {
    'X-CDN-API-Key': env.CDN_API_KEY,
    'X-CDN-API-Secret': env.CDN_API_SECRET,
  }
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null)
  return typeof body?.error === 'string' ? body.error : fallback
}

/**
 * Signs a delivery URL that never expires. Signed URLs bypass EnCDN's
 * domain locking entirely, which is what makes them the right default
 * here: tenant sites are served from arbitrary subdomains and customer
 * domains, so a `Referer` whitelist could never be kept in sync with them.
 *
 * The trade-off is that rotating `CDN_API_SECRET` invalidates every URL
 * already stored in the database — see the README.
 */
export function signLifetimeUrl(clientId: string, filename: string): string {
  const token = createHmac('sha256', env.CDN_API_SECRET)
    .update(`${clientId}/${filename}|${LIFETIME_EXPIRES}`)
    .digest('hex')

  return `${baseUrl}/d/${clientId}/${filename}?expires=${LIFETIME_EXPIRES}&token=${token}`
}

/**
 * EnCDN embeds the client id in every `publicUrl` it returns
 * (`/d/:clientId/:filename`), so signing needs no extra configuration —
 * `CDN_CLIENT_ID` only exists as an override.
 */
function clientIdFrom(publicUrl: string): string {
  if (env.CDN_CLIENT_ID) return env.CDN_CLIENT_ID

  const match = /\/d\/([^/]+)\//.exec(publicUrl)
  if (!match) {
    throw new Error(
      'Could not read the CDN client id from the upload response — set CDN_CLIENT_ID'
    )
  }
  return match[1]
}

export async function uploadToCdn(
  body: Buffer,
  fileName: string,
  contentType: string
): Promise<CdnUpload> {
  let response: Response

  for (let attempt = 1; ; attempt++) {
    // Rebuilt per attempt: a FormData body is a stream, and the first send
    // consumes it — reusing it would upload an empty file on the retry.
    const form = new FormData()
    // The Blob's `type` becomes the part's Content-Type header. EnCDN
    // rejects the upload outright without it (`Invalid file type`), so this
    // is load-bearing, not incidental.
    form.append(
      'file',
      new Blob([new Uint8Array(body)], { type: contentType }),
      fileName
    )

    response = await fetch(`${baseUrl}/api/media/upload`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (response.ok) break

    const wait =
      attempt < MAX_UPLOAD_ATTEMPTS ? retryDelayMs(response, attempt) : null
    if (wait === null) {
      throw new Error(await readError(response, 'Upload to the CDN failed'))
    }

    await sleep(wait)
  }

  const { media } = await response.json()
  if (!media?.filename || !media?.publicUrl) {
    throw new Error('Unexpected response from the CDN')
  }

  return {
    id: media.id,
    filename: media.filename,
    url: env.CDN_SIGNED_URLS
      ? signLifetimeUrl(clientIdFrom(media.publicUrl), media.filename)
      : media.publicUrl,
  }
}

/**
 * Deletes a file we own. A `404` means it is already gone, which is the
 * desired end state for every caller here, so it is treated as success.
 */
export async function deleteFromCdn(filename: string): Promise<void> {
  if (!CDN_FILENAME.test(filename)) {
    throw new Error('Invalid CDN filename')
  }

  const response = await fetch(
    `${baseUrl}/api/media/file/${encodeURIComponent(filename)}`,
    {
      method: 'DELETE',
      headers: authHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }
  )

  if (!response.ok && response.status !== 404) {
    throw new Error(await readError(response, 'Deleting from the CDN failed'))
  }
}
