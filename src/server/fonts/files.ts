import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { redis } from '@/server/redis/client'

/**
 * The font files behind a proxied Google Fonts stylesheet (see
 * `./stylesheet.ts`), fetched from Google once per server and kept on disk.
 *
 * The storefront's CSP allows fonts only from 'self', and a shopper's browser
 * should never have to reach Google, so every `fonts.gstatic.com` URL in a
 * stylesheet is rewritten to `/api/fonts/file/…` on our own origin and served
 * from here. This is the one place in the app that fetches a URL built from
 * request input, so it is deliberately narrow: the host is fixed, only files
 * our own stylesheets point at are accepted, each piece is checked against a
 * strict pattern, and only bytes that are actually a font are ever served or
 * stored.
 */

export const GSTATIC_ORIGIN = 'https://fonts.gstatic.com'

/** Where the font files in a proxied stylesheet point; this route serves them. */
export const FONT_FILE_PATH = '/api/fonts/file/'

/**
 * `s/<family>/<version>/<file>`, as Google writes them
 * (`s/lexend/v26/wlpwgwvFAVdoq2_v-6QU82RHaA.woff2`). The file may not start
 * with a dot, which rules out `.` and `..` however they were encoded on the
 * way in, and a decoded `%2F` cannot match any piece at all.
 */
const STATIC_FAMILY = /^[a-z0-9]{1,100}$/
const STATIC_VERSION = /^v\d{1,4}$/
const STATIC_FILE = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,299}\.(woff2|ttf)$/
/** A 200-letter specimen makes a kit of about 850 characters. */
const QUERY_VALUE = /^[A-Za-z0-9._-]{1,1024}$/

/** An `l/` file is addressed by this query; a static file has none. */
const KIT_QUERY = ['kit', 'skey', 'v'] as const

/**
 * The files a page stylesheet (not a specimen) points at that are not a
 * static woff2, by URL hash; see `rememberPageFiles`. Longer-lived than the
 * stylesheet's own cache entry, so a browser still holding a stylesheet whose
 * entry has just expired finds its files accepted and kept too.
 */
const PAGE_FILE_PREFIX = 'fonts:page-file:v1:'
const PAGE_FILE_TTL_SECONDS = 30 * 24 * 60 * 60

/**
 * Google's largest slices are a few hundred KB, and a picker specimen is a
 * few KB. Each file being fetched is held in memory until it has all arrived,
 * so the cap is kept close to what is real.
 */
const MAX_FILE_BYTES = 2 * 1024 * 1024

/**
 * The disk cache's ceiling. Google's static files are a finite set but a big
 * one, and anyone can ask for any of them, so without a ceiling the cache is a
 * way to fill the server's disk. Past it, the files used longest ago are
 * deleted down to `CACHE_TRIM_TO_BYTES`, so the cache keeps working under any
 * churn instead of freezing full, and the trimming happens once per hundred
 * MB of new files rather than on every write.
 */
const MAX_CACHE_BYTES = 1024 * 1024 * 1024
const CACHE_TRIM_TO_BYTES = MAX_CACHE_BYTES * 0.9

/**
 * A served file's time on disk is moved forward when it is this old, so the
 * files storefronts keep loading are the last to be trimmed. Once a day per
 * file is enough to tell those from files nobody has asked for in weeks, and
 * saves a write on every request.
 */
const TOUCH_AFTER_MS = 24 * 60 * 60 * 1000

const FETCH_TIMEOUT_MS = 8_000

const CACHE_DIR = path.join(os.tmpdir(), 'ncom-font-files')

/** A file this route will serve, and whether it is worth keeping on disk. */
export interface FontSource {
  url: URL
  keep: boolean
}

export interface FontFile {
  body: Uint8Array<ArrayBuffer>
  size: number
  contentType: string
}

/**
 * The fonts.gstatic.com file a request to `/api/fonts/file/<segments>` stands
 * for, or null when it is not one our stylesheets point at.
 *
 *   s/<family>/<version>/<file>.woff2   a static file, what nearly every
 *                                       stylesheet is made of
 *   l/font?kit=…&skey=…&v=…             a file Google cuts to order: every
 *                                       `text=` specimen, and now and then
 *                                       the faces of a variable family
 *   s/<family>/<version>/<file>.ttf     the few families Google sends even
 *                                       Chrome as TrueType (Chiron Hei HK)
 *
 * A static woff2 is accepted as it is. The other two are accepted, and kept
 * on disk, only when a page stylesheet pointed at them: Google still hosts a
 * multi-megabyte TTF of every family for old browsers, which no stylesheet of
 * ours ever asks for, and anyone can mint new `l/` files at Google by changing
 * a specimen's text. A specimen is still served, since the picker needs it,
 * but never kept: the merchant's browser holds it for a year, nobody else
 * asks for the same one, and on disk it would only push out the files
 * storefronts load.
 */
export async function fontFileSource(
  segments: string[],
  search: URLSearchParams
): Promise<FontSource | null> {
  const url = gstaticFileUrl(segments, search)
  if (!url) return null
  if (url.pathname.endsWith('.woff2')) return { url, keep: true }
  const onPage = await isPageFile(url)
  if (url.pathname.startsWith('/l/')) return { url, keep: onPage }
  return onPage ? { url, keep: true } : null
}

/** The gstatic URL for a path of one of the shapes above; its shape only. */
function gstaticFileUrl(
  segments: string[],
  search: URLSearchParams
): URL | null {
  let url: URL
  if (segments[0] === 's') {
    const [, family, version, file] = segments
    if (
      segments.length !== 4 ||
      !STATIC_FAMILY.test(family) ||
      !STATIC_VERSION.test(version) ||
      !STATIC_FILE.test(file)
    ) {
      return null
    }
    url = new URL(`${GSTATIC_ORIGIN}/s/${family}/${version}/${file}`)
  } else if (segments[0] === 'l') {
    if (segments.length !== 2 || segments[1] !== 'font') return null
    url = new URL(`${GSTATIC_ORIGIN}/l/font`)
    for (const name of KIT_QUERY) {
      const value = search.get(name)
      if (!value || !QUERY_VALUE.test(value)) return null
      url.searchParams.set(name, value)
    }
  } else {
    return null
  }

  // Nothing above can move the request off Google's font host; this is the
  // check that would catch it if a later change made that possible.
  return url.origin === GSTATIC_ORIGIN ? url : null
}

/**
 * Records the files a page stylesheet points at beyond static woff2s, so the
 * file route accepts and keeps them (see `fontFileSource`). Bounded by the
 * families on Google Fonts, whatever anyone sends: only stylesheets for known
 * families, without a specimen, come through here.
 */
export async function rememberPageFiles(css: string): Promise<void> {
  const keys: string[] = []
  for (const [, source] of css.matchAll(/url\(([^)]*)\)/g)) {
    if (!source.startsWith(FONT_FILE_PATH)) continue
    const address = new URL(source, GSTATIC_ORIGIN)
    const url = gstaticFileUrl(
      address.pathname.slice(FONT_FILE_PATH.length).split('/'),
      address.searchParams
    )
    if (url && !url.pathname.endsWith('.woff2')) {
      keys.push(`${PAGE_FILE_PREFIX}${urlHash(url)}`)
    }
  }
  if (keys.length === 0) return
  try {
    const batch = redis.pipeline()
    for (const key of keys) batch.set(key, '1', 'EX', PAGE_FILE_TTL_SECONDS)
    await batch.exec()
  } catch {
    // Best-effort: such a file is then refused, or served without being kept,
    // until the stylesheet is next fetched.
  }
}

async function isPageFile(url: URL): Promise<boolean> {
  try {
    return (await redis.exists(`${PAGE_FILE_PREFIX}${urlHash(url)}`)) === 1
  } catch {
    return false
  }
}

/**
 * A font file from Google, from the disk cache when it has been fetched
 * before. Null when Google does not have it, cannot be reached, answers with
 * something that is not a font, or `mayFetch` says this caller has fetched
 * enough from Google for now. `mayFetch` is asked only when a fetch is about
 * to start: a file on disk, or one already on its way for someone else,
 * costs Google nothing.
 */
export async function getFontFile(
  { url, keep }: FontSource,
  mayFetch: () => Promise<boolean>
): Promise<FontFile | null> {
  const file = cachePath(url)
  if (keep) {
    const cached = await openCached(file)
    if (cached) return cached
  }

  let load = pending.get(file)
  if (!load) {
    if (!(await mayFetch())) return null
    // Another request may have started the same fetch while this one waited.
    load = pending.get(file)
  }
  if (!load) {
    load = fetchFont(url)
    pending.set(file, load)
    // The entry stays until the file is on disk, so a request arriving in
    // between joins this fetch rather than starting a second one. The write
    // is not awaited by the caller: the font goes out as soon as it arrives.
    void load
      .then(async (bytes) => {
        if (keep && bytes) await writeCached(file, bytes)
      })
      .catch(() => {})
      .finally(() => pending.delete(file))
  }
  const bytes = await load
  const contentType = bytes && fontContentType(bytes)
  return bytes && contentType
    ? { body: bytes, size: bytes.byteLength, contentType }
    : null
}

/** Fetches in progress, by cache path: a page's first visitors share one. */
const pending = new Map<string, Promise<Uint8Array<ArrayBuffer> | null>>()

function urlHash(url: URL): string {
  return createHash('sha256').update(url.href).digest('hex')
}

function cachePath(url: URL): string {
  return path.join(CACHE_DIR, urlHash(url))
}

async function fetchFont(url: URL): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const response = await fetch(url, {
      // A redirect would be the one way off fonts.gstatic.com; Google's font
      // files never redirect, so one is treated as a failure.
      redirect: 'error',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      return null
    }
    if (Number(response.headers.get('content-length')) > MAX_FILE_BYTES) {
      await response.body.cancel()
      return null
    }
    const bytes = await readCapped(response.body, MAX_FILE_BYTES)
    return bytes && fontContentType(bytes) ? bytes : null
  } catch {
    return null
  }
}

/** The body, or null once it passes `max` bytes — whatever Content-Length said. */
async function readCapped(
  body: ReadableStream<Uint8Array>,
  max: number
): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/**
 * The type a font file is, read from its first bytes rather than taken from a
 * header: what this route serves and stores is then guaranteed to be one of
 * the two formats our stylesheets use, and a file read back from disk carries
 * its type with it.
 */
function fontContentType(bytes: Uint8Array): string | null {
  switch (String.fromCharCode(...bytes.subarray(0, 4))) {
    case 'wOF2':
      return 'font/woff2'
    case '\x00\x01\x00\x00':
    case 'true':
      return 'font/ttf'
    default:
      return null
  }
}

/**
 * A cached file, read whole. Font files are capped at a couple of megabytes
 * (most are tens of kilobytes), and reading one at once means the file is
 * closed before the response starts: a stream instead held a handle open
 * until garbage collection whenever the body was never read — every HEAD
 * request, every browser that left early.
 */
async function openCached(file: string): Promise<FontFile | null> {
  try {
    const info = await stat(file)
    if (info.size > MAX_FILE_BYTES) return null
    const bytes = new Uint8Array(await readFile(file))
    const contentType = fontContentType(bytes)
    if (!contentType) return null
    if (Date.now() - info.mtimeMs > TOUCH_AFTER_MS) {
      const now = new Date()
      await utimes(file, now, now).catch(() => {})
    }
    return { body: bytes, size: bytes.byteLength, contentType }
  } catch {
    return null
  }
}

async function writeCached(
  file: string,
  bytes: Uint8Array<ArrayBuffer>
): Promise<void> {
  if (!(await reserveDiskSpace(bytes.byteLength))) return
  const temp = `${file}.${randomUUID()}.tmp`
  try {
    await mkdir(CACHE_DIR, { recursive: true })
    await writeFile(temp, bytes)
    // A reader sees no file or the whole file, never a half-written one.
    // When two servers race, the second rename simply replaces identical
    // bytes (or fails on Windows, which is just as good).
    await rename(temp, file)
  } catch {
    if (usedBytes !== undefined) usedBytes -= bytes.byteLength
    await unlink(temp).catch(() => {})
  }
}

/**
 * Bytes in the disk cache: measured once per process and again whenever it is
 * trimmed, and kept up to date in between. An estimate is all the ceiling
 * needs, so a write that lands while the cache is being measured may go
 * uncounted until the next time.
 */
let usedBytes: number | undefined
let trimming: Promise<void> | undefined

async function reserveDiskSpace(bytes: number): Promise<boolean> {
  if (usedBytes === undefined || usedBytes + bytes > MAX_CACHE_BYTES) {
    trimming ??= trimCache().finally(() => {
      trimming = undefined
    })
    await trimming
  }
  if (usedBytes === undefined || usedBytes + bytes > MAX_CACHE_BYTES) {
    return false
  }
  usedBytes += bytes
  return true
}

/**
 * Measures the cache and, when it is over `CACHE_TRIM_TO_BYTES`, deletes the
 * files used longest ago until it is under. A temp file left behind by a crash
 * is as old as the crash, so it goes early.
 */
async function trimCache(): Promise<void> {
  const files: { name: string; size: number; time: number }[] = []
  try {
    for (const entry of await readdir(CACHE_DIR, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      const info = await stat(path.join(CACHE_DIR, entry.name)).catch(
        () => null
      )
      if (info) {
        files.push({ name: entry.name, size: info.size, time: info.mtimeMs })
      }
    }
  } catch {
    // No directory yet: nothing has been cached.
  }

  let total = files.reduce((sum, file) => sum + file.size, 0)
  if (total > CACHE_TRIM_TO_BYTES) {
    files.sort((a, b) => a.time - b.time)
    for (const file of files) {
      if (total <= CACHE_TRIM_TO_BYTES) break
      // A file another request is sending right now stays readable on Linux;
      // where it cannot be deleted (Windows), it is simply kept.
      const deleted = await unlink(path.join(CACHE_DIR, file.name)).then(
        () => true,
        () => false
      )
      if (deleted) total -= file.size
    }
  }
  usedBytes = total
}
