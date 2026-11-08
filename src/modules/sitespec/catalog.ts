import { z } from 'zod'
import {
  blockFitsPage,
  sectionRegistry,
  type SectionDefinition,
} from '../sections/registry'
import type { FieldConfig, SelectOption } from '../sections/editorFields'
import { optionValue } from '../sections/editorFields'
import type { ElementDescriptor } from '../sections/elementDescriptors'
import type { PageRole, SiteKind } from '../sections/storefront'
import { blockElementText } from './element-design'

/**
 * The block library, described for a model rather than drawn for a merchant.
 *
 * Built from the blocks themselves — each block's zod schema says what its
 * content may hold and its editor fields say what each field *means* — so the
 * instructions an AI writes from can never promise a field a block does not
 * have, and a new block reaches the AI builder, the copy-paste prompt and the
 * MCP server the moment it is registered.
 */

export type FieldKind =
  | 'text'
  | 'html'
  | 'image'
  | 'color'
  | 'font'
  | 'link'
  | 'category'
  | 'collection'
  | 'products'
  | 'variant'
  | 'datetime'
  | 'code'
  | 'number'
  | 'boolean'
  | 'choice'
  | 'list'
  | 'texts'

export interface FieldDoc {
  name: string
  kind: FieldKind
  /** The merchant-facing label, which is often the best description. */
  label?: string
  description?: string
  options?: string[]
  maxLength?: number
  min?: number
  max?: number
  maxItems?: number
  default?: unknown
  /** For a list of objects: the fields of each item. */
  items?: FieldDoc[]
}

export interface BlockDoc {
  type: string
  name: string
  category: string
  description?: string
  /** Which kinds of site offer it. */
  sites: SiteKind[]
  /** Which pages it can go on, per site kind. */
  pages: { kind: SiteKind; roles: PageRole[] }[]
  /** Layout blocks: drawn above (`top`) or below (`bottom`) every page. */
  placement?: 'top' | 'bottom'
  /** Exactly one per page. */
  singleton: boolean
  /** The page role that cannot do without it. */
  requiredOn?: PageRole
  fields: FieldDoc[]
  /** The things it draws, each of which a design can style (`elements`). */
  elements: Pick<ElementDescriptor, 'key' | 'label' | 'kind' | 'repeated'>[]
  /** Where elements a design adds (`extras`) can go. */
  slots: { key: string; label: string }[]
}

type JsonSchema = {
  type?: string | string[]
  enum?: unknown[]
  default?: unknown
  maxLength?: number
  minimum?: number
  maximum?: number
  maxItems?: number
  items?: JsonSchema
  properties?: Record<string, JsonSchema>
  anyOf?: JsonSchema[]
  description?: string
}

/**
 * The kinds of page each kind of site has. A landing site is one page — no
 * product or category pages, no shared header and footer — so its blocks go on
 * that page and nowhere else, whatever `blockFitsPage` would allow in general.
 */
const KIND_ROLES: Record<SiteKind, PageRole[]> = {
  LANDING: ['STANDARD'],
  STORE: ['STANDARD', 'PRODUCT', 'CATALOG', 'LAYOUT'],
}
const KINDS: SiteKind[] = ['LANDING', 'STORE']

/** The JSON Schema of a block's content, as a caller may write it. */
export function contentJsonSchema(definition: SectionDefinition): JsonSchema {
  return z.toJSONSchema(definition.schema as z.ZodType, {
    io: 'input',
    unrepresentable: 'any',
  }) as JsonSchema
}

function editorKind(field: FieldConfig): FieldKind | null {
  switch (field.type) {
    case 'text':
    case 'textarea':
      return 'text'
    case 'richtext':
      return 'html'
    case 'image':
      return 'image'
    case 'color':
      return 'color'
    case 'font':
      return 'font'
    case 'link':
      return 'link'
    case 'category':
      return 'category'
    case 'collection':
      return 'collection'
    case 'products':
      return 'products'
    case 'product':
      return 'variant'
    case 'datetime':
      return 'datetime'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'select':
      return 'choice'
    case 'stringArray':
      return 'texts'
    case 'array':
      return 'list'
    default:
      // `code` (the custom code block) and anything newer.
      return (field.type as string) === 'code' ? 'code' : null
  }
}

function schemaKind(schema: JsonSchema): FieldKind {
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
  if (schema.enum) return 'choice'
  if (type === 'boolean') return 'boolean'
  if (type === 'number' || type === 'integer') return 'number'
  if (type === 'array') {
    const item = schema.items
    return item?.type === 'object' || item?.properties ? 'list' : 'texts'
  }
  return 'text'
}

/** Every field declaration, flattened out of the editor's headings. */
function editorFieldMap(fields: FieldConfig[]): Map<string, FieldConfig> {
  const map = new Map<string, FieldConfig>()
  for (const field of fields) {
    if (field.type === 'heading') continue
    map.set(field.name, field)
  }
  return map
}

function describeFields(
  schema: JsonSchema,
  editorFields: FieldConfig[]
): FieldDoc[] {
  const editor = editorFieldMap(editorFields)
  const docs: FieldDoc[] = []
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    const field = editor.get(name)
    const kind = (field && editorKind(field)) ?? schemaKind(property)
    const doc: FieldDoc = { name, kind }
    if (field?.label) doc.label = field.label
    if (field?.description) doc.description = field.description
    if (property.enum) {
      doc.options = property.enum.map(String)
    } else if (field?.type === 'select') {
      doc.options = field.options.map((option: SelectOption) =>
        optionValue(option)
      )
    }
    if (property.maxLength !== undefined) doc.maxLength = property.maxLength
    if (property.minimum !== undefined) doc.min = property.minimum
    if (property.maximum !== undefined) doc.max = property.maximum
    if (property.maxItems !== undefined) doc.maxItems = property.maxItems
    if (property.default !== undefined) doc.default = property.default
    if (kind === 'list' && property.items) {
      const itemFields = field?.type === 'array' ? field.itemFields : []
      doc.items = describeFields(property.items, itemFields)
    }
    docs.push(doc)
  }
  return docs
}

function describeBlock(definition: SectionDefinition): BlockDoc {
  const pages = KINDS.map((kind) => ({
    kind,
    roles: KIND_ROLES[kind].filter((role) =>
      blockFitsPage(definition, kind, role)
    ),
  })).filter((entry) => entry.roles.length > 0)

  return {
    type: definition.key,
    name: definition.name,
    category: definition.category,
    description: definition.description,
    sites: pages.map((entry) => entry.kind),
    pages,
    placement: definition.placement,
    singleton: Boolean(definition.singleton),
    requiredOn: definition.requiredOn,
    fields: describeFields(
      contentJsonSchema(definition),
      definition.editorFields
    ),
    elements: definition.elements.map((element) => ({
      key: element.key,
      label: element.label,
      kind: element.kind,
      ...(element.repeated && { repeated: true }),
    })),
    slots: definition.slots ?? [],
  }
}

let cached: BlockDoc[] | null = null

/** Every block, described. Computed once per process. */
export function blockCatalog(): BlockDoc[] {
  if (!cached) {
    cached = Object.values(sectionRegistry).map((definition) =>
      describeBlock(definition as SectionDefinition)
    )
  }
  return cached
}

/** The blocks a site of this kind can use — optionally on one kind of page. */
export function blocksFor(kind: SiteKind, role?: PageRole): BlockDoc[] {
  return blockCatalog().filter((block) =>
    block.pages.some(
      (entry) => entry.kind === kind && (!role || entry.roles.includes(role))
    )
  )
}

export function findBlockDoc(type: string): BlockDoc | undefined {
  return blockCatalog().find((block) => block.type === type)
}

// ── As text, for a prompt ────────────────────────────────────────────────

const ROLE_WORDS: Record<PageRole, string> = {
  STANDARD: 'pages',
  PRODUCT: 'the product page',
  CATALOG: 'the category page',
  LAYOUT: 'the layout (shown on every page)',
}

function shortDefault(value: unknown): string | null {
  // Lists and objects are left out: their defaults are whole sample designs,
  // and the field list beneath already says what goes in them.
  if (value === undefined || value === '' || value === null) return null
  if (typeof value === 'object') return null
  const text = JSON.stringify(value)
  return text.length > 70 ? `${text.slice(0, 67)}…"` : text
}

const KIND_WORDS: Record<FieldKind, string> = {
  text: 'text',
  html: 'rich text',
  image: 'image URL',
  color: 'hex colour, "" = theme colour',
  font: 'font name, "" = theme font',
  // A landing site's links: it is one page, with no product pages to link to.
  link: 'link ("#order" = the order form, "#section-id", "https://…")',
  category: 'category id',
  collection: 'collection id',
  products: 'list of product ids',
  variant: 'product variant id',
  datetime: 'ISO 8601 date-time',
  code: 'code',
  number: 'number',
  boolean: 'true | false',
  choice: 'one of',
  list: 'list',
  texts: 'list of text',
}

/** A store's links. It has no order form for "#order" to jump to. */
const STORE_LINK_WORDS =
  'link ("/products", "/categories/<handle>", "/page-slug", "#section-id", "https://…")'

function fieldLine(field: FieldDoc, indent: string, kind: SiteKind): string[] {
  let type: string
  if (field.kind === 'choice' && field.options) {
    type = field.options.map((option) => JSON.stringify(option)).join(' | ')
  } else if (field.kind === 'link' && kind === 'STORE') {
    type = STORE_LINK_WORDS
  } else {
    type = KIND_WORDS[field.kind]
  }
  const limits: string[] = []
  if (field.maxLength !== undefined) limits.push(`≤${field.maxLength} chars`)
  if (field.min !== undefined || field.max !== undefined) {
    limits.push(`${field.min ?? '…'}–${field.max ?? '…'}`)
  }
  if (field.maxItems !== undefined) limits.push(`max ${field.maxItems} items`)
  const fallback = shortDefault(field.default)
  const parts = [
    `${indent}- ${field.name}: ${type}`,
    limits.length ? ` (${limits.join(', ')})` : '',
    field.label && field.label.toLowerCase() !== field.name.toLowerCase()
      ? ` — ${field.label}`
      : '',
    fallback ? ` · default ${fallback}` : '',
  ]
  const lines = [parts.join('')]
  if (field.items?.length) {
    lines.push(`${indent}  each item:`)
    for (const item of field.items)
      lines.push(...fieldLine(item, `${indent}  `, kind))
  }
  return lines
}

/**
 * The catalogue as compact text: one heading per block, one line per field.
 *
 * Compact on purpose. The whole library has to fit in a prompt a merchant
 * pastes into a chat window, and a model reads `- align: "left" | "center"`
 * as well as it reads a JSON Schema at a fraction of the length.
 */
export function catalogText(kind: SiteKind, role?: PageRole): string {
  const out: string[] = []
  for (const block of blocksFor(kind, role)) {
    const where = block.pages
      .filter((entry) => entry.kind === kind)
      .flatMap((entry) =>
        // A landing site's one page is "the page", not one of several.
        entry.roles.map((r) =>
          kind === 'LANDING' && r === 'STANDARD' ? 'the page' : ROLE_WORDS[r]
        )
      )
    const flags = [
      block.singleton ? 'exactly one per page' : null,
      block.requiredOn ? `required on ${ROLE_WORDS[block.requiredOn]}` : null,
      block.placement
        ? `always drawn at the ${block.placement === 'top' ? 'top' : 'bottom'}`
        : null,
    ].filter(Boolean)
    out.push(`### ${block.type} — ${block.name}`)
    if (block.description) out.push(block.description)
    out.push(
      `Goes on: ${where.join(', ')}${flags.length ? `. ${flags.join('; ')}` : ''}.`
    )
    for (const field of block.fields) out.push(...fieldLine(field, '', kind))
    out.push(...blockElementText(block))
    out.push('')
  }
  return out.join('\n').trim()
}
