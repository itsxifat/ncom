import 'server-only'
import { redis } from '@/server/redis/client'
import { findGoogleFont, type GoogleFont } from '@/lib/google-fonts'
import { FONT_FILE_PATH, GSTATIC_ORIGIN, rememberPageFiles } from './files'

/**
 * Stylesheets for Google Fonts families outside the self-hosted catalogue,
 * fetched from Google once and served from NCOM's own origin
 * (`/api/fonts/css`, linked by `fontStylesheetHref` in lib/fonts.ts).
 *
 * Each family is fetched and cached on its own, then the pieces are joined: a
 * family shared by many pages is one cache entry whatever it is paired with,
 * and one family Google refuses — renamed, or gone since the snapshot was
 * taken — cannot take the others on the page down with it, which a single
 * multi-family request to Google would.
 */

/** Families one stylesheet loads. A page uses two or three. */
export const MAX_FAMILIES = 12

/**
 * Families one specimen (`text=`) stylesheet loads. The font picker asks for
 * one family at a time; anything more is not the picker, and every specimen
 * is a fetch from Google (see `familyStylesheet`).
 */
const MAX_SPECIMEN_FAMILIES = 2

/** Distinct characters a specimen stylesheet asks for. */
const MAX_SPECIMEN_CHARACTERS = 200

const GOOGLE_CSS_ENDPOINT = 'https://fonts.googleapis.com/css2'

/**
 * Google picks the format from the User-Agent. A current desktop Chrome gets
 * woff2 split into unicode-range subsets, so a shopper downloads only the
 * Bangla and Latin slices a page actually sets; anything Google does not
 * recognise gets one TTF per weight with every script in it.
 */
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

/** Regular through bold: the weights page text is set in. */
const PAGE_WEIGHTS = [400, 500, 600, 700]

/**
 * Short, because a page links this stylesheet in its head: a slow answer from
 * Google holds up the page, so it is better to give up and set the fallback.
 */
const FETCH_TIMEOUT_MS = 3_000

/** Families with every script, such as Noto Sans JP, run to a few hundred KB. */
const MAX_CSS_BYTES = 1024 * 1024

/**
 * Page stylesheets only, one entry per family, so the keys are bounded by the
 * snapshot. Bump the version when what is fetched or recorded for a family
 * changes, so old entries are not reused. v2: fetching a stylesheet now also
 * records its files for the file route (`rememberPageFiles`), which entries
 * cached before that never did.
 */
const CACHE_PREFIX = 'fonts:css:v2:'
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60

/**
 * A failure is remembered briefly, so a Google outage costs one slow request
 * per family every couple of minutes rather than one per page view — and the
 * font is back soon after Google is.
 */
const FAILURE_TTL_SECONDS = 2 * 60

export interface FontStylesheet {
  css: string
  /** False when a family could not be fetched just now and is missing from `css`. */
  complete: boolean
}

/**
 * The @font-face rules for these families, with every font file pointing at
 * NCOM's own `/api/fonts/file/` route. Names that are not Google families are
 * skipped, which is also what keeps anything but a known family name out of
 * the request to Google. `text` asks for just the letters of a specimen.
 *
 * `mayFetch` is asked once for each family that has to come from Google, just
 * before it is fetched, so the caller can charge its rate limit for the work
 * Google is actually asked to do rather than per request. A family it refuses
 * is left out, as if Google had not answered.
 */
export async function googleFontStylesheet(
  names: string[],
  text: string | null,
  mayFetch: () => Promise<boolean>
): Promise<FontStylesheet> {
  const specimen = specimenCharacters(text)
  // Every spelling of a family ("google sans", "Google Sans") finds the same
  // entry, so the set keeps each family once.
  const fonts = [...new Set(names.map((name) => findGoogleFont(name)))]
    .filter((font) => font !== undefined)
    .slice(0, specimen ? MAX_SPECIMEN_FAMILIES : MAX_FAMILIES)

  const sheets = await Promise.all(
    fonts.map((font) => familyStylesheet(font, specimen, mayFetch))
  )
  return {
    css: sheets.filter((sheet) => sheet !== null).join('\n'),
    complete: sheets.every((sheet) => sheet !== null),
  }
}

/**
 * Google subsets by character, not by string, so "Aa আমি" and "আমি Aa" want
 * the same file: keeping each character once, in a fixed order, lets them
 * share one fetch, and keeps a long specimen within the limit.
 */
function specimenCharacters(text: string | null): string {
  if (!text) return ''
  return [...new Set(Array.from(text))]
    .filter((character) => character >= ' ')
    .sort()
    .slice(0, MAX_SPECIMEN_CHARACTERS)
    .join('')
}

/** Fetches in progress, by family and specimen: a page's first visitors share one. */
const pending = new Map<string, Promise<string | null>>()

/**
 * One family's rules, or null when Google could not provide them just now or
 * `mayFetch` refused.
 *
 * A specimen is never kept in Redis. Its text comes from the request, so
 * anyone can make up a new one every time, and keeping each would let one
 * script fill Redis, which also holds the rate limits and design drafts and
 * evicts nothing. The picker's own specimens are one fixed line per family
 * that the merchant's browser keeps for a day, so asking Google each time
 * costs one fetch per family a merchant scrolls past.
 */
async function familyStylesheet(
  font: GoogleFont,
  specimen: string,
  mayFetch: () => Promise<boolean>
): Promise<string | null> {
  const key = `${CACHE_PREFIX}${font.family.toLowerCase().replace(/ /g, '_')}`
  if (!specimen) {
    try {
      const cached = await redis.get(key)
      // An empty entry marks a recent failure.
      if (cached !== null) return cached || null
    } catch {
      // Cache is best-effort; fall through to Google.
    }
  }

  const fetchKey = specimen ? `${key}:${specimen}` : key
  let load = pending.get(fetchKey)
  if (!load) {
    // Refused before anything is fetched or stored, so an address over its
    // limit leaves no failure behind for everyone else's pages.
    if (!(await mayFetch())) return null
    // Another request may have started the same fetch while this one waited.
    load = pending.get(fetchKey)
  }
  if (!load) {
    load = (
      specimen ? fetchFamilyCss(font, specimen) : fetchAndCache(font, key)
    ).finally(() => pending.delete(fetchKey))
    pending.set(fetchKey, load)
  }
  return load
}

async function fetchAndCache(
  font: GoogleFont,
  key: string
): Promise<string | null> {
  const css = await fetchFamilyCss(font, '')
  // Before the stylesheet is cached, so no browser can have it yet and ask
  // for one of its files before the file route knows to keep it.
  if (css) await rememberPageFiles(css)
  try {
    await redis.set(
      key,
      css ?? '',
      'EX',
      css ? CACHE_TTL_SECONDS : FAILURE_TTL_SECONDS
    )
  } catch {
    // Cache is best-effort; the next request asks Google again.
  }
  return css
}

async function fetchFamilyCss(
  font: GoogleFont,
  specimen: string
): Promise<string | null> {
  const weights = weightsToLoad(font, specimen !== '')
  const response = await requestCss(googleCssUrl(font, weights, specimen))
  if (
    !response?.ok ||
    !response.headers.get('content-type')?.startsWith('text/css') ||
    Number(response.headers.get('content-length')) > MAX_CSS_BYTES
  ) {
    await response?.body?.cancel()
    return null
  }
  const css = (await response.text().catch(() => '')).replaceAll(
    `${GSTATIC_ORIGIN}/`,
    FONT_FILE_PATH
  )
  return css.length <= MAX_CSS_BYTES && isFontFacesOnly(css) ? css : null
}

/**
 * Asking Google for a weight a family does not have fails the whole request,
 * so this asks only for ones it has: regular to bold where they exist,
 * otherwise the one nearest regular, so a face cut only in 300 or 700 still
 * loads as itself. A specimen needs just the one. For a family drawn only in
 * italic, such as Molle, these are its italic weights.
 */
function weightsToLoad(font: GoogleFont, specimen: boolean): number[] {
  const wanted = specimen ? [400] : PAGE_WEIGHTS
  const available = wanted.filter((weight) => font.weights.includes(weight))
  if (available.length > 0) return available
  return [
    font.weights.reduce((nearest, weight) =>
      Math.abs(weight - 400) < Math.abs(nearest - 400) ? weight : nearest
    ),
  ]
}

function googleCssUrl(
  font: GoogleFont,
  weights: number[],
  specimen: string
): string {
  const family = encodeURIComponent(font.family).replace(/%20/g, '+')
  // Google refuses an upright a family does not have, so a family drawn only
  // in italic is asked for in italic. A page set in it then uses the italic
  // as its regular face, since there is no other.
  const axes = font.italicOnly
    ? `ital,wght@${weights.map((weight) => `1,${weight}`).join(';')}`
    : `wght@${weights.join(';')}`
  const text = specimen ? `&text=${encodeURIComponent(specimen)}` : ''
  return `${GOOGLE_CSS_ENDPOINT}?family=${family}:${axes}&display=swap${text}`
}

/** Google's answer, or null when it could not be reached in time. */
async function requestCss(url: string): Promise<Response | null> {
  try {
    return await fetch(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch {
    return null
  }
}

/**
 * Whether a rewritten stylesheet is what this route exists to serve: font
 * faces whose files all come from our own file route. It goes into the head
 * of every storefront that uses the family, so anything else — an @import,
 * a url() to another host — is refused rather than passed through.
 */
function isFontFacesOnly(css: string): boolean {
  return (
    css.includes('@font-face') &&
    !/@(?!font-face\b)/.test(css) &&
    css
      .split('url(')
      .slice(1)
      .every((source) => source.startsWith(FONT_FILE_PATH))
  )
}
