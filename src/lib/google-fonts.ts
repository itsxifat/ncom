import 'server-only'
import snapshot from './google-fonts.json'

/**
 * Every Google Fonts family a merchant can choose, beyond the self-hosted
 * catalogue in `lib/fonts.ts`.
 *
 * The catalogue's families are bundled at build time and are what templates
 * use; these are served on demand through NCOM's own font proxy
 * (`/api/fonts/*`), so a merchant who wants "Lexend" or a newer Bangla face is
 * not limited to the families someone chose to bundle. The list is a snapshot
 * (see scripts/update-google-fonts.mts) so nothing depends on Google's
 * metadata endpoint at request time.
 *
 * Server-only: it is a 130 KB list, and the browser gets it — once, cached —
 * from `/api/fonts/list` instead of in every bundle that touches a font.
 */

export type GoogleFontCategory =
  'sans' | 'serif' | 'display' | 'handwriting' | 'mono'

export interface GoogleFont {
  family: string
  category: GoogleFontCategory
  /** Can set Bangla. */
  bangla: boolean
  /** The upright weights it has, or the italic ones when `italicOnly`. */
  weights: number[]
  italic: boolean
  /** Drawn only in italic, such as Molle: there is no upright to ask for. */
  italicOnly: boolean
  /** 1 = most used. */
  popularity: number
}

type Entry = {
  f: string
  c: string
  b: number
  w: number[]
  i: number
  p: number
}

export const GOOGLE_FONTS: GoogleFont[] = (snapshot as Entry[]).map(
  (entry) => ({
    family: entry.f,
    category: entry.c as GoogleFontCategory,
    bangla: entry.b === 1,
    weights: entry.w,
    // 1: italics as well as uprights, 2: italics only.
    italic: entry.i >= 1,
    italicOnly: entry.i === 2,
    popularity: entry.p,
  })
)

const BY_NAME = new Map(
  GOOGLE_FONTS.map((font) => [font.family.toLowerCase(), font])
)

/** The Google family with this name, matched without regard to case. */
export function findGoogleFont(
  name: string | null | undefined
): GoogleFont | undefined {
  return name ? BY_NAME.get(name.trim().toLowerCase()) : undefined
}
