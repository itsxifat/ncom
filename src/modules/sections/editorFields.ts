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
  | { type: 'image'; name: string; label: string }
  | { type: 'textarea'; name: string; label: string }
  | { type: 'boolean'; name: string; label: string }
  | { type: 'select'; name: string; label: string; options: string[] }
  | { type: 'stringArray'; name: string; label: string }
  | { type: 'array'; name: string; label: string; itemFields: FieldConfig[] }
  // `color` and `number` exist for Liquid sections, whose {% schema %} blocks
  // carry Shopify's `color`/`range`/`number` setting types (see
  // lib/liquid/schema.ts). Built-in React sections are free to use them too.
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
