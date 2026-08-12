import { z } from 'zod'
import {
  compileSchemaToFields,
  defaultContentFromSchema,
  liquidSectionSchema,
  type LiquidSectionSchema,
} from './schema'
import { validateLiquid } from './engine'
import { inferSectionFromHtml } from './infer'
import type { FieldConfig } from '@/modules/sections/editorFields'

/**
 * Splits one pasted Liquid document into the separate, individually editable
 * layers a page is built from.
 *
 * This is the difference between "paste a theme and get an opaque blob" and
 * "paste a theme and get the same stack of components you would have built by
 * hand". A whole-page design pasted here becomes N sections in the builder —
 * reorderable, hideable, duplicable, each with its own settings form generated
 * from its own `{% schema %}` block. Nothing about the result is second-class
 * compared to a page assembled with the section palette.
 *
 * Document format:
 *
 *     {% section 'hero' %}
 *       <h1>{{ section.settings.heading }}</h1>
 *       {% schema %}
 *       { "name": "Hero", "settings": [
 *           { "type": "text", "id": "heading", "default": "Hello" }
 *       ]}
 *       {% endschema %}
 *     {% endsection %}
 *
 *     {% section 'features' %}
 *       ...
 *     {% endsection %}
 *
 * A document with no `{% section %}` wrappers is treated as a single layer, so
 * the simpler "one design, one block" paste keeps working unchanged.
 */

const SECTION_BLOCK =
  /\{%-?\s*section\s+["']([^"']+)["']\s*-?%\}([\s\S]*?)\{%-?\s*endsection\s*-?%\}/g

const SCHEMA_BLOCK = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/

export interface ParsedLayer {
  /** Identifier from `{% section 'name' %}`, used to build a stable key. */
  handle: string
  /** Display name — the schema's `name` when present, else the handle. */
  name: string
  category: string
  /** Template body with the schema block removed, ready for the engine. */
  template: string
  schema: LiquidSectionSchema | null
  editorFields: FieldConfig[]
  defaultContent: Record<string, unknown>
  /** Set when this layer's schema could not be parsed. */
  error: string | null
}

export interface ParsedDocument {
  layers: ParsedLayer[]
  /** Fatal problems that stopped the document being usable at all. */
  error: string | null
}

/**
 * A layer with no `{% schema %}` still has to be editable, or pasting a plain
 * HTML block would produce a layer nobody can change afterwards — the exact
 * dead end this feature exists to avoid. It gets a single rich-text field so
 * the merchant can at least edit its markup in the builder.
 */
function fallbackSchema(name: string): LiquidSectionSchema {
  return liquidSectionSchema.parse({
    name,
    settings: [
      {
        type: 'html',
        id: 'html',
        label: 'Content',
      },
    ],
    blocks: [],
  })
}

function parseLayer(handle: string, raw: string, index: number): ParsedLayer {
  const match = raw.match(SCHEMA_BLOCK)
  const template = match ? raw.replace(SCHEMA_BLOCK, '').trim() : raw.trim()
  const displayHandle = handle || `section-${index + 1}`

  if (!match) {
    // No schema block, so infer one: every heading, paragraph, button label,
    // image, link and colour in the pasted markup becomes its own setting.
    // Without this a paste would arrive as one opaque HTML blob, which is the
    // dead end this whole feature exists to avoid.
    // The raw handle, not `displayHandle`: an empty one means the paste had no
    // `{% section %}` wrapper, and inference should then name the layer from
    // its content rather than from a generated "section-2".
    const inferred = inferSectionFromHtml(template, handle)

    if (inferred.fieldCount > 0) {
      return {
        handle: displayHandle,
        name: inferred.name,
        category: 'Imported',
        template: inferred.template,
        schema: inferred.schema,
        editorFields: compileSchemaToFields(inferred.schema),
        defaultContent: defaultContentFromSchema(inferred.schema),
        error: null,
      }
    }

    // Nothing recognisable to lift — markup that is pure structure, or already
    // fully driven by Liquid. Fall back to editing the block as HTML so the
    // layer is still editable rather than frozen.
    const schema = fallbackSchema(titleFromHandle(displayHandle))
    return {
      handle: displayHandle,
      name: titleFromHandle(displayHandle),
      category: 'Imported',
      template: '{{ section.settings.html }}',
      schema,
      editorFields: compileSchemaToFields(schema),
      defaultContent: { html: template },
      error: null,
    }
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(match[1])
  } catch (cause) {
    return {
      handle: displayHandle,
      name: titleFromHandle(displayHandle),
      category: 'Imported',
      template,
      schema: null,
      editorFields: [],
      defaultContent: {},
      error: `Invalid JSON in {% schema %}: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    }
  }

  const result = liquidSectionSchema.safeParse(parsedJson)
  if (!result.success) {
    const issue = result.error.issues[0]
    return {
      handle: displayHandle,
      name: titleFromHandle(displayHandle),
      category: 'Imported',
      template,
      schema: null,
      editorFields: [],
      defaultContent: {},
      error: `Invalid {% schema %}: ${issue.path.join('.')} ${issue.message}`,
    }
  }

  return {
    handle: displayHandle,
    name: result.data.name || titleFromHandle(displayHandle),
    category: result.data.category ?? 'Imported',
    template,
    schema: result.data,
    editorFields: compileSchemaToFields(result.data),
    defaultContent: defaultContentFromSchema(result.data),
    error: null,
  }
}

function titleFromHandle(handle: string): string {
  return handle
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function parseLiquidDocument(source: string): ParsedDocument {
  if (!source.trim()) {
    return { layers: [], error: 'Paste some Liquid to import' }
  }

  const layers: ParsedLayer[] = []
  // matchAll rather than a stateful regex loop: the `g` flag makes `.exec`
  // stateful across calls, which silently skips matches if this is ever run
  // twice on the same regex object.
  const matches = [...source.matchAll(SECTION_BLOCK)]

  if (matches.length === 0) {
    // No explicit sections — the whole document is one layer.
    layers.push(parseLayer('', source, 0))
  } else {
    matches.forEach((match, index) => {
      layers.push(parseLayer(match[1], match[2], index))
    })
  }

  const broken = layers.filter((layer) => layer.error)
  return {
    layers,
    error:
      broken.length > 0
        ? broken.map((layer) => `${layer.name}: ${layer.error}`).join('; ')
        : null,
  }
}

/**
 * Parses a document and syntax-checks each layer.
 *
 * Validation has to happen per layer, *after* the split. `{% section %}` and
 * `{% schema %}` are our own document-level markers, not LiquidJS tags — the
 * engine has never heard of either, so running it over the whole document
 * fails at line 1 with `tag "section" not found` and rejects every correctly
 * formatted paste. Splitting first also means a syntax error is reported
 * against the layer that contains it instead of an offset into the whole file.
 */
export async function parseAndValidateLiquidDocument(
  source: string
): Promise<ParsedDocument> {
  const parsed = parseLiquidDocument(source)

  for (const layer of parsed.layers) {
    if (layer.error) continue

    const syntaxError = await validateLiquid(layer.template)
    if (syntaxError) {
      layer.error = syntaxError.line
        ? `line ${syntaxError.line}: ${syntaxError.message}`
        : syntaxError.message
    }
  }

  const broken = parsed.layers.filter((layer) => layer.error)
  return {
    layers: parsed.layers,
    error:
      broken.length > 0
        ? broken.map((layer) => `${layer.name}: ${layer.error}`).join('; ')
        : null,
  }
}

/** Input shape for the import forms. */
export const importLiquidSchema = z.object({
  source: z.string().min(1, 'Paste some Liquid to import').max(500_000),
  /** Replace the existing sections rather than appending to them. */
  replace: z.boolean().default(true),
})

export type ImportLiquidInput = z.infer<typeof importLiquidSchema>
