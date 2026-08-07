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
  | { type: 'textarea'; name: string; label: string }
  | { type: 'boolean'; name: string; label: string }
  | { type: 'select'; name: string; label: string; options: string[] }
  | { type: 'stringArray'; name: string; label: string }
  | { type: 'array'; name: string; label: string; itemFields: FieldConfig[] }
