import { liquidSectionSchema, type LiquidSectionSchema } from './schema'

/**
 * Turns a block of plain HTML into an editable section.
 *
 * This is what stops "paste your own markup" from producing a layer nobody can
 * change afterwards. Pasted HTML is scanned for the things a merchant actually
 * wants to edit — headings, paragraphs, button labels, links, images, video
 * sources, and the colours in the section's own stylesheet — and each one is
 * lifted out into a setting. The markup comes back with those values replaced
 * by `{{ section.settings.x }}`, so the section renders exactly as pasted while
 * every extracted value gets a real control in the Inspector.
 *
 * The result is indistinguishable from a hand-built section: the merchant sees
 * "Heading", "Price", "Button label", "Background colour" in the sidebar, not a
 * textarea full of HTML.
 *
 * What is deliberately NOT touched:
 *
 *   - Anything inside `{{ … }}` or `{% … %}`. A paste that already contains
 *     Liquid keeps its logic; we only lift *literal* values.
 *   - `<script>` contents. Rewriting a string literal inside JavaScript to a
 *     Liquid output tag is how you break someone's tracking snippet.
 *   - Structure. No tags are added, removed or reordered, so the section looks
 *     the same after import as the HTML did before it.
 *
 * The scanner is hand-rolled rather than a DOM parse because the rewrite has to
 * be offset-accurate against the *original* source: serialising a parsed tree
 * back to HTML would silently normalise the merchant's markup (quote style,
 * attribute order, whitespace, void-element closing) and they would open the
 * editor to a diff they never asked for.
 */

/** Elements whose text content is worth exposing as an editable field. */
const TEXT_ELEMENTS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'span',
  'a',
  'button',
  'li',
  'label',
  'strong',
  'em',
  'small',
  'div',
  'blockquote',
  'figcaption',
  'td',
  'th',
  'option',
  'summary',
])

/** Never rewrite anything inside these. */
const OPAQUE_ELEMENTS = new Set([
  'script',
  'noscript',
  'textarea',
  'pre',
  'code',
])

/** Attributes carrying a URL we can turn into a picker. */
const IMAGE_ATTRS = new Set(['src', 'poster'])

/**
 * Cap on generated settings. The schema itself allows 100; stopping short of it
 * leaves room for the section's own additions and keeps a pathological paste
 * (a 400-row table) from producing an Inspector nobody can scroll. Values past
 * the cap stay literal in the markup — still rendered, just not editable.
 */
const MAX_SETTINGS = 80

/** Minimum text length worth a field — skips "·", "✓", "—" and stray glyphs. */
const MIN_TEXT_LENGTH = 2

interface Attr {
  name: string
  value: string
  /** Offsets of the value itself, inside the quotes. */
  valueStart: number
  valueEnd: number
}

interface Tag {
  kind: 'open' | 'close' | 'selfclose'
  name: string
  attrs: Attr[]
  start: number
  end: number
}

interface Edit {
  start: number
  end: number
  replacement: string
}

type SettingType =
  'text' | 'textarea' | 'richtext' | 'image_picker' | 'url' | 'color' | 'video'

interface DraftSetting {
  type: SettingType
  id: string
  label: string
  default: string
}

export interface InferredSection {
  /** Original markup with extracted values swapped for Liquid output tags. */
  template: string
  schema: LiquidSectionSchema
  /** Display name inferred from the content. */
  name: string
  /** How many values were lifted into settings. */
  fieldCount: number
}

// ── Scanning ─────────────────────────────────────────────────────────────

/**
 * Ranges that must survive untouched: existing Liquid, and the contents of
 * opaque elements. Any candidate edit overlapping one of these is dropped.
 */
function protectedRanges(html: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []

  const liquid = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g
  for (const match of html.matchAll(liquid)) {
    ranges.push([match.index, match.index + match[0].length])
  }

  for (const name of OPAQUE_ELEMENTS) {
    const block = new RegExp(`<${name}\\b[\\s\\S]*?</${name}\\s*>`, 'gi')
    for (const match of html.matchAll(block)) {
      ranges.push([match.index, match.index + match[0].length])
    }
  }

  return ranges
}

function overlaps(
  ranges: Array<[number, number]>,
  start: number,
  end: number
): boolean {
  return ranges.some(([from, to]) => start < to && end > from)
}

/** Tokenises tags, capturing attribute value offsets for the rewrite. */
function scanTags(html: string): Tag[] {
  const tags: Tag[] = []
  const tagPattern =
    /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g

  for (const match of html.matchAll(tagPattern)) {
    const [full, closing, name, rawAttrs] = match
    const start = match.index
    const attrsOffset = start + 1 + closing.length + name.length

    tags.push({
      kind: closing ? 'close' : /\/\s*$/.test(rawAttrs) ? 'selfclose' : 'open',
      name: name.toLowerCase(),
      attrs: scanAttrs(rawAttrs, attrsOffset),
      start,
      end: start + full.length,
    })
  }

  return tags
}

function scanAttrs(raw: string, offset: number): Attr[] {
  const attrs: Attr[] = []
  const pattern = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g

  for (const match of raw.matchAll(pattern)) {
    const value = match[3] ?? match[4] ?? ''
    // +1 skips the opening quote so offsets bracket the value only.
    const valueStart =
      offset + match.index + match[0].length - match[2].length + 1
    attrs.push({
      name: match[1].toLowerCase(),
      value,
      valueStart,
      valueEnd: valueStart + value.length,
    })
  }

  return attrs
}

// ── Naming ───────────────────────────────────────────────────────────────

function humanize(token: string): string {
  const words = token
    .split(/[-_\s]+/)
    .filter(Boolean)
    .filter((word) => !/^\d+$/.test(word))
  if (words.length === 0) return ''
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * A readable label from a class name.
 *
 * BEM-ish class names carry the author's own name for the thing, which beats
 * anything we could infer from the tag: `.lp-hero__title` should read "Title",
 * not "Heading 2". Falls back to the tag when there is no useful class.
 */
function labelFromClass(className: string | undefined, tag: string): string {
  if (className) {
    const last = className.trim().split(/\s+/).pop() ?? ''
    const humanized = humanize(elementToken(last))
    if (humanized && humanized.length <= 30) return humanized
  }
  return labelFromTag(tag)
}

/** Common abbreviations, so a `.hero__img` field is not labelled "Img". */
const TOKEN_SYNONYMS: Record<string, string> = {
  img: 'image',
  pic: 'image',
  photo: 'image',
  btn: 'button',
  cta: 'button',
  desc: 'description',
  sub: 'subheading',
  txt: 'text',
  nav: 'navigation',
}

/**
 * The meaningful part of a class name.
 *
 * BEM element names (`lp-hero__title`) carry the author's own word for the
 * thing after the `__`. Without one, the last dashed token is the specific
 * part and everything before it is the author's namespace prefix — `.lp-hero`
 * should read "Hero", not "Lp Hero".
 */
function elementToken(className: string): string {
  const raw = className.includes('__')
    ? className.split('__').pop()!
    : (className.split('-').filter(Boolean).pop() ?? className)

  return TOKEN_SYNONYMS[raw.toLowerCase()] ?? raw
}

function labelFromTag(tag: string): string {
  switch (tag) {
    case 'h1':
      return 'Heading'
    case 'h2':
    case 'h3':
      return 'Subheading'
    case 'h4':
    case 'h5':
    case 'h6':
      return 'Small heading'
    case 'p':
      return 'Text'
    case 'a':
      return 'Link text'
    case 'button':
      return 'Button label'
    case 'li':
      return 'List item'
    case 'label':
      return 'Field label'
    case 'option':
      return 'Option'
    default:
      return 'Text'
  }
}

/**
 * Joins a label with the kind of thing it is, without stuttering: a field from
 * `.hero__img` is "Image", not "Image image", while one from `.hero__banner`
 * is "Banner image" so the merchant knows what the control does.
 */
function qualify(base: string, noun: string): string {
  const trimmed = base.trim()
  if (!trimmed) return noun.charAt(0).toUpperCase() + noun.slice(1)
  if (trimmed.toLowerCase().includes(noun.toLowerCase())) return trimmed
  return `${trimmed} ${noun}`
}

function toId(label: string, fallback: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return base || fallback
}

// ── Colour extraction ────────────────────────────────────────────────────

const COLOUR_VALUE =
  /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/

const COLOUR_PROPERTIES = new Set([
  'color',
  'background',
  'background-color',
  'border-color',
  'fill',
  'stroke',
])

/**
 * Lifts colour declarations out of a `<style>` block.
 *
 * Scoped to declarations whose property is a colour so we don't turn a
 * `box-shadow` or a gradient into a colour swatch that cannot round-trip. The
 * selector supplies the label, which is why `.lp-hero__cta { background: … }`
 * becomes "Cta background" rather than "Colour 7".
 */
function extractStyleColours(
  css: string,
  cssOffset: number,
  emit: (setting: DraftSetting, start: number, end: number) => boolean
): void {
  // Walk rule by rule so the selector is known for each declaration.
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g

  for (const rule of css.matchAll(rulePattern)) {
    const selector = rule[1].trim()
    const body = rule[2]
    const bodyOffset = cssOffset + rule.index + rule[1].length + 1

    // An at-rule prelude (@media …) is not a selector; its inner rules are
    // matched separately by this same pattern, so skip the wrapper itself.
    if (selector.startsWith('@')) continue

    const declPattern = /([a-zA-Z-]+)\s*:\s*([^;]+)/g
    for (const decl of body.matchAll(declPattern)) {
      const property = decl[1].trim().toLowerCase()
      if (!COLOUR_PROPERTIES.has(property)) continue

      const rawValue = decl[2]
      const colour = rawValue.match(COLOUR_VALUE)
      if (!colour) continue

      const valueOffset =
        bodyOffset +
        decl.index +
        decl[0].length -
        rawValue.length +
        colour.index!

      const noun =
        property === 'color' ? '' : humanize(property.replace('-color', ''))
      const base = labelFromSelector(selector)
      const label = [base, noun || 'colour'].filter(Boolean).join(' ')

      emit(
        {
          type: 'color',
          id: toId(label, 'colour'),
          label: label.charAt(0).toUpperCase() + label.slice(1),
          default: colour[0],
        },
        valueOffset,
        valueOffset + colour[0].length
      )
    }
  }
}

function labelFromSelector(selector: string): string {
  // Last simple selector in the list, stripped of combinators and pseudos.
  const first = selector.split(',')[0].trim()
  const last = first.split(/[\s>+~]+/).pop() ?? first
  const cleaned = last.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, '')
  const className = cleaned.match(/\.([A-Za-z0-9_-]+)$/)?.[1]
  if (className) return humanize(elementToken(className))
  const tag = cleaned.match(/^([a-zA-Z][a-zA-Z0-9]*)/)?.[1]
  return tag ? humanize(tag) : ''
}

// ── Inference ────────────────────────────────────────────────────────────

export function inferSectionFromHtml(
  html: string,
  handle: string
): InferredSection {
  const protectedAreas = protectedRanges(html)
  const tags = scanTags(html)

  const settings: DraftSetting[] = []
  const edits: Edit[] = []
  const usedIds = new Set<string>()

  /**
   * Registers one extracted value. Returns false once the cap is reached, so
   * callers stop scanning rather than building settings that get dropped.
   */
  const emit = (draft: DraftSetting, start: number, end: number): boolean => {
    if (settings.length >= MAX_SETTINGS) return false
    if (overlaps(protectedAreas, start, end)) return false

    // Repeated structures (four benefit rows, three price tiers) legitimately
    // produce the same label, so ids get a counter and the label gets the same
    // number — "List item", "List item 2" — rather than four identical labels
    // the merchant cannot tell apart.
    let id = draft.id
    let counter = 2
    while (usedIds.has(id)) id = `${draft.id}_${counter++}`
    usedIds.add(id)

    const label =
      id === draft.id ? draft.label : `${draft.label} ${counter - 1}`

    settings.push({ ...draft, id, label })
    edits.push({ start, end, replacement: `{{ section.settings.${id} }}` })
    return true
  }

  let inferredName = ''

  for (let index = 0; index < tags.length; index++) {
    const tag = tags[index]
    if (tag.kind === 'close') continue

    // <style> — lift the colours, leave the rest of the CSS alone.
    if (tag.name === 'style') {
      const close = tags.find(
        (other, i) =>
          i > index && other.name === 'style' && other.kind === 'close'
      )
      if (close) {
        extractStyleColours(html.slice(tag.end, close.start), tag.end, emit)
      }
      continue
    }

    if (OPAQUE_ELEMENTS.has(tag.name)) continue

    const className = tag.attrs.find((attr) => attr.name === 'class')?.value

    // Attribute-borne values: images, links, media sources, alt text.
    for (const attr of tag.attrs) {
      if (!attr.value.trim()) continue

      if (
        IMAGE_ATTRS.has(attr.name) &&
        (tag.name === 'img' || tag.name === 'source')
      ) {
        const label = qualify(labelFromClass(className, 'image'), 'image')
        emit(
          {
            type: 'image_picker',
            id: toId(label, 'image'),
            label,
            default: attr.value,
          },
          attr.valueStart,
          attr.valueEnd
        )
      } else if (
        attr.name === 'src' &&
        (tag.name === 'video' || tag.name === 'iframe')
      ) {
        const label = qualify(labelFromClass(className, 'video'), 'video')
        emit(
          {
            type: 'video',
            id: toId(label, 'video'),
            label,
            default: attr.value,
          },
          attr.valueStart,
          attr.valueEnd
        )
      } else if (attr.name === 'poster' && tag.name === 'video') {
        emit(
          {
            type: 'image_picker',
            id: 'video_poster',
            label: 'Video poster',
            default: attr.value,
          },
          attr.valueStart,
          attr.valueEnd
        )
      } else if (
        attr.name === 'href' &&
        tag.name === 'a' &&
        !attr.value.startsWith('#')
      ) {
        // In-page anchors (#order) are structure, not content — rewriting them
        // to a setting invites a merchant to break their own scroll link.
        const label = qualify(labelFromClass(className, 'link'), 'link')
        emit(
          { type: 'url', id: toId(label, 'link'), label, default: attr.value },
          attr.valueStart,
          attr.valueEnd
        )
      } else if (attr.name === 'alt' && tag.name === 'img') {
        emit(
          {
            type: 'text',
            id: 'image_alt',
            label: 'Image alt text',
            default: attr.value,
          },
          attr.valueStart,
          attr.valueEnd
        )
      } else if (attr.name === 'style') {
        extractInlineColours(attr, className, emit)
      }
    }

    // Text content: only when the element contains text and nothing else, so
    // we never swallow a wrapper's children into a single field.
    if (tag.kind === 'open' && TEXT_ELEMENTS.has(tag.name)) {
      const next = tags[index + 1]
      if (next && next.kind === 'close' && next.name === tag.name) {
        const text = html.slice(tag.end, next.start)
        const trimmed = text.trim()

        if (trimmed.length >= MIN_TEXT_LENGTH && !trimmed.includes('<')) {
          const label = labelFromClass(className, tag.name)
          const isLong = trimmed.length > 120

          const added = emit(
            {
              type: isLong ? 'textarea' : 'text',
              id: toId(label, tag.name),
              label,
              default: trimmed,
            },
            tag.end + text.indexOf(trimmed),
            tag.end + text.indexOf(trimmed) + trimmed.length
          )

          // The first real heading names the whole section.
          if (added && !inferredName && /^h[1-3]$/.test(tag.name)) {
            inferredName = trimmed.slice(0, 60)
          }
        }
      }
    }
  }

  const schema = liquidSectionSchema.parse({
    name: sectionName(inferredName, handle, tags),
    settings: settings.map((setting) => ({
      type: setting.type,
      id: setting.id,
      label: setting.label,
      default: setting.default,
    })),
    blocks: [],
  })

  return {
    template: applyEdits(html, edits),
    schema,
    name: schema.name,
    fieldCount: settings.length,
  }
}

function extractInlineColours(
  attr: Attr,
  className: string | undefined,
  emit: (setting: DraftSetting, start: number, end: number) => boolean
): void {
  const declPattern = /([a-zA-Z-]+)\s*:\s*([^;]+)/g

  for (const decl of attr.value.matchAll(declPattern)) {
    const property = decl[1].trim().toLowerCase()
    if (!COLOUR_PROPERTIES.has(property)) continue

    const rawValue = decl[2]
    const colour = rawValue.match(COLOUR_VALUE)
    if (!colour) continue

    const valueOffset =
      attr.valueStart +
      decl.index +
      decl[0].length -
      rawValue.length +
      colour.index!

    const noun =
      property === 'color' ? 'colour' : humanize(property.replace('-color', ''))
    const label = `${labelFromClass(className, 'element')} ${noun}`.trim()

    emit(
      {
        type: 'color',
        id: toId(label, 'colour'),
        label: label.charAt(0).toUpperCase() + label.slice(1),
        default: colour[0],
      },
      valueOffset,
      valueOffset + colour[0].length
    )
  }
}

/**
 * Names the section from what it evidently is.
 *
 * Structural evidence beats the first heading: a block containing a form is an
 * order form whatever its heading says, and `section-3` is never a useful name
 * for anything.
 */
function sectionName(headingText: string, handle: string, tags: Tag[]): string {
  // An explicit `{% section 'hero' %}` handle is the author's own name for the
  // layer and beats anything inferred. Only when the paste had no wrapper (so
  // the handle is a generated `section-2`) do we go looking for a better name.
  const fromHandle = humanize(handle)
  if (fromHandle && !/^Section \d+$/i.test(fromHandle)) return fromHandle

  const names = new Set(tags.map((tag) => tag.name))

  // Structure beats prose: a block containing a form is an order form whatever
  // its heading happens to say.
  if (names.has('form')) return 'Order form'
  if (names.has('footer')) return 'Footer'
  if (names.has('nav') || names.has('header')) return 'Header'

  if (headingText) {
    // A heading is the best human name we have, but only a short one reads as
    // a label rather than a sentence.
    return headingText.length <= 40
      ? headingText
      : `${headingText.slice(0, 37)}…`
  }

  if (names.has('img')) return 'Image'
  if (names.has('video') || names.has('iframe')) return 'Video'
  return 'Content'
}

/** Rebuilds the source with every extracted value swapped for its Liquid tag. */
function applyEdits(source: string, edits: Edit[]): string {
  if (edits.length === 0) return source

  const ordered = [...edits].sort((a, b) => a.start - b.start)

  let out = ''
  let cursor = 0
  for (const edit of ordered) {
    // Defensive: overlapping edits would corrupt the output. Attribute and
    // text extraction cannot overlap by construction, but a malformed tag
    // could confuse the scanner, and dropping an edit degrades better than
    // emitting mangled markup.
    if (edit.start < cursor) continue
    out += source.slice(cursor, edit.start) + edit.replacement
    cursor = edit.end
  }

  return out + source.slice(cursor)
}
