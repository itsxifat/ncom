import { getSectionDefinition } from '../sections/registry'
import type { SectionConfig } from '../sections/types'

/**
 * What a block on a page is called, wherever the builder has to name one: the
 * layers list, the publish check, the saved-block library.
 *
 * The block's type alone ("Custom code", "Product grid") is not a name once a
 * page has two of them — a landing page an AI wrote can be eight custom-code
 * blocks in a row, and a layers list that says "Custom code" eight times
 * tells the merchant nothing about which is the hero. So a block is called,
 * in order of preference:
 *
 *   what the merchant named it (`config.label`, set from the layers list),
 *   the first words it shows — its title, or a custom-code design's first
 *   heading,
 *   its type.
 *
 * `kind` is always the type, for showing beside a name that is not one.
 */
export interface SectionLabel {
  /** What to call the block. */
  name: string
  /** The block type's own name: "Custom code". */
  kind: string
  /** Whether `name` is something other than `kind`. */
  named: boolean
}

/** The longest name a block gets before it is cut short. */
const MAX_NAME_LENGTH = 60

/**
 * Content fields that hold a block's own headline, best first. The first one
 * with words in it names the block; lists and settings never do.
 */
const NAMING_FIELDS = [
  'title',
  'heading',
  'headline',
  'text',
  'label',
  'eyebrow',
  'caption',
  'quote',
] as const

export function sectionLabel(section: {
  type: string
  content?: Record<string, unknown> | null
  config?: SectionConfig | null
}): SectionLabel {
  const kind = getSectionDefinition(section.type)?.name ?? section.type
  const own = cleanName(section.config?.label)
  if (own) return { name: own, kind, named: true }
  const shown = shownWords(section.type, section.content ?? {})
  return shown && shown !== kind
    ? { name: shown, kind, named: true }
    : { name: kind, kind, named: false }
}

function shownWords(
  type: string,
  content: Record<string, unknown>
): string | null {
  if (type === 'customcode') {
    return typeof content.html === 'string'
      ? designHeadline(content.html)
      : null
  }
  for (const field of NAMING_FIELDS) {
    const name = cleanName(content[field])
    if (name) return name
  }
  return null
}

/**
 * The first heading of a custom-code design, else its first paragraph.
 *
 * Read with patterns whose every repetition is bounded, over the start of the
 * markup only: this runs on each render of the layers list, against HTML
 * anyone could have pasted, and an unbounded `[^>]*` retried at every `<h1`
 * of a crafted paste is quadratic.
 */
function designHeadline(html: string): string | null {
  const head = html.slice(0, 20_000)
  for (const pattern of [
    /<h[1-3](?:\s[^>]{0,400})?>([\s\S]{0,600}?)<\/h[1-3]\s*>/i,
    /<p(?:\s[^>]{0,400})?>([\s\S]{0,600}?)<\/p\s*>/i,
  ]) {
    const name = cleanName(pattern.exec(head)?.[1])
    if (name) return name
  }
  return null
}

/** Words fit for a list row: no markup, no runs of space, not too long. */
function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = decodeBasicEntities(value.replace(/<[^>]{0,400}>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return null
  return text.length > MAX_NAME_LENGTH
    ? `${text.slice(0, MAX_NAME_LENGTH - 1).trimEnd()}…`
    : text
}

/** The handful of entities rich text and pasted designs actually contain. */
function decodeBasicEntities(text: string): string {
  return text.replace(
    /&(amp|lt|gt|quot|#39|apos|nbsp);/g,
    (_, name: string) =>
      ({
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        '#39': "'",
        apos: "'",
        nbsp: ' ',
      })[name] ?? ''
  )
}
