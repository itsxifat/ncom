import { z } from 'zod'
import {
  blockFitsPage,
  getSectionDefinition,
  localizedDefaults,
  sectionRegistry,
  type SectionDefinition,
} from '../sections/registry'
import type { SectionConfig } from '../sections/types'
import type { PageRole, SiteKind } from '../sections/storefront'
import type { SiteLanguage } from '../sections/language'
import { findFont } from '@/lib/fonts'
import { findGoogleFont } from '@/lib/google-fonts'
import { sanitizeCustomCss } from '../sections/customcode/sanitize'
import { contentJsonSchema } from './catalog'
import {
  combineElementDesigns,
  flushNotes,
  normalizeElementDesign,
  normalizeExtras,
  type ElementNotes,
} from './element-design'
import { cutText, wellFormed, type SectionSpec } from './format'
import { STYLE_KEYS, type StyleKey } from './style-keys'

export { STYLE_KEYS }

/**
 * Turns a design someone else wrote into sections NCOM can store.
 *
 * The rule throughout is *repair, don't reject*. The design came from a model
 * — ours, or the merchant's own AI — and models get small things wrong: a
 * headline three characters too long, `"8"` for a number, an alignment called
 * "middle". Throwing the page away for any of that would make the feature
 * useless to exactly the merchants it is for, who cannot fix JSON by hand. So
 * each problem costs only the field it is in: trimmed, converted or put back
 * to the block's default, and written down as an issue the merchant (or the
 * model, over MCP) can read.
 */

export type IssueLevel = 'error' | 'warning' | 'info'

export interface DesignIssue {
  level: IssueLevel
  /** "Section 3 (hero)", "Theme", "Page 2". */
  where: string
  message: string
}

export interface NormalizedSection {
  type: string
  content: Record<string, unknown>
  config: SectionConfig
  isVisible: boolean
  /**
   * The id of the existing section this one rewrites, when the design was an
   * edit of a page NCOM sent out (see export.ts). Lets the builder update that
   * section in place — keeping its per-element styling — rather than replace it.
   */
  ref?: string
  /**
   * Put in by NCOM, not taken from the design: a block the page cannot work
   * without — a landing page's order form, a product page's details, a store's
   * header or footer — added with its defaults because the design had none.
   * A caller deciding whether the design itself gave anything usable counts
   * only the sections without it.
   */
  added?: true
  /**
   * Style keys the design set to a value that could not be used. A caller
   * rewriting an existing section keeps the section's own value for these
   * (see `restyleConfig`) instead of treating the slip as a removal.
   */
  rejectedStyle?: string[]
  /**
   * Elements whose design the design set to null. Element designs are laid
   * over a section's own rather than replacing them, so taking one off has to
   * be said; a caller rewriting an existing section removes these.
   */
  clearedElements?: string[]
}

export interface NormalizeContext {
  kind: SiteKind
  role: PageRole
  language: SiteLanguage
  /**
   * The sections are being added to a page that already exists — appended,
   * or replacing one selected section — rather than making a whole page. The
   * page already has its order form and its required blocks, so none are
   * added here; the caller drops any one-per-page block the page already has.
   */
  partial?: boolean
}

// ── Block names ──────────────────────────────────────────────────────────

/** Names a model reaches for that mean one of ours. */
const ALIASES: Record<string, string> = {
  banner: 'hero',
  herobanner: 'hero',
  text: 'richtext',
  textblock: 'richtext',
  paragraph: 'richtext',
  content: 'richtext',
  picture: 'image',
  photo: 'image',
  callout: 'cta',
  calltoaction: 'cta',
  button: 'cta',
  photos: 'gallery',
  images: 'gallery',
  benefits: 'features',
  feature: 'features',
  youtube: 'video',
  timer: 'countdown',
  reviews: 'testimonials',
  review: 'testimonials',
  testimonial: 'testimonials',
  badges: 'trust',
  trustbadges: 'trust',
  trustbar: 'trust',
  guarantees: 'trust',
  trustsignals: 'trust',
  faqs: 'faq',
  questions: 'faq',
  order: 'orderform',
  checkout: 'orderform',
  form: 'orderform',
  separator: 'divider',
  spacer: 'divider',
  topbar: 'announcement',
  announcementbar: 'announcement',
  navbar: 'header',
  navigation: 'header',
  nav: 'header',
  carousel: 'slider',
  slideshow: 'slider',
  collections: 'categories',
  productgrid: 'products',
  productlist: 'products',
  featuredproducts: 'products',
  product: 'productdetails',
  productinfo: 'productdetails',
  catalog: 'productlisting',
  catalogue: 'productlisting',
  listing: 'productlisting',
  related: 'relatedproducts',
  youmayalsolike: 'relatedproducts',
  offers: 'promos',
  promo: 'promos',
  html: 'customcode',
  code: 'customcode',
  custom: 'customcode',
  embed: 'customcode',
}

function squash(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Words a model adds around a block's name — "hero section", "faq block",
 * "products grid" — that say nothing about which block it means.
 */
const FILLER = /(section|block|module|widget|component)$/

/**
 * Block names are short; a longer "type" is not one, and is not worth
 * comparing letter by letter against every block either.
 */
const MAX_TYPE_LENGTH = 40

/** The block a section names, or null — tolerant of case, dashes and synonyms. */
export function resolveBlockType(raw: string): string | null {
  if (raw.length > MAX_TYPE_LENGTH) return null
  for (const key of [squash(raw), squash(raw).replace(FILLER, '')]) {
    if (!key) continue
    const direct = Object.keys(sectionRegistry).find(
      (type) => squash(type) === key
    )
    if (direct) return direct
    // Own entries only: a name such as "constructor" must not find what
    // every object inherits.
    const alias = Object.hasOwn(ALIASES, key) ? ALIASES[key] : undefined
    if (alias && getSectionDefinition(alias)) return alias
  }
  return null
}

/** The block name a section gives, as text — "" when it gives none. */
function typeName(spec: SectionSpec): string {
  if (typeof spec.type === 'string') return spec.type.trim()
  if (typeof spec.type === 'number') return String(spec.type)
  return ''
}

function closestBlock(raw: string): string | null {
  if (raw.length > MAX_TYPE_LENGTH) return null
  const key = squash(raw)
  let best: string | null = null
  let bestScore = Infinity
  for (const type of Object.keys(sectionRegistry)) {
    const score = distance(key, type)
    if (score < bestScore) {
      bestScore = score
      best = type
    }
  }
  return bestScore <= 3 ? best : null
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      previous = current
    }
  }
  return row[b.length]!
}

// ── Section style ────────────────────────────────────────────────────────

/** A section colour. The builder's colour picker can make one see-through, so 8 digits are allowed here. */
const hexColor = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)

/**
 * A theme colour: only what the store's Theme settings accept (3 or 6 hex
 * digits). Anything else would be saved and then make that form refuse to
 * save, over a colour the merchant never typed. "#1f7a4dff" — fully opaque,
 * which some models write — is the same colour and just loses its last two
 * digits; a see-through theme colour is not something a theme can have.
 */
const themeColor = z
  .string()
  .trim()
  .transform((value) =>
    /^#[0-9a-fA-F]{6}[fF]{2}$/.test(value) ? value.slice(0, 7) : value
  )
  .pipe(
    z
      .string()
      .regex(
        /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
        'use a hex colour like #1f7a4d, without transparency'
      )
  )

/**
 * A font a design may name: one from the bundled catalogue, or any other
 * Google Fonts family, which the page loads through NCOM's font proxy.
 *
 * Stored under the canonical spelling either way: a model that writes
 * "lexend" means Lexend, and keeping one spelling is what lets the editor's
 * font picker show the family as chosen and every page that names it share
 * one stylesheet address.
 */
const fontName = z
  .string()
  .trim()
  .transform((name, ctx) => {
    const canonical = findFont(name)?.name ?? findGoogleFont(name)?.family
    if (!canonical) {
      ctx.addIssue({
        code: 'custom',
        message: `unknown font "${name}" — use a font from the guide's list or a Google Fonts family by its exact name`,
      })
      return z.NEVER
    }
    return canonical
  })

const imageUrl = z
  .string()
  .trim()
  .max(2000)
  .regex(/^(?:https:\/\/|\/)/, 'must be an https:// address')

/**
 * The section design a design may set in `style`: the wrapper's part of
 * SectionConfig. What is inside the block — each element's design and the
 * elements added to it — comes in beside it, as `elements` and `extras`, read
 * by element-design.ts against the block's own list of elements.
 *
 * Only what shows on the page is offered. `textColor` and `headingColor` are
 * left out on purpose: the blocks draw their text in the theme's text colour
 * whatever the section says (and nothing reads `headingColor`), so a design
 * that set them would get nothing for it — an element's own `color`, or the
 * theme's custom CSS on the section's `customClassName`, is what recolours a
 * section's text. Leaving them out also keeps them out of export.ts, so a
 * value the merchant set in the builder survives a round trip untouched
 * rather than being sent out and judged.
 */
const STYLE_FIELDS = {
  backgroundVariant: z.enum(['default', 'muted', 'primary', 'dark', 'custom']),
  backgroundColor: hexColor,
  backgroundImageUrl: imageUrl,
  backgroundSize: z.enum(['cover', 'contain', 'auto']),
  backgroundPosition: z.enum(['center', 'top', 'bottom', 'left', 'right']),
  backgroundOverlay: z.number().min(0).max(80),
  alignment: z.enum(['left', 'center', 'right']),
  paddingTop: z.number().min(0).max(30),
  paddingBottom: z.number().min(0).max(30),
  maxWidth: z.number().int().min(320).max(2000),
  fullWidth: z.boolean(),
  headingFont: fontName,
  bodyFont: fontName,
  borderRadius: z.number().min(0).max(80),
  borderTop: z.boolean(),
  borderBottom: z.boolean(),
  hideOnMobile: z.boolean(),
  hideOnDesktop: z.boolean(),
  anchorId: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9-]{0,40}$/, 'use lowercase letters, digits and -'),
  // Class names for the theme's custom CSS to find the section by. Words
  // only: the value lands in a `class` attribute, and a class is all it is.
  customClassName: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, ' ').replace(/^\./, ''))
    .pipe(
      z
        .string()
        .max(100)
        .regex(
          /^-?[A-Za-z_][A-Za-z0-9_-]*(?: -?[A-Za-z_][A-Za-z0-9_-]*)*$/,
          'use class names of letters, digits, - and _, separated by spaces'
        )
    ),
} satisfies Record<StyleKey, z.ZodType>

function normalizeStyle(
  style: Record<string, unknown> | undefined,
  where: string,
  issues: DesignIssue[],
  rejected: string[] = []
): SectionConfig {
  const config: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(style ?? {})) {
    // Own entries only, so "constructor" or "toString" is an unknown style
    // like any other rather than something every object inherits.
    const schema = Object.hasOwn(STYLE_FIELDS, key)
      ? (STYLE_FIELDS[key as keyof typeof STYLE_FIELDS] as z.ZodType)
      : undefined
    if (!schema) {
      issues.push({
        level: 'warning',
        where,
        message: `Ignored the style "${key}" — sections can't set it.`,
      })
      continue
    }
    // null or "" means "no such style". A section's style is the whole of
    // it, so a style set to nothing is simply not there — on a section the
    // design rewrites, that removes it. ("" must not reach Number(), either:
    // that would make an empty padding 0.)
    if (raw === null || (typeof raw === 'string' && raw.trim() === '')) continue
    let value = raw
    if (typeof raw === 'string' && schema instanceof z.ZodNumber)
      value = Number(raw)
    if (raw === 'true' || raw === 'false') {
      if (schema instanceof z.ZodBoolean) value = raw === 'true'
    }
    const parsed = schema.safeParse(value)
    if (parsed.success) {
      config[key] = parsed.data
    } else {
      rejected.push(key)
      issues.push({
        level: 'warning',
        where,
        message: `Ignored the style "${key}": ${parsed.error.issues[0]?.message ?? 'not valid'}.`,
      })
    }
  }
  // A custom background colour only shows with the custom variant; a model
  // that gave a colour plainly meant it to show.
  if (config.backgroundColor && !config.backgroundVariant) {
    config.backgroundVariant = 'custom'
  }
  return config as SectionConfig
}

// ── Content ──────────────────────────────────────────────────────────────

type JsonSchema = ReturnType<typeof contentJsonSchema>

const schemaCache = new Map<string, JsonSchema>()
function jsonSchemaOf(definition: SectionDefinition): JsonSchema {
  let schema = schemaCache.get(definition.key)
  if (!schema) {
    schema = contentJsonSchema(definition)
    schemaCache.set(definition.key, schema)
  }
  return schema
}

/** Spellings of a choice that mean one of the block's own options. */
const ENUM_SYNONYMS: Record<string, string> = {
  middle: 'center',
  centre: 'center',
  centered: 'center',
  centred: 'center',
  start: 'left',
  end: 'right',
  // An order-form question's kind, in the words form builders use for it.
  select: 'choice',
  radio: 'choice',
  dropdown: 'choice',
  textarea: 'longtext',
  paragraph: 'longtext',
}

/**
 * Field names a model writes for a list item's field — an FAQ item's
 * "question" for our `q` — with the fields each may mean, in order of
 * likelihood. Used only inside list items, where the item's own field names
 * are terse and a model cannot see them, and only when the item has that field
 * and was not also given it by name.
 */
const ITEM_FIELD_SYNONYMS: Record<string, string[]> = {
  question: ['q', 'label'],
  answer: ['a'],
  // An order-form question, written the way form builders describe one.
  type: ['kind'],
  choices: ['options'],
  values: ['options'],
  answers: ['options'],
  mandatory: ['required'],
  isrequired: ['required'],
  hint: ['placeholder'],
  example: ['placeholder'],
  url: ['href', 'image'],
  link: ['href', 'buttonHref'],
  path: ['href'],
  href: ['buttonHref'],
  button: ['buttonText'],
  cta: ['buttonText'],
  text: ['label'],
  title: ['label'],
  name: ['label', 'title'],
  heading: ['title'],
  headline: ['title'],
  description: ['text'],
  body: ['text'],
  content: ['text'],
  quote: ['text'],
  review: ['text'],
  comment: ['text'],
  author: ['name'],
  customer: ['name'],
  src: ['image'],
  img: ['image'],
  imageurl: ['image'],
  photo: ['image'],
  picture: ['image'],
  stars: ['rating'],
}

function isTextField(schema: JsonSchema | undefined): boolean {
  if (!schema || schema.enum) return false
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
  return type === 'string'
}

/**
 * The field of a list item a bare piece of text belongs in, when a model
 * wrote a list of strings where each item is an object — `["Pure honey",
 * "Lab tested"]` for a features list. A link or a picture address goes in the
 * item's picture or link; words go in its title, question or label.
 */
function textFieldFor(
  properties: Record<string, JsonSchema>,
  text: string
): string | null {
  const looksLikeAddress = /^(?:https?:\/\/|\/)/.test(text.trim())
  const preferred = looksLikeAddress
    ? ['image', 'href', 'url']
    : ['title', 'q', 'label', 'text', 'name']
  return (
    preferred.find(
      (name) => Object.hasOwn(properties, name) && isTextField(properties[name])
    ) ?? null
  )
}

interface CoerceContext {
  where: string
  issues: DesignIssue[]
}

/**
 * Nudges values into the types the block expects: `"8"` → 8, `8` → `"8"`,
 * `"true"` → true, `"Pure honey"` → `{ title: "Pure honey" }` in a list of
 * objects. Driven by the block's JSON Schema, so it only ever converts toward
 * what the field actually is.
 *
 * It also reports what it has to leave out below the top level: zod drops an
 * unknown field inside a list item without a word, and an FAQ item written as
 * `{ question, answer }` would otherwise come out empty — and disappear from
 * the page — with nothing in the notes to say why.
 */
function coerce(
  value: unknown,
  schema: JsonSchema | undefined,
  path: PropertyKey[],
  context: CoerceContext
): unknown {
  if (typeof value === 'string') value = wellFormed(value)
  if (!schema || value === null || value === undefined) return value
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
  if (schema.enum && typeof value === 'string') {
    const lower = value.toLowerCase()
    const wanted = Object.hasOwn(ENUM_SYNONYMS, lower)
      ? ENUM_SYNONYMS[lower]
      : lower
    const match = schema.enum.find(
      (option) => typeof option === 'string' && option.toLowerCase() === wanted
    )
    if (match !== undefined) return match
    // Select values that are numbers written as strings ("4" columns).
    const asString = schema.enum.find((option) => String(option) === value)
    if (asString !== undefined) return asString
  }
  if (schema.enum && typeof value === 'number') {
    const match = schema.enum.find((option) => String(option) === String(value))
    if (match !== undefined) return match
  }
  if ((type === 'number' || type === 'integer') && typeof value === 'string') {
    const number = Number(value.trim())
    if (value.trim() !== '' && Number.isFinite(number)) {
      return type === 'integer' ? Math.round(number) : number
    }
  }
  if (type === 'integer' && typeof value === 'number') return Math.round(value)
  if (
    type === 'string' &&
    (typeof value === 'number' || typeof value === 'boolean')
  ) {
    return String(value)
  }
  if (type === 'boolean' && typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }
  if (type === 'array' && Array.isArray(value)) {
    const itemProperties = schema.items?.properties
    const wrapped = new Set<string>()
    const items = value.map((item, index) => {
      let entry: unknown = item
      if (
        itemProperties &&
        (typeof item === 'string' || typeof item === 'number')
      ) {
        const field = textFieldFor(itemProperties, String(item))
        if (field) {
          entry = { [field]: String(item) }
          wrapped.add(field)
        }
      }
      return coerce(entry, schema.items, [...path, index], context)
    })
    if (wrapped.size > 0) {
      context.issues.push({
        level: 'info',
        where: context.where,
        message: `Read the plain text in "${fieldName(path)}" as each item's ${[...wrapped].map((field) => `"${field}"`).join(' or ')}.`,
      })
    }
    return items
  }
  // A list given as one item, or as one line of text, rather than as a list:
  // a single review object, a trust list typed as lines. Read as the list it
  // plainly is — the fallback would be the block's sample items, which are
  // somebody else's words on the merchant's page.
  if (type === 'array' && isRecord(value) && schema.items?.properties) {
    context.issues.push({
      level: 'info',
      where: context.where,
      message: `Read "${fieldName(path)}" as a list of one item.`,
    })
    return coerce([value], schema, path, context)
  }
  if (
    type === 'array' &&
    typeof value === 'string' &&
    schema.items?.properties
  ) {
    const lines = value
      .split(/\n|;/)
      .map((part) => part.trim())
      .filter(Boolean)
    return coerce(lines, schema, path, context)
  }
  if (
    type === 'array' &&
    typeof value === 'string' &&
    schema.items?.type === 'string'
  ) {
    // A list of words given as one line.
    return value
      .split(/\n|,|;/)
      .map((part) => part.trim())
      .filter(Boolean)
  }
  if ((type === 'object' || schema.properties) && isRecord(value)) {
    const properties = schema.properties
    // A field that takes any key (a z.record) has nothing to check them against.
    const open =
      !properties ||
      (typeof (schema as { additionalProperties?: unknown })
        .additionalProperties === 'object' &&
        (schema as { additionalProperties?: unknown }).additionalProperties !==
          null)
    const inItem = typeof path[path.length - 1] === 'number'
    const given = value
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(given)) {
      // Never a key that would set the object's prototype instead of a field.
      if (key === '__proto__') continue
      if (open || !properties) {
        out[key] = entry
        continue
      }
      let field: string | undefined = Object.hasOwn(properties, key)
        ? key
        : undefined
      if (!field && inItem) {
        const squashed = squash(key)
        const candidates = Object.hasOwn(ITEM_FIELD_SYNONYMS, squashed)
          ? ITEM_FIELD_SYNONYMS[squashed]!
          : []
        field = candidates.find(
          (name) =>
            Object.hasOwn(properties, name) &&
            !Object.hasOwn(given, name) &&
            !Object.hasOwn(out, name)
        )
        if (field) {
          context.issues.push({
            level: 'info',
            where: context.where,
            message: `Read "${fieldName([...path, key])}" as "${field}".`,
          })
        }
      }
      if (!field) {
        const fields = Object.keys(properties).join(', ')
        context.issues.push({
          level: 'warning',
          where: context.where,
          message: inItem
            ? `Ignored "${fieldName([...path, key])}" — an item of "${fieldName(path.slice(0, -1))}" has only these fields: ${fields}.`
            : `Ignored "${fieldName([...path, key])}" — "${fieldName(path)}" has only these fields: ${fields}.`,
        })
        continue
      }
      out[field] = coerce(entry, properties[field], [...path, field], context)
    }
    return out
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** The value at `path`, following only the objects' own fields. */
function getAt(root: unknown, path: PropertyKey[]): unknown {
  let current = root
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined
    if (!Object.hasOwn(current, key)) return undefined
    current = (current as Record<PropertyKey, unknown>)[key]
  }
  return current
}

/** Sets (or, with `undefined`, removes) the value at `path`; false when there is nothing there to change. */
function setAt(root: unknown, path: PropertyKey[], value: unknown): boolean {
  if (path.length === 0) return false
  const parent = getAt(root, path.slice(0, -1))
  if (parent === null || typeof parent !== 'object') return false
  const key = path[path.length - 1]!
  if (
    Array.isArray(parent) &&
    (typeof key !== 'number' || key >= parent.length)
  ) {
    return false
  }
  if (value === undefined) {
    if (!Object.hasOwn(parent, key)) return false
    delete (parent as Record<PropertyKey, unknown>)[key]
  } else {
    ;(parent as Record<PropertyKey, unknown>)[key] = value
  }
  return true
}

function fieldName(path: PropertyKey[]): string {
  return path
    .map((key) => (typeof key === 'number' ? `[${key + 1}]` : String(key)))
    .join('.')
    .replace(/\.\[/g, '[')
}

/**
 * Marks a list item being left out. Items are only marked while the problems
 * of one check are worked through, and taken out after — taking one out at
 * once would move every later item up one place, so the next problem's
 * position would point at the item after the one it is about.
 */
const DROPPED = Symbol('dropped')

/** True when `path` runs through an item already being left out. */
function insideDropped(root: unknown, path: PropertyKey[]): boolean {
  let current = root
  for (const key of path) {
    if (current === DROPPED) return true
    if (current === null || typeof current !== 'object') return false
    current = (current as Record<PropertyKey, unknown>)[key]
  }
  return current === DROPPED
}

/** Takes the marked items out of every list. */
function prune(value: unknown): void {
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index--) {
      if (value[index] === DROPPED) value.splice(index, 1)
      else prune(value[index])
    }
  } else if (isRecord(value)) {
    for (const entry of Object.values(value)) prune(entry)
  }
}

/**
 * Fixes one validation problem in place. Returns the sentence describing
 * what was done, or null when it could not be fixed here.
 */
function repair(
  candidate: Record<string, unknown>,
  issue: z.core.$ZodIssue,
  defaults: Record<string, unknown>
): string | null {
  const path = issue.path as PropertyKey[]
  if (path.length === 0) return null
  const value = getAt(candidate, path)
  const name = fieldName(path)

  if (issue.code === 'too_big') {
    const maximum = Number(issue.maximum)
    if (typeof value === 'string') {
      setAt(candidate, path, cutText(value, maximum).trimEnd())
      return `Shortened "${name}" to ${maximum} characters.`
    }
    if (Array.isArray(value)) {
      setAt(candidate, path, value.slice(0, maximum))
      return `Kept the first ${maximum} items of "${name}".`
    }
    if (typeof value === 'number') {
      setAt(candidate, path, maximum)
      return `Lowered "${name}" to ${maximum}, the most it allows.`
    }
  }
  if (issue.code === 'too_small' && typeof value === 'number') {
    const minimum = Number(issue.minimum)
    setAt(candidate, path, minimum)
    return `Raised "${name}" to ${minimum}, the least it allows.`
  }

  const reason = issue.message.toLowerCase()
  // Inside a list, the block's defaults are no help: they are sample items —
  // "Premium fabric", a reviewer called Rahim — and the one at the same place
  // in the sample has nothing to do with the merchant's item. A bad field of
  // an item is left out, so the item's own default ("" mostly) fills it; an
  // item that cannot be used at all is left out whole.
  const last = path.findLastIndex((key) => typeof key === 'number')
  if (last !== -1) {
    const itemPath = path.slice(0, last + 1)
    if (itemPath.length < path.length && setAt(candidate, path, undefined)) {
      return `"${name}" wasn't valid (${reason}) and was left out.`
    }
    if (setAt(candidate, itemPath, DROPPED)) {
      return `Left out item ${Number(path[last]) + 1} of "${fieldName(path.slice(0, last))}" — ${itemPath.length < path.length ? `its "${fieldName(path.slice(last + 1))}" wasn't valid (${reason})` : `it wasn't valid (${reason})`}.`
    }
    return null
  }

  // Anything else: the block's own default for that field, or no value, so
  // the block's schema fills it. Except a list: its default is the block's
  // sample items, and a merchant's page showing invented reviews or another
  // shop's selling points is worse than an empty list. Only when the block
  // cannot have an empty one (it comes back here with []) are samples used.
  const fallback = getAt(defaults, path)
  if (
    Array.isArray(fallback) &&
    fallback.length > 0 &&
    !(Array.isArray(value) && value.length === 0)
  ) {
    setAt(candidate, path, [])
    return `"${name}" wasn't a usable list (${reason}), so it was left empty.`
  }
  if (fallback !== undefined) {
    setAt(candidate, path, structuredClone(fallback))
    return `"${name}" wasn't valid (${reason}), so it was left at the default.`
  }
  if (setAt(candidate, path, undefined)) {
    return `"${name}" wasn't valid (${reason}) and was left out.`
  }
  return null
}

function normalizeContent(
  definition: SectionDefinition,
  raw: Record<string, unknown> | undefined,
  language: SiteLanguage,
  where: string,
  issues: DesignIssue[]
): Record<string, unknown> {
  const defaults = localizedDefaults(definition, language)
  const schema = jsonSchemaOf(definition)
  const known = new Set(Object.keys(schema.properties ?? {}))

  const given: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (!known.has(key)) {
      issues.push({
        level: 'warning',
        where,
        message: `Ignored "${key}" — the ${definition.name.toLowerCase()} block has no such field.`,
      })
      continue
    }
    if (value === null) continue
    given[key] = coerce(value, schema.properties?.[key], [key], {
      where,
      issues,
    })
  }

  // A copy of its own throughout, so repairs never reach into `defaults`.
  const candidate = structuredClone({ ...defaults, ...given })
  for (let attempt = 0; attempt < 12; attempt++) {
    const parsed = definition.schema.safeParse(candidate)
    if (parsed.success) return parsed.data as Record<string, unknown>
    let fixed = false
    for (const issue of parsed.error.issues) {
      // Part of an item already being left out: nothing more to do for it.
      if (insideDropped(candidate, issue.path as PropertyKey[])) {
        fixed = true
        continue
      }
      const message = repair(candidate, issue, defaults)
      if (message) {
        fixed = true
        issues.push({ level: 'warning', where, message })
      }
    }
    prune(candidate)
    if (!fixed) break
  }
  issues.push({
    level: 'warning',
    where,
    message:
      'Its content could not be used, so the block starts from its defaults.',
  })
  return defaults
}

// ── Sections and pages ───────────────────────────────────────────────────

function sectionLabel(index: number, type: string) {
  return `Section ${index + 1} (${type})`
}

/**
 * One section, or null when it cannot go on this page at all.
 */
export function normalizeSection(
  spec: SectionSpec,
  index: number,
  context: NormalizeContext,
  issues: DesignIssue[]
): NormalizedSection | null {
  const raw = typeName(spec)
  if (!raw) {
    issues.push({
      level: 'error',
      where: sectionLabel(index, '?'),
      message:
        'This section has no "type" naming its block, so it was left out.',
    })
    return null
  }
  let type = resolveBlockType(raw)
  // "banner" means a hero on a landing page, but a hero's button jumps to the
  // order form, which a store does not have. On a store the same intent is a
  // slider with one slide, whose button goes where the design points.
  let bannerContent: Record<string, unknown> | undefined
  if (type === 'hero' && context.kind === 'STORE' && squash(raw) !== 'hero') {
    type = 'slider'
    const hero = isRecord(spec.content) ? spec.content : {}
    if (!Array.isArray(hero.slides)) {
      bannerContent = {
        slides: [
          {
            ...(typeof hero.image === 'string' && { image: hero.image }),
            ...(typeof hero.eyebrow === 'string' && { eyebrow: hero.eyebrow }),
            ...(typeof hero.title === 'string' && { title: hero.title }),
            ...(typeof hero.subtitle === 'string' && {
              subtitle: hero.subtitle,
            }),
            ...(typeof hero.ctaText === 'string' && {
              buttonText: hero.ctaText,
            }),
            buttonHref: '/products',
          },
        ],
      }
    }
  }
  if (!type) {
    const guess = closestBlock(raw)
    const shown = cutText(raw, MAX_TYPE_LENGTH)
    issues.push({
      level: 'error',
      where: sectionLabel(index, shown),
      message: `There is no block called "${shown}", so it was left out.${guess ? ` Did you mean "${guess}"?` : ''}`,
    })
    return null
  }
  const definition = getSectionDefinition(type)!
  const where = sectionLabel(index, type)
  if (type !== raw) {
    issues.push({
      level: 'info',
      where,
      message: `Read "${raw}" as the ${definition.name.toLowerCase()} block.`,
    })
  }
  if (!blockFitsPage(definition, context.kind, context.role)) {
    issues.push({
      level: 'error',
      where,
      message: `The ${definition.name.toLowerCase()} block can't go on ${placeName(context)}. It was left out.`,
    })
    return null
  }

  let content =
    bannerContent ?? (isRecord(spec.content) ? spec.content : undefined)
  if (!content && spec.content !== undefined && spec.content !== null) {
    issues.push({
      level: 'warning',
      where,
      message:
        'Ignored "content" — it must be an object of the block’s fields.',
    })
  }
  let style = isRecord(spec.style) ? spec.style : undefined
  // A model that thinks of everything about a section's look as its "style"
  // puts its elements there too. It plainly meant them.
  let elementsSpec = spec.elements
  let extrasSpec = spec.extras
  if (
    style &&
    (Object.hasOwn(style, 'elements') || Object.hasOwn(style, 'extras'))
  ) {
    const { elements, extras, ...rest } = style
    // Both places at once: the section's own "elements" over the style's.
    elementsSpec =
      isRecord(elements) && isRecord(elementsSpec)
        ? { ...elements, ...elementsSpec }
        : (elementsSpec ?? elements)
    extrasSpec ??= extras
    style = rest
  }
  if (!style && spec.style !== undefined && spec.style !== null) {
    // The call to action, countdown and categories blocks have a content
    // field called "style" (outline, cards…). A model that put it beside the
    // content rather than in it plainly meant that one.
    const ownStyle =
      typeof spec.style === 'string' &&
      Object.hasOwn(jsonSchemaOf(definition).properties ?? {}, 'style') &&
      !(content && Object.hasOwn(content, 'style'))
    if (ownStyle) {
      content = { ...content, style: spec.style }
      issues.push({
        level: 'info',
        where,
        message: `Read "style": "${cutText(String(spec.style), 40)}" as the block’s own "style" setting.`,
      })
    } else {
      issues.push({
        level: 'warning',
        where,
        message:
          'Ignored "style" — a section’s design must be an object, like { "backgroundVariant": "muted" }.',
      })
    }
  }

  const rejectedStyle: string[] = []
  const normalizedContent = normalizeContent(
    definition,
    content,
    context.language,
    where,
    issues
  )
  const config = normalizeStyle(style, where, issues, rejectedStyle)

  // Inside the block: each element's design and the elements added to it.
  // Left out means "as it is", so neither is set unless the design gave it.
  const notes: ElementNotes = { where, list: [] }
  const extras =
    extrasSpec !== undefined && extrasSpec !== null
      ? normalizeExtras(extrasSpec, { definition, kind: context.kind, notes })
      : undefined
  const elements =
    elementsSpec !== undefined && elementsSpec !== null
      ? normalizeElementDesign(elementsSpec, {
          definition,
          extraIds: extras
            ? new Set(extras.extras.map((extra) => extra.id))
            : null,
          notes,
        })
      : undefined
  flushNotes(notes, issues)
  // An added element's own `style`, then the design's `elements` over it.
  const designs = combineElementDesigns(extras?.styles, elements?.elements)
  if (Object.keys(designs).length > 0) config.elements = designs
  if (extras) config.extras = extras.extras

  return {
    type,
    content: normalizedContent,
    config,
    isVisible: spec.hidden !== true && spec.hidden !== 'true',
    ref: typeof spec.id === 'string' && spec.id ? spec.id : undefined,
    ...(rejectedStyle.length > 0 && { rejectedStyle }),
    ...(elements &&
      elements.cleared.length > 0 && {
        clearedElements: elements.cleared,
      }),
  }
}

function placeName(context: NormalizeContext): string {
  if (context.role === 'LAYOUT') return "the store's header and footer area"
  if (context.role === 'PRODUCT') return 'the product page'
  if (context.role === 'CATALOG') return 'the category page'
  return context.kind === 'STORE' ? 'an online store page' : 'a landing page'
}

/** A section with the block's defaults, for blocks a page must have. */
export function defaultSection(
  type: string,
  language: SiteLanguage
): NormalizedSection {
  const definition = getSectionDefinition(type)!
  return {
    type,
    content: localizedDefaults(definition, language),
    config: {},
    isVisible: true,
  }
}

/** Layout blocks found among a store page's sections, set aside. */
export function isLayoutBlock(type: string): boolean {
  return Boolean(getSectionDefinition(type)?.placement)
}

/**
 * A page's sections, with the page's own rules applied: one order form on a
 * landing page, the product details on the product page, a header and a footer
 * in a store's layout.
 *
 * On an ordinary store page, a header or footer the design included is
 * returned separately in `layout` — those belong to every page at once, and the
 * caller decides whether to apply them there.
 */
export function normalizePageSections(
  specs: SectionSpec[],
  context: NormalizeContext,
  issues: DesignIssue[]
): { sections: NormalizedSection[]; layout: NormalizedSection[] } {
  const layout: NormalizedSection[] = []
  const sections: NormalizedSection[] = []

  specs.forEach((spec, index) => {
    const type = resolveBlockType(typeName(spec))
    if (
      type &&
      context.kind === 'STORE' &&
      context.role !== 'LAYOUT' &&
      isLayoutBlock(type)
    ) {
      const section = normalizeSection(
        spec,
        index,
        { ...context, role: 'LAYOUT' },
        issues
      )
      if (section) layout.push(section)
      return
    }
    const section = normalizeSection(spec, index, context, issues)
    if (section) sections.push(section)
  })

  enforceSingletons(sections, issues)

  if (context.partial) return { sections, layout }

  if (context.kind === 'LANDING' && context.role === 'STANDARD') {
    if (!sections.some((section) => section.type === 'orderform')) {
      sections.push({
        ...defaultSection('orderform', context.language),
        added: true,
      })
      issues.push({
        level: 'info',
        where: 'Page',
        message:
          'Added the order form at the end — a landing page needs one so visitors can order.',
      })
    }
  }

  for (const definition of Object.values(sectionRegistry)) {
    const required = (definition as SectionDefinition).requiredOn
    if (required && required === context.role) {
      if (!sections.some((section) => section.type === definition.key)) {
        sections.unshift({
          ...defaultSection(definition.key, context.language),
          added: true,
        })
        issues.push({
          level: 'info',
          where: 'Page',
          message: `Added the ${definition.name.toLowerCase()} block — this page can't work without it.`,
        })
      }
    }
  }

  if (context.role === 'LAYOUT') {
    return { sections: orderLayout(sections, context.language, issues), layout }
  }
  return { sections, layout }
}

function enforceSingletons(
  sections: NormalizedSection[],
  issues: DesignIssue[]
) {
  const seen = new Set<string>()
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index]!
    const definition = getSectionDefinition(section.type)
    if (!definition?.singleton && !definition?.placement) continue
    if (seen.has(section.type)) {
      sections.splice(index, 1)
      index -= 1
      issues.push({
        level: 'warning',
        where: 'Page',
        message: `A page can have only one ${definition.name.toLowerCase()} block, so the extra one was left out.`,
      })
      continue
    }
    seen.add(section.type)
  }
}

/**
 * A store's layout as it must be: a header and a footer (the defaults, when
 * there is none), then announcement, header, footer — whatever order they
 * were written in.
 */
export function orderLayout(
  sections: NormalizedSection[],
  language: SiteLanguage,
  issues: DesignIssue[]
): NormalizedSection[] {
  for (const needed of ['header', 'footer']) {
    if (!sections.some((section) => section.type === needed)) {
      sections.push({ ...defaultSection(needed, language), added: true })
      issues.push({
        level: 'info',
        where: 'Layout',
        message: `Added a ${needed} — every store page shows one.`,
      })
    }
  }
  const rank = (section: NormalizedSection) => {
    const placement = getSectionDefinition(section.type)?.placement
    if (section.type === 'announcement') return 0
    if (placement === 'top') return 1
    return 2
  }
  return [...sections].sort((a, b) => rank(a) - rank(b))
}

// ── Theme ────────────────────────────────────────────────────────────────

export interface ThemeDesign {
  primaryColor?: string
  secondaryColor?: string
  backgroundColor?: string
  textColor?: string
  headingFont?: string
  bodyFont?: string
  buttonStyle?: 'SOLID' | 'OUTLINE' | 'GHOST'
  borderRadius?: 'none' | 'sm' | 'md' | 'lg' | 'full'
  headingWeight?: '400' | '500' | '600' | '700' | '800'
  containerWidth?: string
  numerals?: 'latin' | 'bangla'
  /** Space inside blocks and between their parts. */
  spacingScale?: Spacing
  /** Space between one section and the next. */
  sectionSpacing?: Spacing
  /** Body text size, as a multiple of the normal size. */
  bodyScale?: '0.9' | '1' | '1.1' | '1.2'
  showStickyHeader?: boolean
  logoUrl?: string
  logoWidth?: number
  faviconUrl?: string
  /**
   * CSS for the whole site, for what the blocks and element designs cannot
   * say. Sanitised here as the custom code block's CSS is — no `@import`, no
   * script URLs, no way out of its `<style>` — because unlike the theme form,
   * nobody typed it: a model wrote it, and the merchant pasted it unread.
   */
  customCss?: string
}

type Spacing = 'compact' | 'comfortable' | 'spacious'

/** The Theme settings' own limit (`updateThemeSchema`). */
const MAX_THEME_CSS = 20_000

const spacing = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) =>
    value === 'tight' || value === 'small'
      ? 'compact'
      : value === 'normal' || value === 'medium' || value === 'default'
        ? 'comfortable'
        : value === 'loose' || value === 'large' || value === 'airy'
          ? 'spacious'
          : value
  )
  .pipe(z.enum(['compact', 'comfortable', 'spacious']))

const THEME_FIELDS = {
  primaryColor: themeColor,
  secondaryColor: themeColor,
  backgroundColor: themeColor,
  textColor: themeColor,
  headingFont: fontName,
  bodyFont: fontName,
  buttonStyle: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.enum(['SOLID', 'OUTLINE', 'GHOST'])),
  borderRadius: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(['none', 'sm', 'md', 'lg', 'full'])),
  headingWeight: z
    .union([z.string(), z.number()])
    .transform(String)
    .pipe(z.enum(['400', '500', '600', '700', '800'])),
  containerWidth: z
    .union([z.string(), z.number()])
    .transform((value) =>
      typeof value === 'number' ? `${value}px` : value.trim()
    )
    .pipe(
      z.string().regex(/^(?:9\d\d|1\d\d\d|2000)px$/, 'between 900px and 2000px')
    ),
  numerals: z.enum(['latin', 'bangla']),
  spacingScale: spacing,
  sectionSpacing: spacing,
  bodyScale: z
    .union([z.string(), z.number()])
    .transform((value) => String(Number(value)))
    .pipe(z.enum(['0.9', '1', '1.1', '1.2'], 'one of 0.9, 1, 1.1, 1.2')),
  showStickyHeader: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true'),
  logoUrl: imageUrl,
  logoWidth: z.coerce.number().int().min(40).max(480),
  faviconUrl: imageUrl,
  customCss: z.string().transform((value, ctx) => {
    const css = sanitizeCustomCss(value)
    if (css.length > MAX_THEME_CSS) {
      ctx.addIssue({
        code: 'custom',
        message: `it is ${css.length} characters; the most is ${MAX_THEME_CSS}`,
      })
      return z.NEVER
    }
    return css
  }),
} satisfies Record<keyof ThemeDesign, z.ZodType>

export function normalizeTheme(
  raw: unknown,
  issues: DesignIssue[]
): ThemeDesign {
  const theme: Record<string, unknown> = {}
  if (!isRecord(raw)) {
    if (raw !== undefined && raw !== null) {
      issues.push({
        level: 'warning',
        where: 'Theme',
        message:
          'Ignored the theme — it must be an object of settings, like { "primaryColor": "#1f7a4d" }.',
      })
    }
    return theme
  }
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'language') continue
    // Own entries only: "constructor", "toString" or "__proto__" is an
    // unknown setting, not something every object inherits.
    const schema = Object.hasOwn(THEME_FIELDS, key)
      ? (THEME_FIELDS[key as keyof ThemeDesign] as z.ZodType)
      : undefined
    if (!schema) {
      issues.push({
        level: 'warning',
        where: 'Theme',
        message: `Ignored "${key}" — the theme has no such setting.`,
      })
      continue
    }
    // Nothing given: the setting stays as it is.
    if (value === null) continue
    const parsed = schema.safeParse(value)
    if (parsed.success) theme[key] = parsed.data
    else
      issues.push({
        level: 'warning',
        where: 'Theme',
        message: `Ignored "${key}": ${parsed.error.issues[0]?.message ?? 'not valid'}.`,
      })
  }
  return theme as ThemeDesign
}

/** True when an error-level issue means something the merchant asked for is missing. */
export function hasErrors(issues: DesignIssue[]): boolean {
  return issues.some((issue) => issue.level === 'error')
}
