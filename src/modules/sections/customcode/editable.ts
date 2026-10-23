import { SOURCE_POSITION_ATTRIBUTE } from './sanitize'

/**
 * What in a custom-code design a merchant can change by clicking it, on the
 * canvas.
 *
 * Words and photos — the two things a merchant who did not write the HTML
 * still needs to change on the morning of a sale. A sentence is retyped where
 * it sits (double-click, type, Enter) and a photo swapped from the media
 * library; anything else — the layout, the colours, an icon — is the HTML's,
 * edited in the Content tab or by asking the AI again.
 *
 * Browser-only helpers, shared by the frame (which marks what is editable, so
 * the canvas can show it on hover) and the canvas (which starts and ends the
 * edit). The source positions they rely on are added by the sanitiser for the
 * canvas only; see `SOURCE_POSITION_ATTRIBUTE`.
 */

/** Set on each sentence that can be retyped, for the hover style. */
export const EDITABLE_TEXT_ATTRIBUTE = 'data-ncom-editable'
/** Set on each photo that can be swapped. */
export const EDITABLE_IMAGE_ATTRIBUTE = 'data-ncom-editable-image'

/** Formatting a retyped sentence may contain and keep. */
const INLINE_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'cite',
  'code',
  'del',
  'em',
  'i',
  'ins',
  'kbd',
  'mark',
  'q',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
])

/** Elements that are never a sentence, whatever they contain. */
const NOT_TEXT = new Set([
  'img',
  'svg',
  'video',
  'audio',
  'iframe',
  'picture',
  'source',
  'hr',
  'br',
  'ul',
  'ol',
  'dl',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'colgroup',
])

/**
 * Hooks whose words NCOM writes (see `hooks.ts`): retyping a live price
 * would last until the next render, so these are not offered for typing.
 */
const LIVE_HOOKS = ['price', 'regular-price', 'saving', 'name', 'delivery']
const LIVE_TEXT_SELECTOR = LIVE_HOOKS.map((hook) => `[data-ncom-${hook}]`).join(
  ','
)

/** Whether this element's words can be retyped in place. */
export function isEditableText(element: Element): boolean {
  if (!element.hasAttribute(SOURCE_POSITION_ATTRIBUTE)) return false
  if (NOT_TEXT.has(element.localName)) return false
  if (!element.textContent?.trim()) return false
  if (element.closest(LIVE_TEXT_SELECTOR)) return false
  for (const child of element.querySelectorAll('*')) {
    if (child.localName !== 'br' && !INLINE_TAGS.has(child.localName)) {
      return false
    }
    if (child.matches(LIVE_TEXT_SELECTOR)) return false
  }
  return true
}

/** The live hook an element's words come from, if any. */
export function liveHookOf(element: Element): string | null {
  const bound = element.closest(LIVE_TEXT_SELECTOR)
  if (!bound) return null
  return (
    LIVE_HOOKS.find((hook) => bound.hasAttribute(`data-ncom-${hook}`)) ?? null
  )
}

/** Marks every editable sentence and photo in a design, for the hover style. */
export function markEditable(root: ParentNode) {
  for (const element of root.querySelectorAll(
    `[${SOURCE_POSITION_ATTRIBUTE}]`
  )) {
    if (element.localName === 'img') {
      element.setAttribute(EDITABLE_IMAGE_ATTRIBUTE, '')
    } else if (isEditableText(element)) {
      element.setAttribute(EDITABLE_TEXT_ATTRIBUTE, '')
    }
  }
}

/**
 * A retyped sentence as HTML to splice back into the design: its text
 * escaped, its line breaks, and the formatting it kept — with the builder's
 * own attributes taken off again. Anything the browser added while it was
 * being typed in that is not formatting keeps its words and loses its tag.
 */
export function serializeEditedText(element: Element): string {
  let out = ''
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += escapeText(node.textContent ?? '')
      continue
    }
    if (!(node instanceof Element)) continue
    if (node.localName === 'br') {
      out += '<br>'
      continue
    }
    const inner = serializeEditedText(node)
    if (!INLINE_TAGS.has(node.localName)) {
      out += inner
      continue
    }
    const attributes = node
      .getAttributeNames()
      .filter(
        (name) =>
          name !== SOURCE_POSITION_ATTRIBUTE &&
          name !== EDITABLE_TEXT_ATTRIBUTE &&
          name !== 'contenteditable' &&
          name !== 'spellcheck'
      )
      .map((name) => {
        const value = node.getAttribute(name) ?? ''
        return value === '' ? name : `${name}="${escapeAttribute(value)}"`
      })
    out += `<${node.localName}${attributes.length ? ` ${attributes.join(' ')}` : ''}>${inner}</${node.localName}>`
  }
  return out
}

/** The words an HTML fragment shows, spaces collapsed, for comparing. */
export function wordsOf(html: string): string {
  // A template's contents are inert: nothing in them loads or runs.
  const template = document.createElement('template')
  template.innerHTML = html
  return collapse(template.content.textContent ?? '')
}

export function collapse(text: string): string {
  return text.replace(/[\s ]+/g, ' ').trim()
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
