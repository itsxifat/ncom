/**
 * Holds the rule that makes a block editable.
 *
 *   pnpm check:elements
 *
 * A block is a React component that draws things, plus a list of descriptors
 * naming what it drew. The editor can only offer what the list names: an
 * element the markup paints but the list forgets is a thing on the page nobody
 * can select, and a descriptor with no markup behind it is a row in the panel
 * that selects nothing. Neither fails a build, neither throws at runtime, and
 * both are invisible until a merchant goes looking for a control that is not
 * there. That is exactly the kind of rot a check like this exists to stop.
 *
 * Four rules, checked per block:
 *
 *  1. Every `part="…"` the markup draws has a descriptor.
 *  2. Every descriptor is drawn by the markup.
 *  3. No key is declared twice.
 *  4. Every `contentField` path resolves to a real field in `editorFields`,
 *     a `[]` in the path lands on an `array` field, and a repeated element
 *     always carries one. This is what makes double-click-to-edit reach the
 *     right words on the canvas — a path that leads nowhere means the element
 *     can be styled but never typed into, and a repeated element pointed at a
 *     plain field means every instance writes over the same words.
 *
 * Read statically rather than by rendering. Rendering a block would pull in
 * `next/font`, which only works inside a Next build, so this parses the source
 * with TypeScript's own parser instead. The consequence worth knowing: a `part`
 * computed at runtime (`part={someVariable}`) cannot be resolved, so it is
 * reported as unreadable rather than silently passing. Keep them literals.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

const SECTIONS_DIR = join(process.cwd(), 'src/modules/sections')

/**
 * Element keys drawn by shared helpers rather than by a block's own markup.
 *
 * `Extras` renders whatever a merchant added, keyed by the extra's id, so those
 * keys exist at runtime and can never appear in a descriptor list.
 */
const DYNAMIC_PARTS = new Set(['extraKey'])

let failures = 0
let checked = 0

function fail(block: string, message: string) {
  failures += 1
  console.log(`  \x1b[31m✗\x1b[0m ${block}: ${message}`)
}

// ── Reading the source ────────────────────────────────────────────────

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
}

function tsxFilesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.tsx') || name.endsWith('.ts'))
    .map((name) => join(dir, name))
    .filter((file) => statSync(file).isFile())
}

/**
 * Names a file binds as a `part` prop — a helper that forwards one along.
 *
 * `<ProductThumb part="lineImage" />` is the declaration that matters, and it
 * is a literal this walk already sees. The `part={part}` inside the helper is
 * the same key travelling one level down, so following it would only find the
 * key twice.
 */
function forwardedNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  function visit(node: ts.Node) {
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) {
      const declared = (node.propertyName ?? node.name).getText()
      if (declared === 'part') names.add(node.name.getText())
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return names
}

/** Every `part="…"` a file's JSX carries, plus the ones it computes. */
function partsIn(file: string): { literals: Set<string>; computed: string[] } {
  const literals = new Set<string>()
  const computed: string[] = []
  const source = parse(file)
  const forwarded = forwardedNames(source)

  function visit(node: ts.Node) {
    if (ts.isJsxAttribute(node) && node.name.getText() === 'part') {
      const value = node.initializer
      if (value && ts.isStringLiteral(value)) {
        literals.add(value.text)
      } else if (
        value &&
        ts.isJsxExpression(value) &&
        value.expression !== undefined
      ) {
        const expression = value.expression
        if (ts.isStringLiteral(expression)) {
          literals.add(expression.text)
        } else if (
          ts.isCallExpression(expression) &&
          DYNAMIC_PARTS.has(expression.expression.getText())
        ) {
          // A merchant-added element. Runtime-keyed by design.
        } else if (
          ts.isIdentifier(expression) &&
          forwarded.has(expression.getText())
        ) {
          // A helper passing its caller's key through.
        } else {
          computed.push(expression.getText())
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  return { literals, computed }
}

interface Descriptor {
  key: string
  contentField?: string
  repeated?: boolean
}

interface BlockDeclaration {
  elements: Descriptor[]
  /** Field names, with array fields carrying their item field names. */
  fields: Map<string, { type: string; children?: Map<string, string> }>
}

function stringProperty(
  node: ts.ObjectLiteralExpression,
  name: string
): string | undefined {
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    if (property.name.getText().replace(/['"]/g, '') !== name) continue
    const value = property.initializer
    if (ts.isStringLiteral(value)) return value.text
  }
  return undefined
}

function booleanProperty(
  node: ts.ObjectLiteralExpression,
  name: string
): boolean | undefined {
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    if (property.name.getText().replace(/['"]/g, '') !== name) continue
    const value = property.initializer
    if (value.kind === ts.SyntaxKind.TrueKeyword) return true
    if (value.kind === ts.SyntaxKind.FalseKeyword) return false
  }
  return undefined
}

function arrayProperty(
  node: ts.ObjectLiteralExpression,
  name: string
): ts.ObjectLiteralExpression[] | undefined {
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    if (property.name.getText().replace(/['"]/g, '') !== name) continue
    const value = property.initializer
    if (!ts.isArrayLiteralExpression(value)) return undefined
    return value.elements.filter(ts.isObjectLiteralExpression)
  }
  return undefined
}

/**
 * The `elements` and `editorFields` a block declares.
 *
 * Found by looking for the object literal that has a `Renderer` — the one thing
 * every SectionDefinition has and nothing else in these files does, so this
 * does not depend on how the export happens to be named.
 */
function declarationIn(file: string): BlockDeclaration | null {
  const source = parse(file)
  let found: BlockDeclaration | null = null

  function visit(node: ts.Node) {
    if (found) return
    if (ts.isObjectLiteralExpression(node)) {
      const hasRenderer = node.properties.some(
        (property) =>
          ts.isPropertyAssignment(property) &&
          property.name.getText() === 'Renderer'
      )
      if (hasRenderer) {
        const elements = (arrayProperty(node, 'elements') ?? []).flatMap(
          (entry) => {
            const key = stringProperty(entry, 'key')
            if (!key) return []
            return [
              {
                key,
                contentField: stringProperty(entry, 'contentField'),
                repeated: booleanProperty(entry, 'repeated'),
              },
            ]
          }
        )

        const fields = new Map<
          string,
          { type: string; children?: Map<string, string> }
        >()
        for (const entry of arrayProperty(node, 'editorFields') ?? []) {
          const name = stringProperty(entry, 'name')
          const type = stringProperty(entry, 'type')
          if (!name || !type) continue
          const children = new Map<string, string>()
          for (const item of arrayProperty(entry, 'itemFields') ?? []) {
            const itemName = stringProperty(item, 'name')
            const itemType = stringProperty(item, 'type')
            if (itemName && itemType) children.set(itemName, itemType)
          }
          fields.set(name, {
            type,
            children: children.size ? children : undefined,
          })
        }

        found = { elements, fields }
        return
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  return found
}

// ── The rules ─────────────────────────────────────────────────────────

/** Whether a `contentField` path leads to a field the block actually declares. */
function contentFieldResolves(
  path: string,
  descriptor: Descriptor,
  fields: BlockDeclaration['fields']
): string | null {
  const segments = path.split('.')
  const head = segments[0]!
  const repeated = head.endsWith('[]')
  const name = repeated ? head.slice(0, -2) : head

  const field = fields.get(name)
  if (!field)
    return `names a field "${name}" that editorFields does not declare`

  if (repeated) {
    if (field.type !== 'array') {
      return `writes "${head}" but "${name}" is a ${field.type}, not an array`
    }
    if (!descriptor.repeated) {
      return `writes "${head}" but the element is not marked repeated, so no index reaches it`
    }
    const leaf = segments[1]
    if (!leaf)
      return `stops at the array "${name}" without naming a field inside it`
    if (!field.children?.has(leaf)) {
      return `names "${leaf}" inside "${name}", which its itemFields do not declare`
    }
    return null
  }

  if (segments.length > 1) {
    return `descends into "${name}", which is a ${field.type} and has nothing inside it`
  }
  if (descriptor.repeated) {
    // The dangerous case, and the reason this rule exists: a repeated element
    // pointed at a plain field has one path for every instance, so typing into
    // the third card would overwrite the field the other two are drawn from.
    return `is repeated but writes the whole of "${name}" — every instance would overwrite the same field`
  }
  return null
}

function checkBlock(dir: string, name: string) {
  const files = tsxFilesIn(dir)
  const index = files.find((file) => file.endsWith('index.tsx'))
  if (!index) return

  const declaration = declarationIn(index)
  if (!declaration) return
  checked += 1

  const drawn = new Set<string>()
  for (const file of files) {
    const { literals, computed } = partsIn(file)
    for (const part of literals) drawn.add(part)
    for (const expression of computed) {
      fail(
        name,
        `part={${expression}} cannot be read statically — use a literal so the editor can name it`
      )
    }
  }

  const declared = new Set<string>()
  for (const descriptor of declaration.elements) {
    if (declared.has(descriptor.key)) {
      fail(name, `declares "${descriptor.key}" twice`)
    }
    declared.add(descriptor.key)
  }

  for (const key of drawn) {
    if (!declared.has(key)) {
      fail(
        name,
        `draws part="${key}" with no descriptor — nothing in the editor can select it`
      )
    }
  }

  for (const descriptor of declaration.elements) {
    if (!drawn.has(descriptor.key)) {
      fail(
        name,
        `declares "${descriptor.key}" but nothing draws it — the panel would list an element that is not on the page`
      )
    }
    if (!descriptor.contentField) continue
    const problem = contentFieldResolves(
      descriptor.contentField,
      descriptor,
      declaration.fields
    )
    if (problem) {
      fail(name, `"${descriptor.key}" ${problem}`)
    }
  }
}

function main() {
  console.log(
    '\nBlocks: every drawn element named, every named element drawn\n'
  )

  const blocks = readdirSync(SECTIONS_DIR)
    .map((entry) => join(SECTIONS_DIR, entry))
    .filter((entry) => statSync(entry).isDirectory())

  const before = failures
  for (const dir of blocks) {
    checkBlock(dir, dir.split('/').pop()!)
  }
  if (failures === before) {
    console.log(`  \x1b[32m✓\x1b[0m ${checked} blocks agree with their markup`)
  }

  console.log(
    failures === 0
      ? '\n\x1b[32mPassed\x1b[0m — every part of every block is selectable and editable.\n'
      : `\n\x1b[31m${failures} failed\x1b[0m — see modules/sections/README.md for the rule.\n`
  )

  process.exit(failures === 0 ? 0 : 1)
}

main()
