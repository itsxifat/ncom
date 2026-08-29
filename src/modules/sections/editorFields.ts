/**
 * A small declarative description of a section's editable fields, used by
 * the builder's generic Inspector form (SchemaForm) to render an editing
 * UI for any section without a bespoke Editor.tsx per type. Each section
 * module owns this alongside its zod schema — it stays in sync by hand
 * since deriving it from zod's internal type representation would be
 * fragile across zod versions.
 */

/**
 * Shows a field only when a sibling field holds one of the given values.
 *
 * `field` names a sibling in the same object, so inside an array item it
 * resolves against that item rather than the section root. This is what lets a
 * block offer two mutually exclusive setups — a fixed deadline or a
 * per-visitor timer — without showing the merchant the six controls that
 * belong to the mode they did not pick.
 */
export interface FieldCondition {
  field: string
  equals: unknown | unknown[]
}

interface FieldBase {
  name: string
  label: string
  /** Helper text under the control, for anything the label cannot carry. */
  description?: string
  showWhen?: FieldCondition
}

/** A select option, either a bare value or a value with a human label. */
export type SelectOption = string | { value: string; label: string }

export type FieldConfig =
  | (FieldBase & { type: 'text'; placeholder?: string })
  // `aspect` is the width/height of the frame this image renders into, and is
  // set only where the block genuinely fixes one — a square gallery tile, a
  // round avatar. It locks the cropper to that shape. Blocks that let the
  // merchant choose the shape (the image block) or that render full-bleed at a
  // variable height (the hero) leave it unset and the cropper offers ratios
  // instead, because a lock would be asserting a frame that does not exist.
  | (FieldBase & { type: 'image'; aspect?: number })
  | (FieldBase & { type: 'textarea'; placeholder?: string })
  | (FieldBase & { type: 'boolean' })
  | (FieldBase & { type: 'select'; options: SelectOption[] })
  | (FieldBase & { type: 'stringArray' })
  | (FieldBase & { type: 'array'; itemFields: FieldConfig[] })
  | (FieldBase & {
      type: 'color'
      /** Empty value means "use the theme". */ allowEmpty?: boolean
    })
  // Stores a family name from the catalogue in `lib/fonts.ts`, which is the
  // only set of faces this app can serve — a font a section names but nothing
  // loads renders as the visitor's default and looks like a bug.
  | (FieldBase & { type: 'font' })
  // Picks a real sellable variant from the store's catalogue and stores its id.
  // A section that takes orders has to reference actual inventory — a typed-in
  // product name cannot be sold, priced or decremented from stock.
  | (FieldBase & { type: 'product' })
  // An absolute moment in time, stored as an ISO 8601 instant in UTC and edited
  // in the merchant's own timezone. Storing the instant rather than the wall
  // clock the merchant typed is the whole point: a countdown is a promise to
  // every visitor at once, and a naive "2026-09-01T18:00" means a different
  // moment to a buyer in Dhaka than to one in London.
  | (FieldBase & { type: 'datetime' })
  // A labelled break in the form. Purely presentational — it holds no value,
  // and its `name` exists only to key the list.
  | (FieldBase & { type: 'heading' })
  | (FieldBase & {
      type: 'number'
      min?: number
      max?: number
      step?: number
      /** Rendered after the input, e.g. "minutes". */
      suffix?: string
    })

/** The value a select option submits. */
export function optionValue(option: SelectOption): string {
  return typeof option === 'string' ? option : option.value
}

/** What a select option reads as. Bare values are title-cased for display. */
export function optionLabel(option: SelectOption): string {
  if (typeof option !== 'string') return option.label
  return option.charAt(0).toUpperCase() + option.slice(1)
}

/**
 * Whether a field's `showWhen` condition holds against the values around it.
 *
 * A field with no condition is always shown, so this is safe to call for every
 * field rather than only the conditional ones.
 */
export function fieldIsVisible(
  field: FieldConfig,
  siblings: Record<string, unknown> | undefined
): boolean {
  if (!field.showWhen) return true
  const actual = siblings?.[field.showWhen.field]
  const expected = field.showWhen.equals
  return Array.isArray(expected)
    ? expected.includes(actual)
    : actual === expected
}

/**
 * Every word a section currently holds, in the order the fields declare them.
 *
 * Used to work out which script a merchant is writing in, so the font pickers
 * can lead with faces that can actually set it. Reads the field list rather
 * than the raw content object on purpose: content also carries urls, colour
 * hexes, product ids and enum values, none of which are prose, and a hex code
 * or a cuid dropped into the specimen line would be noise at best and would
 * skew the detection at worst.
 */
export function collectText(
  fields: FieldConfig[],
  content: unknown,
  depth = 0
): string {
  // Sections nest one level (an array of items with their own fields); the
  // guard is here so a malformed content blob cannot spin this forever.
  if (depth > 4 || !content || typeof content !== 'object') return ''
  const record = content as Record<string, unknown>
  const parts: string[] = []

  for (const field of fields) {
    const value = record[field.name]
    if (field.type === 'text' || field.type === 'textarea') {
      if (typeof value === 'string') parts.push(value)
    } else if (field.type === 'stringArray') {
      if (Array.isArray(value)) {
        parts.push(...value.filter((v): v is string => typeof v === 'string'))
      }
    } else if (field.type === 'array') {
      if (Array.isArray(value)) {
        for (const item of value) {
          parts.push(collectText(field.itemFields, item, depth + 1))
        }
      }
    }
  }

  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}
