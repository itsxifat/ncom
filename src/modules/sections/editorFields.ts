/**
 * A small declarative description of a section's editable fields, used by
 * the builder's generic Inspector form (SchemaForm) to render an editing
 * UI for any section without a bespoke Editor.tsx per type. Each section
 * module owns this alongside its zod schema — it stays in sync by hand
 * since deriving it from zod's internal type representation would be
 * fragile across zod versions.
 */
export type FieldConfig =
  | { type: 'text'; name: string; label: string }
  // `aspect` is the width/height of the frame this image renders into, and is
  // set only where the block genuinely fixes one — a square gallery tile, a
  // round avatar. It locks the cropper to that shape. Blocks that let the
  // merchant choose the shape (the image block) or that render full-bleed at a
  // variable height (the hero) leave it unset and the cropper offers ratios
  // instead, because a lock would be asserting a frame that does not exist.
  | { type: 'image'; name: string; label: string; aspect?: number }
  | { type: 'textarea'; name: string; label: string }
  | { type: 'boolean'; name: string; label: string }
  | { type: 'select'; name: string; label: string; options: string[] }
  | { type: 'stringArray'; name: string; label: string }
  | { type: 'array'; name: string; label: string; itemFields: FieldConfig[] }
  | { type: 'color'; name: string; label: string }
  // Stores a family name from the catalogue in `lib/fonts.ts`, which is the
  // only set of faces this app can serve — a font a section names but nothing
  // loads renders as the visitor's default and looks like a bug.
  | { type: 'font'; name: string; label: string }
  // Picks a real sellable variant from the store's catalogue and stores its id.
  // A section that takes orders has to reference actual inventory — a typed-in
  // product name cannot be sold, priced or decremented from stock.
  | { type: 'product'; name: string; label: string }
  | {
      type: 'number'
      name: string
      label: string
      min?: number
      max?: number
      step?: number
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
