/**
 * Refreshes src/lib/google-fonts.json — the list of Google Fonts families a
 * merchant can choose from beyond the self-hosted catalogue in lib/fonts.ts.
 *
 *   pnpm fonts:update
 *
 * The list is a snapshot checked into the repo rather than fetched at runtime:
 * the endpoint it comes from (the metadata behind fonts.google.com) is public
 * but undocumented, and a storefront should never fail to render because a
 * third party changed a JSON shape. Run this now and then to pick up new
 * families; nothing breaks if it is never run again.
 *
 * Each entry is deliberately small:
 *   f  family name (what the theme stores)
 *   c  category: sans | serif | display | handwriting | mono
 *   b  1 when the family can set Bangla
 *   w  the weights it has: the upright ones, or for a family drawn only in
 *      italic (such as Molle) its italic ones
 *   i  1 when it has italics as well as uprights, 2 when it has nothing but
 *      italics, else 0
 *   p  popularity rank (1 = most used), for ordering search results
 *
 * An italic-only family has to be recorded as one: Google refuses a request
 * for an upright the family does not have, so the font proxy needs to know to
 * ask for the italic instead.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SOURCE = 'https://fonts.google.com/metadata/fonts'
const LIB = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'lib'
)
const OUT = path.join(LIB, 'google-fonts.json')
const NAMES = path.join(LIB, 'google-font-names.ts')

const CATEGORY: Record<string, string> = {
  'Sans Serif': 'sans',
  Serif: 'serif',
  Display: 'display',
  Handwriting: 'handwriting',
  Monospace: 'mono',
}

interface Family {
  family: string
  category: string
  subsets: string[]
  fonts: Record<string, unknown>
  popularity: number
}

const response = await fetch(SOURCE, { headers: { 'User-Agent': 'ncom' } })
if (!response.ok) throw new Error(`${SOURCE} answered ${response.status}`)
let text = await response.text()
// The endpoint prefixes its JSON with an anti-hijacking guard.
if (text.startsWith(")]}'")) text = text.slice(4)
const families = (JSON.parse(text) as { familyMetadataList: Family[] })
  .familyMetadataList

/** The weights of the styles named like "400" (upright) or "400i" (italic). */
function weightsOf(styles: string[], italic: boolean): number[] {
  const pattern = italic ? /^\d+i$/ : /^\d+$/
  return styles
    .filter((style) => pattern.test(style))
    .map((style) => Number.parseInt(style, 10))
    .sort((a, b) => a - b)
}

const entries = families
  .filter((family) => CATEGORY[family.category])
  // Pictographs, not typefaces: nobody sets a headline in emoji.
  .filter((family) => !/Emoji|Symbols/.test(family.family))
  // Only families that can set the storefront's own text.
  .filter(
    (family) =>
      family.subsets.includes('latin') || family.subsets.includes('bengali')
  )
  // The names list joins names with "|" inside a quoted string, and a theme
  // puts the name in CSS unescaped; every family is named like this today.
  .filter((family) => /^[A-Za-z0-9][A-Za-z0-9 ]*$/.test(family.family))
  .map((family) => {
    const styles = Object.keys(family.fonts)
    const upright = weightsOf(styles, false)
    const italic = weightsOf(styles, true)
    return {
      f: family.family,
      c: CATEGORY[family.category]!,
      b: family.subsets.includes('bengali') ? 1 : 0,
      w: upright.length > 0 ? upright : italic,
      i: upright.length === 0 ? 2 : italic.length > 0 ? 1 : 0,
      p: family.popularity,
    }
  })
  // A family with no styles at all has nothing to load.
  .filter((entry) => entry.w.length > 0)
  .sort((a, b) => a.p - b.p)

writeFileSync(OUT, `${JSON.stringify(entries)}\n`)
console.log(
  `Wrote ${entries.length} families to ${path.relative(process.cwd(), OUT)}`
)

// Browser code tells a Google family from any other name by the copy of the
// names in google-font-names.ts, so a family added here and missing there
// would never be asked for. Say so rather than let the two drift apart.
const listed = new Set(
  /GOOGLE_FONT_NAMES =\s*'([^']*)'/
    .exec(readFileSync(NAMES, 'utf8'))?.[1]
    ?.split('|') ?? []
)
if (
  listed.size !== entries.length ||
  entries.some((entry) => !listed.has(entry.f))
) {
  console.warn(
    `${path.relative(process.cwd(), NAMES)} no longer lists these families: derive it again from the snapshot.`
  )
}
