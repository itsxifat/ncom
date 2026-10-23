/**
 * Edits to a custom-code design's HTML, made from the canvas.
 *
 * A merchant who double-clicks a sentence in a pasted design and retypes it
 * means "change those words", not "rewrite my HTML": everything else in it —
 * the class names, the formatting, the comments, the way their AI indented it
 * — must come back exactly as it went in. So an edit is a splice. The canvas
 * says where the element starts in the source (the position the sanitiser
 * marked it with, `data-ncom-at`) and these functions replace just its
 * contents, or just one attribute, at that place.
 *
 * Each one checks it found what the canvas showed before it writes, and
 * answers null rather than guess: a design whose markup the browser reads
 * differently from how it is written (an unclosed `<p>`, say) is left alone,
 * and the merchant is told to change that part in the HTML instead.
 */

/** Elements whose words may be retyped in place: never one holding blocks. */
const BLOCK_TAG =
  /<(?:address|article|aside|blockquote|details|dialog|div|dl|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|ul|video|audio|iframe|picture|img|svg)[\s/>]/i

/**
 * The design with the element at `at` holding `innerHtml` instead of what it
 * held, or null when the element cannot be found or is not plain text.
 *
 * `matches` is shown the element's current contents as written, and must
 * agree they are what the merchant saw — the canvas passes a check against
 * the words it had on screen, which catches a position that no longer points
 * where it did.
 */
export function replaceElementContent(
  source: string,
  at: number,
  innerHtml: string,
  matches: (currentInnerHtml: string) => boolean
): string | null {
  const element = elementAt(source, at)
  if (!element || element.void) return null
  const close = closingTagOf(source, element.name, element.end)
  if (close === -1) return null
  const current = source.slice(element.end, close)
  if (BLOCK_TAG.test(current) || !matches(current)) return null
  return `${source.slice(0, element.end)}${innerHtml}${source.slice(close)}`
}

/**
 * The design with the `<img>` at `at` showing `url`, or null.
 *
 * `srcset` and `sizes` are removed with the old address: a browser that finds
 * a `srcset` draws from it and ignores `src`, so leaving one would keep the
 * old photo on every screen that matters.
 */
export function replaceImageSource(
  source: string,
  at: number,
  url: string
): string | null {
  const element = elementAt(source, at)
  if (!element || element.name !== 'img') return null
  const kept = attributesOf(
    source.slice(at + 1 + element.name.length, element.tagEnd)
  )
    .filter((attribute) => !/^(src|srcset|sizes)$/i.test(attribute.name))
    .map((attribute) => attribute.raw)
  const selfClosing = /\/\s*>$/.test(source.slice(at, element.end))
  const tag = `<img${kept.length ? ` ${kept.join(' ')}` : ''} src="${escapeAttribute(url)}"${selfClosing ? ' />' : '>'}`
  return `${source.slice(0, at)}${tag}${source.slice(element.end)}`
}

// ── Reading the source ───────────────────────────────────────────────────

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

interface SourceElement {
  name: string
  /** Index just past the start tag's `>`. */
  end: number
  /** Index of that `>` (or of the `/` in `/>`). */
  tagEnd: number
  void: boolean
}

/** The start tag at `at`, read the way the sanitiser reads one. */
function elementAt(source: string, at: number): SourceElement | null {
  if (!Number.isInteger(at) || at < 0 || source[at] !== '<') return null
  const name = /^<([a-zA-Z][a-zA-Z0-9:-]*)/.exec(source.slice(at, at + 64))?.[1]
  if (!name) return null
  const end = startTagEnd(source, at + 1 + name.length)
  if (end === -1) return null
  const tagEnd = source[end - 2] === '/' ? end - 2 : end - 1
  return {
    name: name.toLowerCase(),
    end,
    tagEnd,
    void: VOID.has(name.toLowerCase()),
  }
}

/**
 * Index just past the `>` ending a tag whose attributes start at `from`, or
 * -1. A quote that never closes means the tag never ends, as the sanitiser
 * reads it.
 */
function startTagEnd(source: string, from: number): number {
  let index = from
  while (index < source.length) {
    const char = source[index]
    if (char === '>') return index + 1
    if (char === '"' || char === "'") {
      const close = source.indexOf(char, index + 1)
      if (close === -1) return -1
      index = close + 1
    } else {
      index += 1
    }
  }
  return -1
}

/**
 * Where the element named `name`, whose contents start at `from`, is closed:
 * the index of its `</name`. Tags of the same name inside it are counted, and
 * comments skipped. -1 when it never is.
 */
function closingTagOf(source: string, name: string, from: number): number {
  const pattern = new RegExp(`<!--|<(/?)${escapeRegExp(name)}(?=[\\s/>])`, 'gi')
  pattern.lastIndex = from
  let depth = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    if (match[0] === '<!--') {
      const end = source.indexOf('-->', match.index + 4)
      if (end === -1) return -1
      pattern.lastIndex = end + 3
      continue
    }
    if (match[1]) {
      if (depth === 0) return match.index
      depth -= 1
      continue
    }
    const end = startTagEnd(source, pattern.lastIndex)
    if (end === -1) return -1
    pattern.lastIndex = end
    if (source[end - 2] !== '/') depth += 1
  }
  return -1
}

/** A tag's attributes as written, each with its original text. */
function attributesOf(raw: string): { name: string; raw: string }[] {
  const out: { name: string; raw: string }[] = []
  for (const match of raw.matchAll(
    /([^\s"'<>/=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g
  )) {
    out.push({ name: match[1]!, raw: match[0] })
  }
  return out
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
