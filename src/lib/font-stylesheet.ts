import { isGoogleFamilyName } from './fonts'
import { GOOGLE_FONT_NAMES } from './google-font-names'

/**
 * The stylesheet links that load Google Fonts families outside the
 * self-hosted catalogue.
 *
 * Served by NCOM itself (`/api/fonts/css`), which fetches from Google once and
 * rewrites the font files to its own address: the storefront's CSP allows
 * fonts and stylesheets only from 'self', and a shopper's browser never talks
 * to Google.
 *
 * Only a name that really is a Google family gets a link. Themes saved before
 * the picker existed hold whatever was typed into a free-text box — "Arial",
 * "SolaimanLipi" — and a link for one of those is a stylesheet in the page's
 * head that first paint waits on and that can only ever come back empty. The
 * shape of a name cannot tell the two apart, so this checks it against the
 * names in the Google Fonts snapshot.
 *
 * Kept out of `lib/fonts.ts` because of that list. `lib/fonts.ts` is imported
 * by blocks that run in the shopper's browser, and the list has no business
 * there. The live storefront builds these links while rendering on the
 * server, so the list stays on the server; the only browser code that builds
 * them is the builder canvas and the font picker, both in the dashboard.
 */

/**
 * The most families the proxy serves from one stylesheet: `MAX_FAMILIES` in
 * server/fonts/stylesheet.ts, which is server-only and cannot be imported
 * here. The proxy drops the families past it without a word, so a page that
 * uses more gets a second link rather than fonts that never load.
 */
export const FAMILIES_PER_STYLESHEET = 12

const BY_NAME = new Map(
  GOOGLE_FONT_NAMES.split('|').map((family) => [family.toLowerCase(), family])
)

/**
 * Google's own spelling of a family outside the catalogue, or undefined when
 * the name is a catalogue family (`next/font` bundles those, so they need no
 * link) or is not on Google Fonts at all. Matched without regard to case or
 * repeated spaces, the way the proxy and CSS match family names.
 */
export function googleFamilyName(
  name: string | null | undefined
): string | undefined {
  if (!isGoogleFamilyName(name)) return undefined
  return BY_NAME.get(name!.trim().replace(/\s+/g, ' ').toLowerCase())
}

/**
 * The stylesheets that load the Google families among these names: none when
 * there are none, otherwise one for every `FAMILIES_PER_STYLESHEET` of them.
 *
 * Each family is named once, in Google's spelling and in a fixed order, so the
 * same fonts make the same address however a page happens to spell or order
 * them. That is what lets React render one link where the theme and a section
 * both ask for "Lexend" and "lexend", and the browser cache one copy of it.
 * Relative, so it works on a tenant's subdomain and custom domain alike.
 * `text` asks for just the letters of a specimen, for the picker.
 */
export function fontStylesheetHrefs(
  names: (string | null | undefined)[],
  text?: string
): string[] {
  const families = [
    ...new Set(
      names
        .map(googleFamilyName)
        .filter((family): family is string => family !== undefined)
    ),
  ].sort()

  const hrefs: string[] = []
  for (let i = 0; i < families.length; i += FAMILIES_PER_STYLESHEET) {
    const query = new URLSearchParams()
    for (const family of families.slice(i, i + FAMILIES_PER_STYLESHEET)) {
      query.append('family', family)
    }
    if (text) query.set('text', text)
    hrefs.push(`/api/fonts/css?${query.toString()}`)
  }
  return hrefs
}
