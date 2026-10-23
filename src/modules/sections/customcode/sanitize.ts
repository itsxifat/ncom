/**
 * The sanitiser behind the Custom code block.
 *
 * A merchant — or the AI they pasted our prompt into — hands this block a
 * whole designed section: markup and a stylesheet. Rich text gets a dozen
 * inline tags; this gets most of HTML, because a design is made of sections,
 * grids, pictures and icons, and an allow-list too small to draw one would just
 * send people back to pasting code into the custom head script, where nothing
 * checks it at all.
 *
 * It is still an allow-list in every direction, written the same way as
 * `sanitizeHtml.ts`: a tokeniser that can only emit the tags and attributes
 * named below, never a set of "strip the bad things" regexes. Three properties
 * are what make it safe on the builder canvas, which renders on the
 * dashboard's own origin where a script would act as the merchant's team:
 *
 *   No executable markup survives — no `<script>`, no `on*` handler, no
 *   `javascript:` URL, no `<object>`/`<embed>`, no framing except a handful of
 *   video and map hosts, inside a forced sandbox.
 *
 *   Every attribute value is decoded, checked and re-escaped in full, so the
 *   browser decodes it back to exactly the string that was checked. That is
 *   what closes `href="&#106;avascript:…"` and every encoding like it.
 *
 *   No `<` reaches the output except as a tag this file wrote. Text is escaped,
 *   and the stylesheet has every `<` rewritten to its CSS escape, so nothing in
 *   either can close the element it sits in and start markup of its own.
 *
 * Called on render, not on save, for the same reason rich text is: a stored
 * value is untrusted data whatever wrote it.
 */

export const MAX_HTML_LENGTH = 60_000
export const MAX_CSS_LENGTH = 30_000

// ── Markup ────────────────────────────────────────────────────────────

/** Attributes every allowed element may carry, besides aria-* and data-*. */
const GLOBAL_ATTRIBUTES = new Set([
  'class',
  'id',
  'style',
  'title',
  'role',
  'lang',
  'dir',
  'hidden',
  'tabindex',
  'width',
  'height',
])

/** What an SVG element may say about how it is drawn. */
const SVG_ATTRIBUTE_LIST = [
  'viewbox',
  'preserveaspectratio',
  'xmlns',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'stroke-opacity',
  'opacity',
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'transform',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientunits',
  'gradienttransform',
  'spreadmethod',
  'fx',
  'fy',
  'fr',
  'clip-path',
  'clip-rule',
  'mask',
  'maskunits',
  'patternunits',
  'patterncontentunits',
  'patterntransform',
  'font-size',
  'font-family',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'alignment-baseline',
  'letter-spacing',
  'dx',
  'dy',
  'pathlength',
  'vector-effect',
  'color',
  'display',
  'visibility',
  'overflow',
  'marker-start',
  'marker-mid',
  'marker-end',
  'refx',
  'refy',
  'markerwidth',
  'markerheight',
  'markerunits',
  'orient',
  'href',
  'xlink:href',
] as const

/** HTML tag → its own attributes on top of the global ones. */
const HTML_TAGS: Record<string, readonly string[]> = {
  div: [],
  section: [],
  header: [],
  footer: [],
  nav: [],
  article: [],
  aside: [],
  main: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [],
  p: [],
  span: [],
  a: ['href', 'target'],
  img: ['src', 'srcset', 'sizes', 'alt', 'loading', 'decoding'],
  picture: [],
  source: ['src', 'srcset', 'sizes', 'type', 'media'],
  figure: [],
  figcaption: [],
  ul: [],
  ol: ['start', 'reversed', 'type'],
  li: ['value'],
  dl: [],
  dt: [],
  dd: [],
  strong: [],
  em: [],
  b: [],
  i: [],
  u: [],
  s: [],
  small: [],
  mark: [],
  sup: [],
  sub: [],
  br: [],
  hr: [],
  wbr: [],
  blockquote: [],
  q: [],
  cite: [],
  code: [],
  pre: [],
  kbd: [],
  abbr: [],
  address: [],
  time: ['datetime'],
  del: [],
  ins: [],
  label: [],
  table: [],
  thead: [],
  tbody: [],
  tfoot: [],
  tr: [],
  th: ['colspan', 'rowspan', 'scope'],
  td: ['colspan', 'rowspan'],
  caption: [],
  colgroup: ['span'],
  col: ['span'],
  details: ['open'],
  summary: [],
  video: [
    'src',
    'poster',
    'controls',
    'loop',
    'muted',
    'playsinline',
    'preload',
    'autoplay',
  ],
  audio: ['src', 'controls', 'loop', 'muted', 'preload'],
  button: ['type', 'disabled'],
  iframe: ['src', 'title', 'loading'],
}

/**
 * Drawing elements, allowed only inside an `<svg>`. Lowercase: the browser's
 * parser restores `linearGradient` and friends to their proper case itself
 * when it meets them in SVG content.
 *
 * Absent on purpose: `foreignObject` (HTML inside SVG, a classic parser
 * confusion), every `animate*` and `set` (they can rewrite an `href` to a
 * script after the sanitiser has looked), `image` and `feImage` (they fetch),
 * and `script`/`style`.
 */
const SVG_TAGS = new Set([
  'g',
  'path',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'rect',
  'text',
  'tspan',
  'defs',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'mask',
  'pattern',
  'symbol',
  'use',
  'marker',
  'title',
  'desc',
])

const SVG_ATTRIBUTE_SET = new Set<string>(SVG_ATTRIBUTE_LIST)

/** Tags with no closing partner. */
const VOID_TAGS = new Set(['br', 'hr', 'wbr', 'img', 'source', 'col'])

/**
 * Tags removed together with everything inside them.
 *
 * Raw-text elements first — the parser reads their content as text up to the
 * matching close tag, so it has to be skipped the same way rather than
 * tokenised as markup. Then the containers whose contents are never part of a
 * visible design (`template`, a `select`'s options) or are themselves a
 * parser-confusion risk (`math`).
 */
const RAW_TEXT_TAGS = new Set([
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'noscript',
])
const DROPPED_SUBTREES = new Set([
  'template',
  'object',
  'applet',
  'select',
  'math',
  'frameset',
])

/** Dropped without a trace and with no content: they do nothing visible. */
const DROPPED_VOID = new Set([
  'input',
  'embed',
  'link',
  'meta',
  'base',
  'param',
  'track',
  'keygen',
  'frame',
  'slot',
])

/**
 * Hosts an iframe may point at, and the path it must start with.
 *
 * Video and maps — the two things a designed section most often embeds. Each
 * is a cross-origin document running under its own policy, and the frame gets
 * a sandbox on top regardless of what the pasted markup asked for.
 */
const EMBED_HOSTS: { host: string; path: RegExp }[] = [
  { host: 'www.youtube-nocookie.com', path: /^\/embed\// },
  { host: 'player.vimeo.com', path: /^\/video\// },
  { host: 'www.google.com', path: /^\/maps\/embed/ },
  { host: 'www.facebook.com', path: /^\/plugins\/(video|page|post)\.php/ },
]

const IFRAME_SANDBOX =
  'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation'

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  colon: ':',
  tab: '\t',
  newline: '\n',
  sol: '/',
  bsol: '\\',
  lpar: '(',
  rpar: ')',
  period: '.',
  comma: ',',
  excl: '!',
  quest: '?',
  num: '#',
  percnt: '%',
  equals: '=',
  plus: '+',
  lowbar: '_',
  hyphen: '-',
  semi: ';',
  ast: '*',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  times: '×',
  divide: '÷',
  deg: '°',
  laquo: '«',
  raquo: '»',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  sect: '§',
  para: '¶',
}

/**
 * An attribute value as the browser would read it.
 *
 * Numeric references are decoded with or without their semicolon, because the
 * browser decodes `&#106` too. A named reference this table does not know is
 * left as written; since the output re-escapes every `&`, the browser then
 * reads it literally as well — so the string checked here and the string the
 * browser acts on are always the same string.
 */
function decodeEntities(value: string): string {
  return value.replace(
    /&(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});?/g,
    (whole, body: string) => {
      if (body[0] === '#') {
        const code =
          body[1] === 'x' || body[1] === 'X'
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10)
        if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) {
          return '\ufffd'
        }
        return String.fromCodePoint(code)
      }
      // Named references only count with their semicolon here; the ones a
      // browser accepts without one are all in this table's plain set anyway.
      if (!whole.endsWith(';')) return whole
      return NAMED_ENTITIES[body.toLowerCase()] ?? whole
    }
  )
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Text between tags, escaped — but with well-formed character references
 * kept, so `&copy;` and `&nbsp;` in a designer's copy stay what they were.
 * That is safe in text: a reference decodes to characters, never to markup.
 */
function escapeText(value: string): string {
  return value
    .replace(
      /&(?!(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});)/g,
      '&amp;'
    )
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

type UrlKind = 'link' | 'image' | 'media'

/**
 * A URL safe to put in a link, image or media attribute, or nothing.
 *
 * A scheme allow-list, checked after removing every character the browser's
 * URL parser removes (controls and whitespace), so `java\tscript:` cannot
 * pass as a relative path. Anything without a scheme is relative to the shop
 * and allowed — including the `#order` anchors that jump to the order form.
 */
function safeUrl(raw: string, kind: UrlKind): string | undefined {
  const value = raw.trim()
  if (!value) return undefined
  const compact = value
    .replace(/[\u0000-\u0020\u007f-\u009f]/g, '')
    .toLowerCase()
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(compact)?.[1]
  if (!scheme) return value
  if (scheme === 'https' || scheme === 'http') return value
  if (kind === 'link' && (scheme === 'mailto' || scheme === 'tel')) {
    return value
  }
  if (
    kind === 'image' &&
    /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/.test(compact)
  ) {
    return value
  }
  return undefined
}

/**
 * A `srcset` whose every candidate is a plain web address, rebuilt from the
 * parts that were checked, or nothing.
 *
 * Read the way the browser reads one — an address runs to the next space,
 * trailing commas end it, a descriptor runs to the next comma — because
 * Cloudinary-style addresses carry commas of their own, and splitting on
 * every comma would check a different list from the one the browser loads.
 */
function safeSrcset(raw: string): string | undefined {
  const out: string[] = []
  let i = 0
  while (i < raw.length) {
    while (i < raw.length && /[\s,]/.test(raw[i]!)) i += 1
    if (i >= raw.length) break
    let j = i
    while (j < raw.length && !/\s/.test(raw[j]!)) j += 1
    let url = raw.slice(i, j)
    i = j
    let descriptor = ''
    if (url.endsWith(',')) {
      // A loop rather than /,+$/: that pattern restarts at every comma of a
      // long run that does not end the string, which is quadratic.
      let end = url.length
      while (end > 0 && url[end - 1] === ',') end -= 1
      url = url.slice(0, end)
    } else {
      let k = i
      while (k < raw.length && raw[k] !== ',') k += 1
      descriptor = raw.slice(i, k).trim()
      i = k + 1
    }
    // No data: URIs: their commas are exactly what makes a list ambiguous.
    if (/^data:/i.test(url) || !safeUrl(url, 'media')) return undefined
    if (descriptor && !/^\d+(\.\d+)?[wxh]$/.test(descriptor)) return undefined
    out.push(descriptor ? `${url} ${descriptor}` : url)
    if (out.length > 16) break
  }
  return out.length ? out.join(', ') : undefined
}

/** The embed address a pasted iframe may keep, normalised, or nothing. */
function embedSource(raw: string): string | undefined {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return undefined
  }
  if (url.protocol !== 'https:') return undefined
  // YouTube's ordinary host is rewritten to the privacy-preserving one the
  // video block already uses, which is also the one the CSP frames.
  if (url.hostname === 'www.youtube.com' || url.hostname === 'youtube.com') {
    url.hostname = 'www.youtube-nocookie.com'
  }
  const allowed = EMBED_HOSTS.some(
    (entry) => entry.host === url.hostname && entry.path.test(url.pathname)
  )
  return allowed ? url.toString() : undefined
}

const ATTRIBUTE_RE =
  /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

interface ParsedAttribute {
  name: string
  value: string
  /** Written with no value at all, like `controls` or `muted`. */
  bare: boolean
}

function parseAttributes(raw: string): ParsedAttribute[] {
  const out: ParsedAttribute[] = []
  let match: RegExpExecArray | null
  ATTRIBUTE_RE.lastIndex = 0
  while ((match = ATTRIBUTE_RE.exec(raw))) {
    const name = match[1]!.toLowerCase()
    const value = match[2] ?? match[3] ?? match[4]
    out.push({
      name,
      value: value === undefined ? '' : decodeEntities(value),
      bare: value === undefined,
    })
    if (out.length > 64) break
  }
  return out
}

/**
 * A presentation value from an SVG attribute. Only `url(#local-id)` may point
 * anywhere — gradients and clip paths drawn in the same SVG — so no attribute
 * value can make the icon fetch something.
 */
function safeSvgValue(value: string): string | undefined {
  if (!/url\s*\(/i.test(value)) return value
  return /^\s*url\(\s*['"]?#[\w-]+['"]?\s*\)\s*$/i.test(value)
    ? value
    : undefined
}

function sanitizeAttributes(
  tag: string,
  raw: string,
  inSvg: boolean
): string | null {
  const attributes = parseAttributes(raw)
  // The root `<svg>` is drawn by the same rules as everything inside it.
  const svgContext = inSvg || tag === 'svg'
  const own = svgContext ? null : HTML_TAGS[tag]
  const out: string[] = []
  const seen = new Set<string>()
  let blankTarget = false
  let muted = false
  let wantsAutoplay = false

  const keep = (name: string, value?: string) => {
    if (seen.has(name)) return
    seen.add(name)
    out.push(value === undefined ? name : `${name}="${escapeAttribute(value)}"`)
  }

  for (const { name, value, bare } of attributes) {
    if (name.startsWith('on')) continue
    // The builder's own position marker. Written by this file or not at all,
    // or a design could point an edit at somewhere else in its HTML.
    if (name === SOURCE_POSITION_ATTRIBUTE) continue

    const isSvgAttribute = svgContext && SVG_ATTRIBUTE_SET.has(name)
    const allowed =
      GLOBAL_ATTRIBUTES.has(name) ||
      /^aria-[a-z]+$/.test(name) ||
      /^data-[a-z0-9_.-]+$/.test(name) ||
      isSvgAttribute ||
      Boolean(own?.includes(name))
    if (!allowed) continue

    if (name === 'style') {
      const style = sanitizeDeclarations(value)
      if (style) keep('style', style)
      continue
    }

    if (svgContext && (name === 'href' || name === 'xlink:href')) {
      // `<use>` may only point at a symbol in the same SVG. An external
      // reference would load a document this sanitiser never saw.
      if (tag === 'use' && /^#[\w-]+$/.test(value.trim())) {
        keep('href', value.trim())
      }
      continue
    }

    if (isSvgAttribute && !GLOBAL_ATTRIBUTES.has(name)) {
      if (name === 'xmlns') {
        if (value === 'http://www.w3.org/2000/svg') keep(name, value)
        continue
      }
      const safe = safeSvgValue(value)
      if (safe !== undefined) keep(name, safe)
      continue
    }

    switch (name) {
      case 'href': {
        const href = safeUrl(value, 'link')
        if (href) keep('href', href)
        break
      }
      case 'src': {
        if (tag === 'iframe') {
          const src = embedSource(value)
          if (!src) return null
          keep('src', src)
          break
        }
        const src = safeUrl(value, tag === 'img' ? 'image' : 'media')
        if (src) keep('src', src)
        break
      }
      case 'poster': {
        const poster = safeUrl(value, 'image')
        if (poster) keep('poster', poster)
        break
      }
      case 'srcset': {
        const srcset = safeSrcset(value)
        if (srcset) keep('srcset', srcset)
        break
      }
      case 'target':
        if (value === '_blank') {
          blankTarget = true
          keep('target', '_blank')
        } else if (value === '_self') {
          keep('target', '_self')
        }
        break
      case 'type':
        // A button only ever clicks: there is no form for it to submit.
        if (tag !== 'button') keep('type', value)
        break
      case 'loading':
        if (value === 'lazy' || value === 'eager') keep(name, value)
        break
      case 'tabindex':
        if (/^-?\d{1,3}$/.test(value.trim())) keep(name, value.trim())
        break
      case 'muted':
        muted = true
        keep('muted')
        break
      case 'autoplay':
        wantsAutoplay = true
        break
      default:
        if (bare) keep(name)
        else keep(name, value)
    }
  }

  if (tag === 'iframe') {
    if (!seen.has('src')) return null
    keep('sandbox', IFRAME_SANDBOX)
    keep('allow', 'encrypted-media; picture-in-picture; fullscreen')
    keep('allowfullscreen')
    keep('referrerpolicy', 'strict-origin-when-cross-origin')
    if (!seen.has('loading')) keep('loading', 'lazy')
  }
  if (tag === 'button') keep('type', 'button')
  // Autoplay only for a muted video — sound that starts on its own is the
  // one thing a visitor never forgives a page for.
  if (tag === 'video' && wantsAutoplay && muted) keep('autoplay')
  if (tag === 'a' && blankTarget) keep('rel', 'noopener noreferrer')

  return out.length ? ` ${out.join(' ')}` : ''
}

/**
 * Where a tag ends, as a lookup: given the index just past a tag's name, the
 * index just past its closing `>`, or -1 when it has none.
 *
 * A tag runs to the first `>` outside a quoted value, and a quote that never
 * closes means it never ends — the reading of the pattern
 * `(?:[^>"']|"[^"]*"|'[^']*')*>`, walked by hand. As a pattern retried at
 * every `<`, `<a<a<a…` with no `>` made it read to the end of the input once
 * per `<`: seconds of server time for one pasted block, on every render. A
 * walk from any position always takes the same path, so once one is made its
 * answer holds for every position on that path; writing it down there means
 * no later walk crosses the same stretch again, and the whole input is read a
 * fixed number of times however it is built.
 */
function tagEndFinder(source: string): (from: number) => number {
  // 0 = not walked yet, -1 = never ends, otherwise the index past the `>`.
  const known = new Int32Array(source.length + 1)
  return (from) => {
    let i = from
    let end = -1
    while (i < source.length) {
      if (known[i] !== 0) {
        end = known[i]!
        break
      }
      const char = source[i]
      if (char === '>') {
        end = i + 1
        break
      }
      if (char === '"' || char === "'") {
        const close = source.indexOf(char, i + 1)
        if (close === -1) break
        i = close + 1
      } else {
        i += 1
      }
    }
    // The same path again, writing the answer down at every step of it.
    for (let j = from; j < i;) {
      known[j] = end
      const char = source[j]
      j = char === '"' || char === "'" ? source.indexOf(char, j + 1) + 1 : j + 1
    }
    if (i < source.length) known[i] = end
    return end
  }
}

/** Index of the first value in an ascending list that is at least `value`. */
function firstAtOrAfter(sorted: readonly number[], value: number): number {
  let low = 0
  let high = sorted.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (sorted[mid]! < value) low = mid + 1
    else high = mid
  }
  return low
}

/**
 * The attribute that tells the builder where in the merchant's HTML an
 * element was written: the index of its `<` in the source.
 *
 * Only added for the canvas (`annotate`), where it is what lets a merchant
 * double-click a sentence in a pasted design and retype it — the edit is
 * written back at exactly that place in their HTML. Never on a live page.
 */
export const SOURCE_POSITION_ATTRIBUTE = 'data-ncom-at'

export interface CustomCodeOptions {
  /** Mark each HTML element with where it starts in the source. Canvas only. */
  annotate?: boolean
}

/**
 * Sanitised markup for the Custom code block, plus the CSS that was written
 * inside `<style>` elements in it.
 *
 * Pasted code often arrives as a whole page — `<html>`, a `<head>` with a
 * `<style>`, then the body. The design lives in that stylesheet, so rather
 * than dropping it the text is handed back to be sanitised as CSS with the
 * block's own stylesheet; the document shell (`html`, `head`, `body`) is
 * unwrapped and its contents kept.
 */
export function sanitizeCustomHtml(
  input: unknown,
  options: CustomCodeOptions = {}
): {
  html: string
  css: string
} {
  if (typeof input !== 'string' || !input) return { html: '', css: '' }
  const source = input.slice(0, MAX_HTML_LENGTH).replace(/\u0000/g, '')
  // Positions index the HTML as stored. Removing NULs would shift them, so a
  // design with any (there is never a reason to) is simply not marked.
  const annotate = Boolean(options.annotate) && !input.includes('\u0000')

  const out: string[] = []
  const styles: string[] = []
  const open: string[] = []
  let cursor = 0
  let textStart = 0

  // The start of a tag: `<`, an optional `/`, its name. Where it ends is
  // `tagEnd`'s job.
  const TAG_NAME_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)/y
  const tagEnd = tagEndFinder(source)

  const flushText = (end: number) => {
    if (end > textStart) out.push(escapeText(source.slice(textStart, end)))
  }

  /** Index just past the close tag of a raw-text element, or the end. */
  const skipRawText = (tag: string, from: number) => {
    // The first `</tag`, then the next `>` — not one pattern reading to a
    // `>` from each `</tag` in turn, which with no `>` left scanned the rest
    // of the input once per close tag. With no `>` after the first one, no
    // later one has one either.
    const close = new RegExp(`</${tag}(?=[\\s/>])`, 'ig')
    close.lastIndex = from
    const found = close.exec(source)
    const gt = found ? source.indexOf('>', close.lastIndex) : -1
    if (!found || gt === -1) {
      return { contentEnd: source.length, next: source.length }
    }
    return { contentEnd: found.index, next: gt + 1 }
  }

  /**
   * Every open and close tag of one dropped container from `start` on, read
   * in one pass, and for each gap between them, where a container opened in
   * that gap would close: the end of the first tag after it that takes the
   * depth below the depth there, or -1.
   *
   * Read once per tag name rather than once per opener, because a container
   * that never closes keeps its content, and a fresh scan to the end of the
   * input for each opener made `<math><math><math>…` quadratic.
   */
  const readSubtree = (tag: string, start: number) => {
    const starts: number[] = []
    const ends: number[] = []
    const closes: number[] = [-1]
    const gapDepths: number[] = [0]
    // Gaps still waiting for their close, shallowest at the bottom.
    const waiting: number[] = [0]
    let depth = 0
    const pattern = new RegExp(`<(/?)${tag}(?=[\\s/>])`, 'ig')
    pattern.lastIndex = start
    let match: RegExpExecArray | null
    while ((match = pattern.exec(source))) {
      const end = tagEnd(pattern.lastIndex)
      if (end === -1) {
        pattern.lastIndex = match.index + 1
        continue
      }
      pattern.lastIndex = end
      depth += match[1] ? -1 : 1
      while (
        waiting.length &&
        gapDepths[waiting[waiting.length - 1]!]! > depth
      ) {
        closes[waiting.pop()!] = end
      }
      starts.push(match.index)
      ends.push(end)
      closes.push(-1)
      gapDepths.push(depth)
      waiting.push(closes.length - 1)
    }
    return { starts, ends, closes }
  }
  const subtrees = new Map<string, ReturnType<typeof readSubtree>>()
  let rereads = 0

  /** Index just past the matching close of a dropped container. */
  const skipSubtree = (tag: string, from: number) => {
    let read = subtrees.get(tag)
    // The first of the container's tags at or after `from`.
    let first = read ? firstAtOrAfter(read.starts, from) : 0
    // A tag from the earlier reading that runs on past `from` means that
    // reading is out of step with this one, so read again from here. Only
    // crafted markup needs that more than a few times; past a few, the tag
    // is dropped alone, as one never closed is.
    if (!read || (first > 0 && read.ends[first - 1]! > from)) {
      if (read && ++rereads > 16) return from
      read = readSubtree(tag, from)
      subtrees.set(tag, read)
      first = 0
    }
    // Never closed: drop the tag alone rather than the rest of the design.
    const close = read.closes[first]!
    return close === -1 ? from : close
  }

  while (cursor < source.length) {
    const lt = source.indexOf('<', cursor)
    if (lt === -1) break

    // Comments, doctypes, processing instructions and CDATA carry nothing a
    // design needs, and they are where parsers disagree with each other most.
    if (source.startsWith('<!--', lt)) {
      flushText(lt)
      const end = source.indexOf('-->', lt + 4)
      cursor = textStart = end === -1 ? source.length : end + 3
      continue
    }
    if (source[lt + 1] === '!' || source[lt + 1] === '?') {
      flushText(lt)
      const end = source.indexOf('>', lt + 2)
      cursor = textStart = end === -1 ? source.length : end + 1
      continue
    }

    TAG_NAME_RE.lastIndex = lt
    const match = TAG_NAME_RE.exec(source)
    const end = match ? tagEnd(lt + match[0].length) : -1
    if (!match || end === -1) {
      // A `<` that does not start a tag is just text, escaped with the rest.
      cursor = lt + 1
      continue
    }

    flushText(lt)
    cursor = textStart = end

    const closing = match[1] === '/'
    const tag = match[2]!.toLowerCase()
    const rawAttributes = source.slice(lt + match[0].length, end - 1)
    const inSvg = open.includes('svg')
    const selfClosing = /\/\s*$/.test(rawAttributes)

    if (closing) {
      const position = open.lastIndexOf(tag)
      if (position === -1) continue
      for (let i = open.length - 1; i >= position; i--) {
        out.push(`</${open[i]}>`)
      }
      open.splice(position)
      continue
    }

    // Shell tags: the wrapper goes, what it wraps stays.
    if (tag === 'html' || tag === 'head' || tag === 'body') continue
    if (tag === 'form' || tag === 'fieldset' || tag === 'legend') continue

    if (inSvg && tag === 'foreignobject') {
      cursor = textStart = skipSubtree('foreignobject', cursor)
      continue
    }

    if (RAW_TEXT_TAGS.has(tag) && !(inSvg && tag === 'title')) {
      const { contentEnd, next } = skipRawText(tag, cursor)
      if (tag === 'style') styles.push(source.slice(cursor, contentEnd))
      if (tag === 'iframe' && !selfClosing) {
        const attributes = sanitizeAttributes(tag, rawAttributes, false)
        if (attributes !== null && open.length < 64) {
          out.push(`<iframe${attributes}></iframe>`)
        }
      }
      cursor = textStart = next
      continue
    }
    if (tag === 'plaintext') {
      cursor = textStart = source.length
      continue
    }
    if (DROPPED_SUBTREES.has(tag)) {
      cursor = textStart = selfClosing ? cursor : skipSubtree(tag, cursor)
      continue
    }
    if (DROPPED_VOID.has(tag)) continue

    const allowedHere = inSvg
      ? SVG_TAGS.has(tag) || tag === 'svg'
      : tag === 'svg' ||
        (Object.prototype.hasOwnProperty.call(HTML_TAGS, tag) &&
          tag !== 'iframe')
    if (!allowedHere) continue

    // A bound on nesting, so a small payload cannot make this renderer and
    // the browser's parser do disproportionate work.
    if (open.length >= 64) continue

    const sanitized = sanitizeAttributes(tag, rawAttributes, inSvg)
    if (sanitized === null) continue
    const attributes =
      annotate && !inSvg && tag !== 'svg'
        ? `${sanitized} ${SOURCE_POSITION_ATTRIBUTE}="${lt}"`
        : sanitized

    if (VOID_TAGS.has(tag)) {
      out.push(`<${tag}${attributes}>`)
      continue
    }
    // Self-closing is real only for drawing elements; `<div/>` opens a div in
    // HTML, so it is treated the way the browser would treat it.
    if (selfClosing && (inSvg || tag === 'svg')) {
      out.push(`<${tag}${attributes}></${tag}>`)
      continue
    }

    out.push(`<${tag}${attributes}>`)
    open.push(tag)
  }

  if (textStart < source.length) out.push(escapeText(source.slice(textStart)))
  for (let i = open.length - 1; i >= 0; i--) out.push(`</${open[i]}>`)

  return { html: out.join(''), css: styles.join('\n') }
}

// ── Stylesheet ────────────────────────────────────────────────────────

/** Block at-rules kept, their contents sanitised in turn. */
const BLOCK_AT_RULES = new Set([
  'media',
  'supports',
  'container',
  'layer',
  'keyframes',
  '-webkit-keyframes',
  '-moz-keyframes',
  'font-face',
  'property',
  'scope',
  'starting-style',
])

/** Properties that once ran code in some browser. Never kept. */
const BLOCKED_PROPERTIES = new Set(['behavior', '-moz-binding', 'binding'])

/** A CSS value with its escapes decoded, for checking only — never emitted. */
function decodeCssEscapes(value: string): string {
  return value.replace(
    /\\(?:([0-9a-fA-F]{1,6})\s?|([^\n0-9a-fA-F]))/g,
    (_, hex: string | undefined, char: string | undefined) => {
      if (hex) {
        const code = parseInt(hex, 16)
        return code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : '\ufffd'
      }
      return char ?? ''
    }
  )
}

/** A stylesheet URL is fine relative, over HTTPS, or as an inline image. */
function safeCssUrl(raw: string): boolean {
  const value = raw.trim().replace(/[\u0000-\u0020\u007f-\u009f]/g, '')
  if (!value) return true
  const lower = value.toLowerCase()
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(lower)?.[1]
  if (!scheme) return true
  if (scheme === 'https') return true
  return /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/.test(lower)
}

function urlsAreSafe(decoded: string): boolean {
  const lower = decoded.toLowerCase()
  const opened = lower.split('url(').length - 1
  let found = 0
  const URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi
  // Every match ends at a `)`, so only the text up to the last one can hold
  // one. Reading just that far stops a run of `url(` with no `)` sending the
  // pattern to the end of the value once per `url(`; a `url(` after it is
  // still counted below as one nobody checked.
  const readable = decoded.slice(0, decoded.lastIndexOf(')') + 1)
  let match: RegExpExecArray | null
  while ((match = URL_RE.exec(readable))) {
    found += 1
    if (!safeCssUrl(match[1] ?? match[2] ?? match[3] ?? '')) return false
  }
  // A `url(` the pattern could not read is a URL nobody checked.
  if (found !== opened) return false
  // `image-set()` and `src()` take bare strings as addresses.
  if (/(image-set|\bsrc)\s*\(/.test(lower)) {
    const STRING_RE = /"([^"]*)"|'([^']*)'/g
    while ((match = STRING_RE.exec(decoded))) {
      if (!safeCssUrl(match[1] ?? match[2] ?? '')) return false
    }
  }
  return true
}

function sanitizeDeclaration(text: string): string | undefined {
  const colon = text.indexOf(':')
  if (colon < 1) return undefined
  const property = text.slice(0, colon).trim()
  const value = text.slice(colon + 1).trim()
  if (!value) return undefined
  if (!/^(--[A-Za-z0-9_-]+|-?[A-Za-z][A-Za-z0-9-]*)$/.test(property)) {
    return undefined
  }
  if (BLOCKED_PROPERTIES.has(property.toLowerCase())) return undefined

  const decoded = decodeCssEscapes(value)
  const probe = decoded.toLowerCase().replace(/\s+/g, '')
  if (/expression\(|javascript:|vbscript:|-moz-binding|behavior:/.test(probe)) {
    return undefined
  }
  if (!urlsAreSafe(decoded)) return undefined
  return `${property}:${value}`
}

/** Index just past the string starting at `start`. */
function endOfString(css: string, start: number): number {
  const quote = css[start]
  let i = start + 1
  while (i < css.length) {
    const char = css[i]
    if (char === '\\') {
      i += 2
      continue
    }
    if (char === quote) return i + 1
    if (char === '\n') return i
    i += 1
  }
  return css.length
}

function stripComments(css: string): string {
  let out = ''
  let i = 0
  while (i < css.length) {
    const char = css[i]!
    if (char === '"' || char === "'") {
      const end = endOfString(css, i)
      out += css.slice(i, end)
      i = end
    } else if (char === '\\') {
      out += css.slice(i, i + 2)
      i += 2
    } else if (char === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      out += ' '
      i = end === -1 ? css.length : end + 2
    } else {
      out += char
      i += 1
    }
  }
  return out
}

/**
 * The next `;`, `{` or `}` outside strings, brackets and escapes — the
 * points where CSS itself splits a declaration from the next one.
 */
function nextDelimiter(css: string, from: number, end: number): number {
  let depth = 0
  let i = from
  while (i < end) {
    const char = css[i]!
    if (char === '\\') {
      i += 2
      continue
    }
    if (char === '"' || char === "'") {
      i = endOfString(css, i)
      continue
    }
    if (char === '(' || char === '[') depth += 1
    else if ((char === ')' || char === ']') && depth > 0) depth -= 1
    else if (depth === 0 && (char === ';' || char === '{' || char === '}')) {
      return i
    }
    i += 1
  }
  return end
}

/** Index of the `}` closing the block opened at `open`. */
function matchingBrace(css: string, open: number, end: number): number {
  let depth = 0
  let i = open
  while (i < end) {
    const char = css[i]!
    if (char === '\\') {
      i += 2
      continue
    }
    if (char === '"' || char === "'") {
      i = endOfString(css, i)
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return i
    }
    i += 1
  }
  return end
}

/**
 * A selector list with the document's own roots pointed at the block instead.
 *
 * Pasted code is usually written as a page, and its most important rule is
 * often `body { … }` — the font, the background. Inside a shadow root there is
 * no `body` and that rule would match nothing, so `html`, `body` and `:root`
 * at the start of a selector are read as the block itself (`:host`).
 */
function hostSelectors(prelude: string): string {
  return prelude
    .split(',')
    .map((selector) =>
      selector
        .trim()
        .replace(/^(?:html\s+body|html|body|:root)(?![\w-])/i, ':host')
    )
    .join(',')
}

/**
 * The contents of one block — the whole sheet, a rule's declarations, an
 * at-rule's nested rules — sanitised piece by piece. A piece that is not
 * recognised is dropped and the rest of the sheet carries on, which is also
 * what a browser does with a declaration it does not understand.
 */
type BlockMode = 'sheet' | 'rules' | 'inline'

function sanitizeBlock(
  css: string,
  start: number,
  end: number,
  depth: number,
  /**
   * `sheet` is the top of a stylesheet (rules only), `rules` the inside of a
   * rule or at-rule (declarations and nested rules), `inline` a `style`
   * attribute (declarations only).
   */
  mode: BlockMode
): string {
  if (depth > 12) return ''
  const out: string[] = []
  let i = start

  while (i < end) {
    while (i < end && /\s/.test(css[i]!)) i += 1
    if (i >= end) break

    const at = nextDelimiter(css, i, end)
    // Reaching the end of the range is the end of the last declaration, not
    // a delimiter — the character there is this block's own closing brace.
    const delimiter = at < end ? css[at] : undefined

    if (delimiter === '}') {
      // A stray closing brace: skip it, as the browser would.
      i = at + 1
      continue
    }

    if (delimiter === '{') {
      const close = matchingBrace(css, at, end)
      const prelude = css.slice(i, at).trim()
      i = close + 1
      if (!prelude || mode === 'inline') continue

      if (prelude.startsWith('@')) {
        const name = /^@([-\w]+)/.exec(prelude)?.[1]?.toLowerCase()
        const rest = prelude.slice((name?.length ?? 0) + 1)
        if (!name || !BLOCK_AT_RULES.has(name)) continue
        // An escape or an address in a prelude has no honest use and is
        // the easiest place to hide one.
        if (/\\|url\(/i.test(rest)) continue
        const body = sanitizeBlock(css, at + 1, close, depth + 1, 'rules')
        out.push(`@${name}${rest}{${body}}`)
        continue
      }

      const body = sanitizeBlock(css, at + 1, close, depth + 1, 'rules')
      out.push(`${hostSelectors(prelude)}{${body}}`)
      continue
    }

    // A declaration, or a statement at-rule, ending at `;` or the block's end.
    const piece = css.slice(i, at).trim()
    i = at + 1
    if (!piece) continue
    if (piece.startsWith('@')) {
      // Only `@layer a, b;` is kept: `@import` fetches a stylesheet this
      // never sees, and `@charset`/`@namespace` do nothing for a section.
      // One `\s`, not `\s+`: the list after it takes spaces too, and the two
      // splitting a long run of them between each other made this check
      // quadratic in the run's length.
      if (mode !== 'inline' && /^@layer\s[\w\s,.-]+$/i.test(piece)) {
        out.push(`${piece};`)
      }
      continue
    }
    if (mode === 'sheet') continue
    const declaration = sanitizeDeclaration(piece)
    if (declaration) out.push(`${declaration};`)
  }

  return out.join('')
}

/**
 * Sanitised CSS for the Custom code block's stylesheet.
 *
 * The last step is the one the rest depends on: every `<` is rewritten as
 * its CSS escape, which means the same character to CSS and means nothing to
 * the HTML parser — so no text in a stylesheet can ever close the `<style>`
 * it is written into.
 */
export function sanitizeCustomCss(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) return ''
  const source = stripComments(
    input.slice(0, MAX_CSS_LENGTH).replace(/\u0000/g, '')
  )
  return sanitizeBlock(source, 0, source.length, 0, 'sheet').replace(
    /</g,
    '\\3c '
  )
}

/** An inline `style` attribute: declarations only, same rules. */
export function sanitizeDeclarations(input: string): string {
  const source = stripComments(input.slice(0, 4000).replace(/\u0000/g, ''))
  return sanitizeBlock(source, 0, source.length, 1, 'inline')
    .replace(/</g, '\\3c ')
    .replace(/;$/, '')
}

/**
 * Everything the block renders inside its shadow root, as one string: its
 * stylesheet (pasted `<style>` blocks first, then the CSS field, so the field
 * wins a tie) and its markup.
 */
export function sanitizeCustomCode(
  html: unknown,
  css: unknown,
  options: CustomCodeOptions = {}
): { markup: string; empty: boolean } {
  const markup = sanitizeCustomHtml(html, options)
  const sheet = [sanitizeCustomCss(markup.css), sanitizeCustomCss(css)]
    .filter(Boolean)
    .join('\n')
  const empty = !markup.html.trim() && !sheet.trim()
  return {
    markup: `${sheet ? `<style>${sheet}</style>` : ''}${markup.html}`,
    empty,
  }
}
