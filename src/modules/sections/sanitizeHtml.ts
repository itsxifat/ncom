import { fontStack } from '@/lib/fonts'
import { isColor } from './elementStyle'

/**
 * The sanitiser behind every rich-text field.
 *
 * Rich text is the one place a merchant's input becomes markup rather than a
 * text node, so this function is the whole security boundary for it. It is an
 * allow-list in both directions — only these tags survive, only these
 * attributes on them, only these CSS properties inside `style` — and anything
 * unrecognised is dropped rather than escaped-and-kept or passed through.
 *
 * It is written as a tokeniser rather than a set of "strip the bad things"
 * regexes on purpose. Blocklist sanitisers fail on the input their author did
 * not imagine; this one can only ever emit tags it was told to emit, so a
 * payload it has never seen produces plain escaped text.
 *
 * Called on *render*, not on save. A stored value is untrusted data whatever
 * wrote it, and sanitising at the boundary where it becomes markup means a row
 * written by an older build, a script, or a restored backup is covered too.
 */

/** Tag → the attributes it may keep. Everything else is dropped. */
const ALLOWED_TAGS: Record<string, readonly string[]> = {
  b: [],
  strong: [],
  i: [],
  em: [],
  u: [],
  s: [],
  mark: [],
  sup: [],
  sub: [],
  br: [],
  span: ['style'],
  a: ['href', 'target', 'rel', 'style'],
}

/** Tags that never have a closing partner. */
const VOID_TAGS = new Set(['br'])

/**
 * Inline CSS properties a merchant may set on a run of text.
 *
 * Deliberately typographic only. Nothing here can move an element, size it, or
 * position it — `position`, `display`, `width` and friends are absent so a span
 * inside a paragraph cannot be turned into an overlay covering the page, which
 * is the classic way an inline-style allow-list gets used for clickjacking.
 */
const ALLOWED_CSS: Record<string, (value: string) => string | undefined> = {
  color: (value) => (isColor(value) ? value : undefined),
  'background-color': (value) => (isColor(value) ? value : undefined),
  'font-size': (value) =>
    /^\d{1,3}(\.\d{1,2})?(px|rem|em|%)$/.test(value) ? value : undefined,
  'font-weight': (value) =>
    /^([1-9]00|normal|bold)$/.test(value) ? value : undefined,
  'font-style': (value) =>
    /^(normal|italic)$/.test(value) ? value : undefined,
  'font-family': (value) => {
    // Resolved through the catalogue rather than kept as typed, for the same
    // reason section fonts are: a family name nothing serves renders as the
    // visitor's default, and an arbitrary string here would be raw CSS.
    const name = value.replace(/["']/g, '').split(',')[0]?.trim()
    return name && /^[\p{L}\p{N} '-]{1,60}$/u.test(name)
      ? fontStack(name)
      : undefined
  },
  'text-decoration': (value) =>
    /^(none|underline|line-through)$/.test(value) ? value : undefined,
  'letter-spacing': (value) =>
    /^-?\d{1,2}(\.\d{1,2})?px$/.test(value) ? value : undefined,
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]!)
}

/**
 * A link target safe to follow.
 *
 * Scheme allow-list rather than a `javascript:` blocklist: the blocklist has to
 * anticipate every encoding of every dangerous scheme, and the allow-list has
 * to anticipate nothing. Stripping control characters and whitespace first is
 * what stops `java\tscript:` — which a browser reads as script — from looking
 * like a relative URL to the tests below.
 */
export function safeHref(raw: string): string | undefined {
  const value = raw.replace(/[\u0000-\u0020]/g, '').toLowerCase()
  if (/^(https?:|mailto:|tel:)/.test(value)) return raw.trim()
  // Relative and same-page links, which is how a CTA reaches the order form.
  if (/^[#/][^\s]*$/.test(value)) return raw.trim()
  return undefined
}

function sanitizeStyle(raw: string): string | undefined {
  const out: string[] = []
  for (const declaration of raw.split(';')) {
    const separator = declaration.indexOf(':')
    if (separator === -1) continue
    const property = declaration.slice(0, separator).trim().toLowerCase()
    const value = declaration.slice(separator + 1).trim()
    if (!value) continue
    const validate = ALLOWED_CSS[property]
    if (!validate) continue
    const safe = validate(value)
    // Every validator above returns either a value it fully recognises or
    // nothing, so nothing unmatched can reach the output.
    if (safe) out.push(`${property}:${safe}`)
  }
  return out.length ? out.join(';') : undefined
}

const ATTRIBUTE_RE = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g

function sanitizeAttributes(tag: string, raw: string): string {
  const allowed = ALLOWED_TAGS[tag]!
  if (!allowed.length) return ''
  const out: string[] = []
  let match: RegExpExecArray | null

  ATTRIBUTE_RE.lastIndex = 0
  while ((match = ATTRIBUTE_RE.exec(raw))) {
    const name = match[1]!.toLowerCase()
    if (!allowed.includes(name)) continue
    const value = match[3] ?? match[4] ?? match[5] ?? ''

    if (name === 'href') {
      const href = safeHref(value)
      if (href) out.push(`href="${escapeText(href)}"`)
    } else if (name === 'style') {
      const style = sanitizeStyle(value)
      if (style) out.push(`style="${escapeText(style)}"`)
    } else if (name === 'target') {
      if (value === '_blank') out.push('target="_blank"')
    }
    // `rel` is never copied from the input; it is rewritten below, so a
    // merchant cannot weaken it.
  }

  if (tag === 'a' && out.includes('target="_blank"')) {
    // `noopener` is the one that matters — without it the opened page can
    // reach back through `window.opener` and navigate the storefront.
    out.push('rel="noopener noreferrer"')
  }

  return out.length ? ` ${out.join(' ')}` : ''
}

/**
 * Sanitised HTML for a rich-text value.
 *
 * Plain text passes through unchanged apart from escaping, which is what makes
 * this safe to point at fields that hold plain strings today: a value written
 * before rich text existed has no tags, so it comes back as the same words.
 */
export function sanitizeRichText(input: unknown): string {
  if (typeof input !== 'string' || !input) return ''
  // A cap, because this runs per element per render and the cost is linear in
  // input length. Content schemas already bound their own fields; this bounds
  // the values that arrive from anywhere else.
  const source = input.slice(0, 20000)

  const out: string[] = []
  const open: string[] = []
  let cursor = 0

  // Quoted attribute values are matched as units so a `>` inside one cannot
  // end the tag early — the classic way a naive `<[^>]*>` scanner is split in
  // half and made to emit an attacker's markup.
  const TOKEN_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
  let match: RegExpExecArray | null

  while ((match = TOKEN_RE.exec(source))) {
    const token = match[0]
    const rawName = match[1]!
    const rawAttributes = match[2] ?? ''
    const index = match.index

    if (index > cursor) out.push(escapeText(source.slice(cursor, index)))
    cursor = index + token.length

    const tag = rawName.toLowerCase()
    // An unknown tag is dropped entirely — including its name — rather than
    // escaped and shown. A merchant who pasted `<div>` from Word wants the
    // words inside it, not to see the markup rendered back at them.
    if (!Object.prototype.hasOwnProperty.call(ALLOWED_TAGS, tag)) continue

    if (token.startsWith('</')) {
      // A closing tag with nothing open matching it is stray markup; dropping
      // it is what stops a crafted `</span>` from escaping its container.
      const position = open.lastIndexOf(tag)
      if (position === -1) continue
      // Everything opened inside it has to close first, or the output nests
      // wrongly and the browser re-parents it in ways the merchant never sees
      // in the editor.
      for (let i = open.length - 1; i >= position; i--)
        out.push(`</${open[i]}>`)
      open.splice(position)
      continue
    }

    if (VOID_TAGS.has(tag)) {
      out.push(`<${tag}>`)
      continue
    }

    // A bound on nesting depth: deeply nested spans are a way to make this
    // renderer and the browser's parser do disproportionate work on a small
    // payload.
    if (open.length >= 24) continue

    out.push(`<${tag}${sanitizeAttributes(tag, rawAttributes)}>`)
    open.push(tag)
  }

  if (cursor < source.length) out.push(escapeText(source.slice(cursor)))
  // Close anything the merchant left open, innermost first, so the fragment is
  // balanced and cannot swallow the markup that follows it on the page.
  for (let i = open.length - 1; i >= 0; i--) out.push(`</${open[i]}>`)

  return out.join('')
}

/** A rich-text value as plain words — for previews, labels and length checks. */
export function richTextToPlain(input: unknown): string {
  if (typeof input !== 'string' || !input) return ''
  return (
    input
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Last, so an escaped `&amp;lt;` does not become a `<` on the way out.
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** Whether a value carries formatting, as opposed to being plain words. */
export function hasRichFormatting(input: unknown): boolean {
  return typeof input === 'string' && /<[a-zA-Z]/.test(input)
}
