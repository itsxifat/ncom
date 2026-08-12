import { z } from 'zod'
import type { FieldConfig } from '@/modules/sections/editorFields'

/**
 * The `{% schema %}` block that turns a Liquid template into a builder section.
 *
 * This is the contract that makes a tenant-authored section a first-class
 * citizen of the visual editor: the same declarative description that Shopify
 * themes already carry compiles into the FieldConfig[] our Inspector renders,
 * so a Liquid section and a built-in React section produce an identical
 * editing experience. Section authors write one schema, not a template plus a
 * bespoke editor.
 *
 * The schema block is stripped from the source before it ever reaches the
 * Liquid engine — it is metadata, not render logic, so there is no reason to
 * make the parser deal with it.
 */

const SCHEMA_BLOCK = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/

const settingBase = {
  id: z.string().min(1).max(60),
  label: z.string().max(120).optional(),
  info: z.string().max(300).optional(),
}

/**
 * Setting types, named to match Shopify's so themes port without edits.
 *
 * Types Shopify has that we accept but degrade are noted inline. Accepting and
 * degrading beats rejecting: a ported theme renders with a usable editor
 * instead of failing to import at all.
 */
const settingSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    ...settingBase,
    default: z.string().optional(),
  }),
  z.object({
    type: z.literal('textarea'),
    ...settingBase,
    default: z.string().optional(),
  }),
  // Rich text and raw HTML both edit as plain multi-line text for now; the
  // stored value is emitted verbatim, which is what a theme expects.
  z.object({
    type: z.literal('richtext'),
    ...settingBase,
    default: z.string().optional(),
  }),
  z.object({
    type: z.literal('html'),
    ...settingBase,
    default: z.string().optional(),
  }),
  z.object({
    type: z.literal('liquid'),
    ...settingBase,
    default: z.string().optional(),
  }),
  z.object({
    type: z.literal('url'),
    ...settingBase,
    default: z.string().optional(),
  }),
  z.object({
    type: z.literal('image_picker'),
    ...settingBase,
    default: z.string().optional(),
  }),
  z.object({
    type: z.literal('video'),
    ...settingBase,
    default: z.string().optional(),
  }),
  z.object({
    type: z.literal('checkbox'),
    ...settingBase,
    default: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('color'),
    ...settingBase,
    default: z.string().optional(),
  }),
  z.object({
    type: z.literal('color_background'),
    ...settingBase,
    default: z.string().optional(),
  }),
  z.object({
    type: z.literal('font_picker'),
    ...settingBase,
    default: z.string().optional(),
  }),
  z.object({
    type: z.literal('number'),
    ...settingBase,
    default: z.number().optional(),
  }),
  z.object({
    type: z.literal('range'),
    ...settingBase,
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    unit: z.string().optional(),
    default: z.number().optional(),
  }),
  z.object({
    type: z.literal('select'),
    ...settingBase,
    options: z
      .array(z.object({ value: z.string(), label: z.string().optional() }))
      .min(1),
    default: z.string().optional(),
  }),
  z.object({
    type: z.literal('radio'),
    ...settingBase,
    options: z
      .array(z.object({ value: z.string(), label: z.string().optional() }))
      .min(1),
    default: z.string().optional(),
  }),
  // Resource pickers store the handle of the referenced record; the drop layer
  // resolves it at render time.
  z.object({
    type: z.literal('product'),
    ...settingBase,
    default: z.string().optional(),
  }),
  z.object({
    type: z.literal('collection'),
    ...settingBase,
    default: z.string().optional(),
  }),
  z.object({
    type: z.literal('page'),
    ...settingBase,
    default: z.string().optional(),
  }),
  z.object({
    type: z.literal('link_list'),
    ...settingBase,
    default: z.string().optional(),
  }),
  // Presentational-only entries. They carry no id in Shopify schemas, so they
  // are parsed and then dropped rather than becoming fields.
  z.object({
    type: z.literal('header'),
    content: z.string().optional(),
    id: z.string().optional(),
  }),
  z.object({
    type: z.literal('paragraph'),
    content: z.string().optional(),
    id: z.string().optional(),
  }),
])

export type LiquidSetting = z.infer<typeof settingSchema>

const blockSchema = z.object({
  type: z.string().min(1).max(60),
  name: z.string().max(120).optional(),
  limit: z.number().int().positive().optional(),
  settings: z.array(settingSchema).max(60).default([]),
})

export const liquidSectionSchema = z.object({
  name: z.string().min(1).max(120),
  tag: z.string().max(20).optional(),
  class: z.string().max(200).optional(),
  category: z.string().max(60).optional(),
  settings: z.array(settingSchema).max(100).default([]),
  blocks: z.array(blockSchema).max(20).default([]),
  max_blocks: z.number().int().positive().max(100).optional(),
  presets: z
    .array(
      z.object({
        name: z.string().max(120),
        settings: z.record(z.string(), z.unknown()).optional(),
        blocks: z.array(z.record(z.string(), z.unknown())).optional(),
      })
    )
    .max(10)
    .optional(),
})

export type LiquidSectionSchema = z.infer<typeof liquidSectionSchema>

export interface ExtractedSection {
  /** The template with the schema block removed, ready for the engine. */
  template: string
  schema: LiquidSectionSchema | null
  error: string | null
}

/**
 * Splits a section file into its renderable template and its parsed schema.
 *
 * A malformed schema is reported rather than thrown: the code editor needs to
 * show the author what is wrong while still previewing the template.
 */
export function extractSection(source: string): ExtractedSection {
  const match = source.match(SCHEMA_BLOCK)

  if (!match) {
    return { template: source, schema: null, error: null }
  }

  const template = source.replace(SCHEMA_BLOCK, '').trim()
  const raw = match[1]

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch (cause) {
    return {
      template,
      schema: null,
      error: `Invalid JSON in {% schema %}: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    }
  }

  const result = liquidSectionSchema.safeParse(parsedJson)
  if (!result.success) {
    const first = result.error.issues[0]
    return {
      template,
      schema: null,
      error: `Invalid {% schema %}: ${first.path.join('.')} ${first.message}`,
    }
  }

  return { template, schema: result.data, error: null }
}

/**
 * Compiles schema settings into the Inspector's FieldConfig[].
 *
 * Settings the editor has no widget for degrade to the nearest one that can
 * still round-trip the value (a `font_picker` becomes a text input) rather
 * than disappearing — a field the author cannot see is a value they cannot
 * fix.
 */
export function compileSettingsToFields(
  settings: LiquidSetting[]
): FieldConfig[] {
  const fields: FieldConfig[] = []

  for (const setting of settings) {
    // Presentational entries carry no value and so have no field.
    if (setting.type === 'header' || setting.type === 'paragraph') continue

    const name = setting.id
    const label = setting.label ?? setting.id

    switch (setting.type) {
      case 'text':
      case 'url':
      case 'font_picker':
      case 'product':
      case 'collection':
      case 'page':
      case 'link_list':
      case 'video':
        fields.push({ type: 'text', name, label })
        break

      case 'textarea':
      case 'richtext':
      case 'html':
      case 'liquid':
        fields.push({ type: 'textarea', name, label })
        break

      case 'image_picker':
        fields.push({ type: 'image', name, label })
        break

      case 'checkbox':
        fields.push({ type: 'boolean', name, label })
        break

      case 'color':
      case 'color_background':
        fields.push({ type: 'color', name, label })
        break

      case 'number':
        fields.push({ type: 'number', name, label })
        break

      case 'range':
        fields.push({
          type: 'number',
          name,
          label,
          min: setting.min,
          max: setting.max,
          step: setting.step,
        })
        break

      case 'select':
      case 'radio':
        fields.push({
          type: 'select',
          name,
          label,
          options: setting.options.map((option) => option.value),
        })
        break
    }
  }

  return fields
}

/**
 * Compiles a whole section schema, folding blocks into a repeatable `blocks`
 * array field.
 *
 * FieldConfig's `array` has one uniform item shape, while Shopify allows a
 * section to mix several block types. When a section declares more than one,
 * the item fields become the union of every block's settings plus a `type`
 * selector, and the template's own `{% case block.type %}` decides what to do
 * with them. That is a real limitation — an author sees fields belonging to
 * block types they aren't using — but it keeps multi-block themes importable
 * instead of rejecting them.
 */
export function compileSchemaToFields(
  schema: LiquidSectionSchema
): FieldConfig[] {
  const fields = compileSettingsToFields(schema.settings)

  if (schema.blocks.length === 0) return fields

  if (schema.blocks.length === 1) {
    const block = schema.blocks[0]
    fields.push({
      type: 'array',
      name: 'blocks',
      label: block.name ?? 'Blocks',
      itemFields: compileSettingsToFields(block.settings),
    })
    return fields
  }

  const seen = new Set<string>()
  const merged: FieldConfig[] = [
    {
      type: 'select',
      name: 'type',
      label: 'Block type',
      options: schema.blocks.map((block) => block.type),
    },
  ]

  for (const block of schema.blocks) {
    for (const field of compileSettingsToFields(block.settings)) {
      if (seen.has(field.name)) continue
      seen.add(field.name)
      merged.push(field)
    }
  }

  fields.push({
    type: 'array',
    name: 'blocks',
    label: 'Blocks',
    itemFields: merged,
  })

  return fields
}

/**
 * Builds the section's initial content from its schema defaults, so dropping a
 * custom section onto a page shows something rather than an empty shell.
 */
export function defaultContentFromSchema(
  schema: LiquidSectionSchema
): Record<string, unknown> {
  const content: Record<string, unknown> = {}

  for (const setting of schema.settings) {
    if (setting.type === 'header' || setting.type === 'paragraph') continue
    if ('default' in setting && setting.default !== undefined) {
      content[setting.id] = setting.default
    }
  }

  // A preset, when present, is the author's intended "new section" state and
  // overrides the per-setting defaults.
  const preset = schema.presets?.[0]
  if (preset?.settings) {
    Object.assign(content, preset.settings)
  }

  if (schema.blocks.length > 0) {
    content.blocks = preset?.blocks ?? []
  }

  return content
}
