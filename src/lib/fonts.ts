import {
  Alfa_Slab_One,
  Alkatra,
  Anek_Bangla,
  Anton,
  Archivo,
  Archivo_Black,
  Atma,
  Baloo_Da_2,
  Barlow,
  Bebas_Neue,
  Bitter,
  Caveat,
  Cormorant_Garamond,
  Crimson_Pro,
  DM_Sans,
  DM_Serif_Display,
  Dancing_Script,
  EB_Garamond,
  Figtree,
  Fira_Code,
  Fraunces,
  Galada,
  Google_Sans,
  Great_Vibes,
  Hind_Siliguri,
  IBM_Plex_Mono,
  Indie_Flower,
  Instrument_Serif,
  Inter,
  JetBrains_Mono,
  Kalam,
  Karla,
  Lato,
  Libre_Baskerville,
  Lora,
  Manrope,
  Merriweather,
  Mina,
  Montserrat,
  Mulish,
  Newsreader,
  Noto_Sans_Bengali,
  Noto_Serif_Bengali,
  Nunito,
  Onest,
  Open_Sans,
  Oswald,
  Outfit,
  Pacifico,
  Permanent_Marker,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Poppins,
  Public_Sans,
  Quicksand,
  Raleway,
  Righteous,
  Roboto,
  Roboto_Mono,
  Rubik,
  Sacramento,
  Satisfy,
  Shadows_Into_Light,
  Sora,
  Source_Code_Pro,
  Source_Serif_4,
  Space_Grotesk,
  Space_Mono,
  Spectral,
  Syne,
  Teko,
  Tiro_Bangla,
  Unbounded,
  Urbanist,
  Work_Sans,
  Zilla_Slab,
} from 'next/font/google'
import { takaFont } from './taka-font'

/**
 * The typefaces a merchant can put on their storefront.
 *
 * Every family is loaded through `next/font/google`, which downloads the files
 * at build time and serves them from this origin. That is not a performance
 * nicety here — the CSP in `next.config.ts` allows `font-src 'self' data:` and
 * no third-party stylesheet host, so a `<link>` to fonts.googleapis.com would
 * be blocked outright and every storefront would quietly fall back to system
 * text. Self-hosting is what makes the specimen in the picker and the published
 * page agree with each other.
 *
 * Two options are set the same way on all of them and both matter:
 *
 * - `preload: false`, because this module declares seventy-five families and a
 *   page uses at most two per section. The default would emit a preload link
 *   for every one on every route that imports this file. The actual font file
 *   is still fetched the moment something is painted with it, which is all the
 *   picker and a storefront ever need.
 * - `display: 'swap'`, so text is readable in the fallback while the real face
 *   downloads rather than invisible.
 *
 * Non-variable families list their weights explicitly (`next/font` refuses to
 * build without it) and are kept to the few a storefront actually renders —
 * every extra weight is another file.
 */

const inter = Inter({ subsets: ['latin'], display: 'swap', preload: false })
const manrope = Manrope({ subsets: ['latin'], display: 'swap', preload: false })
const dmSans = DM_Sans({ subsets: ['latin'], display: 'swap', preload: false })
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
})
const montserrat = Montserrat({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const roboto = Roboto({ subsets: ['latin'], display: 'swap', preload: false })
const openSans = Open_Sans({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const lato = Lato({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  preload: false,
})
const nunito = Nunito({ subsets: ['latin'], display: 'swap', preload: false })
const workSans = Work_Sans({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const figtree = Figtree({ subsets: ['latin'], display: 'swap', preload: false })
const rubik = Rubik({ subsets: ['latin'], display: 'swap', preload: false })
const karla = Karla({ subsets: ['latin'], display: 'swap', preload: false })
const mulish = Mulish({ subsets: ['latin'], display: 'swap', preload: false })
const outfit = Outfit({ subsets: ['latin'], display: 'swap', preload: false })
const sora = Sora({ subsets: ['latin'], display: 'swap', preload: false })
const urbanist = Urbanist({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
})
const raleway = Raleway({ subsets: ['latin'], display: 'swap', preload: false })
const quicksand = Quicksand({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const publicSans = Public_Sans({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const archivo = Archivo({ subsets: ['latin'], display: 'swap', preload: false })
const onest = Onest({ subsets: ['latin'], display: 'swap', preload: false })

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const dmSerifDisplay = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
})
const merriweather = Merriweather({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const lora = Lora({ subsets: ['latin'], display: 'swap', preload: false })
const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const libreBaskerville = Libre_Baskerville({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const cormorantGaramond = Cormorant_Garamond({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const bitter = Bitter({ subsets: ['latin'], display: 'swap', preload: false })
const crimsonPro = Crimson_Pro({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const spectral = Spectral({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  display: 'swap',
  preload: false,
})
const newsreader = Newsreader({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const zillaSlab = Zilla_Slab({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
})
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
})

const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
})
const anton = Anton({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
})
const oswald = Oswald({ subsets: ['latin'], display: 'swap', preload: false })
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
})
const righteous = Righteous({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
})
const alfaSlabOne = Alfa_Slab_One({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
})
const teko = Teko({ subsets: ['latin'], display: 'swap', preload: false })
const unbounded = Unbounded({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const syne = Syne({ subsets: ['latin'], display: 'swap', preload: false })

const dancingScript = Dancing_Script({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const caveat = Caveat({ subsets: ['latin'], display: 'swap', preload: false })
const pacifico = Pacifico({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
})
const greatVibes = Great_Vibes({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
})
const satisfy = Satisfy({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
})
const sacramento = Sacramento({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
})
const kalam = Kalam({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  preload: false,
})
const shadowsIntoLight = Shadows_Into_Light({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
})
const indieFlower = Indie_Flower({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
})
const permanentMarker = Permanent_Marker({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  preload: false,
})
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  preload: false,
})
const firaCode = Fira_Code({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})
const sourceCodePro = Source_Code_Pro({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})

// Bangla families carry the `latin` subset as well: a Bengali storefront still
// prints prices, order numbers and courier names in Latin characters, and a
// font without that range would render them from an unrelated fallback face.
// Google Sans is the Bangla default: one family with its Latin and Bengali
// letters drawn together, so a line that mixes a Bangla headline with an
// English product name or a price reads as one voice rather than two fonts.
const googleSans = Google_Sans({
  subsets: ['bengali', 'latin'],
  display: 'swap',
  preload: false,
})
const hindSiliguri = Hind_Siliguri({
  subsets: ['bengali', 'latin'],
  weight: ['400', '600', '700'],
  display: 'swap',
  preload: false,
})
const notoSansBengali = Noto_Sans_Bengali({
  subsets: ['bengali', 'latin'],
  display: 'swap',
  preload: false,
})
const balooDa = Baloo_Da_2({
  subsets: ['bengali', 'latin'],
  display: 'swap',
  preload: false,
})
const atma = Atma({
  subsets: ['bengali', 'latin'],
  weight: ['400', '600'],
  display: 'swap',
  preload: false,
})
const tiroBangla = Tiro_Bangla({
  subsets: ['bengali', 'latin'],
  weight: '400',
  display: 'swap',
  preload: false,
})
const galada = Galada({
  subsets: ['bengali', 'latin'],
  weight: '400',
  display: 'swap',
  preload: false,
})
const anekBangla = Anek_Bangla({
  subsets: ['bengali', 'latin'],
  display: 'swap',
  preload: false,
})
const notoSerifBengali = Noto_Serif_Bengali({
  subsets: ['bengali', 'latin'],
  display: 'swap',
  preload: false,
})
const mina = Mina({
  subsets: ['bengali', 'latin'],
  weight: ['400', '700'],
  display: 'swap',
  preload: false,
})
const alkatra = Alkatra({
  subsets: ['bengali', 'latin'],
  display: 'swap',
  preload: false,
})

/**
 * Which alphabet a family is chosen for, so the picker can show a specimen the
 * font can actually render — a Bangla sentence set in Playfair Display, or an
 * English one in Galada, tells a merchant nothing about either.
 */
export type FontScript = 'latin' | 'bangla'

/** The generic family appended to every stack, by the shape of the group. */
/**
 * NCOM's taka sign, first in every stack below. It covers "৳" and nothing
 * else (see lib/taka-font.ts), so a price reads the same on every storefront
 * whichever fonts the merchant chose — Hind Siliguri's knotted sign, a Latin
 * face with none at all — and matches the dashboard's.
 *
 * Read defensively. In a route handler the local font is not compiled at all
 * (Turbopack leaves `lib/taka-font.ts` with no exports in that layer), so the
 * import is undefined there — and reading `.style` of it at module load took
 * down every route that reaches this file: the landing page's order endpoint,
 * the MCP server. Nothing a route handler builds is ever drawn, so a generic
 * family keeps those stacks valid.
 */
const TAKA =
  (takaFont as typeof takaFont | undefined)?.style.fontFamily ?? 'system-ui'

const GENERIC: Record<string, string> = {
  sans: 'ui-sans-serif, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  cursive: 'cursive',
}

export interface FontOption {
  /**
   * What gets stored on the theme, and the label shown in the picker.
   *
   * The family name rather than an id, so a theme keeps rendering the face the
   * merchant chose even if this list is reordered or an entry is dropped.
   */
  name: string
  group: string
  script: FontScript
  /** A complete `font-family` value: the self-hosted face, then its fallbacks. */
  stack: string
}

export interface FontGroup {
  label: string
  fonts: FontOption[]
}

/** Only the parts of a `next/font` result this module needs. */
type LoadedFont = { style: { fontFamily: string } }

/**
 * The Bangla face that stands in for a Latin family's missing letters, by the
 * family's shape.
 *
 * A Latin face has no Bengali glyphs, so a Bangla word set in Poppins is drawn
 * from whatever the visitor's phone happens to have — often nothing that
 * matches, sometimes boxes. Every Latin stack therefore names a Bangla
 * companion between its own face and the generic fallback: English letters
 * keep the merchant's face, and Bangla letters get a real Bangla one of the
 * same character. The companion is a CSS variable (`--page-bangla-*`) rather
 * than a literal, so the storefront's theme turns companions on (see
 * `themeToCssProperties`) and every other place a stack is used — the font
 * picker, the dashboard — falls straight through to the generic family.
 */
type Companion = 'sans' | 'serif' | 'display' | 'hand' | 'mono'

function group(
  label: string,
  generic: keyof typeof GENERIC,
  script: FontScript,
  fonts: [name: string, loaded: LoadedFont][],
  companion?: Companion
): FontGroup {
  return {
    label,
    fonts: fonts.map(([name, loaded]) => ({
      name,
      group: label,
      script,
      stack:
        script === 'latin' && companion
          ? `${TAKA}, ${loaded.style.fontFamily}, var(--page-bangla-${companion}, ${GENERIC[generic]}), ${GENERIC[generic]}`
          : `${TAKA}, ${loaded.style.fontFamily}, ${GENERIC[generic]}`,
    })),
  }
}

/**
 * The catalogue, grouped the way a merchant shops for a typeface rather than
 * the way the files are organised.
 */
export const FONT_GROUPS: FontGroup[] = [
  group(
    'Sans serif',
    'sans',
    'latin',
    [
      ['Inter', inter],
      ['Manrope', manrope],
      ['DM Sans', dmSans],
      ['Plus Jakarta Sans', plusJakartaSans],
      ['Poppins', poppins],
      ['Montserrat', montserrat],
      ['Roboto', roboto],
      ['Open Sans', openSans],
      ['Lato', lato],
      ['Nunito', nunito],
      ['Work Sans', workSans],
      ['Figtree', figtree],
      ['Rubik', rubik],
      ['Karla', karla],
      ['Mulish', mulish],
      ['Outfit', outfit],
      ['Sora', sora],
      ['Urbanist', urbanist],
      ['Barlow', barlow],
      ['Raleway', raleway],
      ['Quicksand', quicksand],
      ['Public Sans', publicSans],
      ['Archivo', archivo],
      ['Onest', onest],
    ],
    'sans'
  ),
  group(
    'Serif',
    'serif',
    'latin',
    [
      ['Playfair Display', playfairDisplay],
      ['DM Serif Display', dmSerifDisplay],
      ['Merriweather', merriweather],
      ['Lora', lora],
      ['Source Serif 4', sourceSerif],
      ['EB Garamond', ebGaramond],
      ['Libre Baskerville', libreBaskerville],
      ['Cormorant Garamond', cormorantGaramond],
      ['Fraunces', fraunces],
      ['Bitter', bitter],
      ['Crimson Pro', crimsonPro],
      ['Spectral', spectral],
      ['Newsreader', newsreader],
      ['Zilla Slab', zillaSlab],
      ['Instrument Serif', instrumentSerif],
    ],
    'serif'
  ),
  group(
    'Display',
    'sans',
    'latin',
    [
      ['Bebas Neue', bebasNeue],
      ['Anton', anton],
      ['Oswald', oswald],
      ['Space Grotesk', spaceGrotesk],
      ['Archivo Black', archivoBlack],
      ['Righteous', righteous],
      ['Alfa Slab One', alfaSlabOne],
      ['Teko', teko],
      ['Unbounded', unbounded],
      ['Syne', syne],
    ],
    'display'
  ),
  group(
    'Handwriting',
    'cursive',
    'latin',
    [
      ['Dancing Script', dancingScript],
      ['Caveat', caveat],
      ['Pacifico', pacifico],
      ['Great Vibes', greatVibes],
      ['Satisfy', satisfy],
      ['Sacramento', sacramento],
      ['Kalam', kalam],
      ['Shadows Into Light', shadowsIntoLight],
      ['Indie Flower', indieFlower],
      ['Permanent Marker', permanentMarker],
    ],
    'hand'
  ),
  group(
    'Monospace',
    'mono',
    'latin',
    [
      ['JetBrains Mono', jetbrainsMono],
      ['Roboto Mono', robotoMono],
      ['Space Mono', spaceMono],
      ['IBM Plex Mono', ibmPlexMono],
      ['Fira Code', firaCode],
      ['Source Code Pro', sourceCodePro],
    ],
    'mono'
  ),
  // Split by shape like the Latin groups rather than lumped into one "Bangla"
  // list, so each family gets the generic fallback that matches it — a serif
  // Bengali face dropping to `sans-serif` mid-download is a visible jump.
  group('Bangla sans', 'sans', 'bangla', [
    ['Google Sans', googleSans],
    ['Hind Siliguri', hindSiliguri],
    ['Noto Sans Bengali', notoSansBengali],
    ['Anek Bangla', anekBangla],
    ['Baloo Da 2', balooDa],
    ['Mina', mina],
    ['Atma', atma],
  ]),
  group('Bangla serif', 'serif', 'bangla', [
    ['Noto Serif Bengali', notoSerifBengali],
    ['Tiro Bangla', tiroBangla],
  ]),
  group('Bangla display', 'sans', 'bangla', [
    ['Galada', galada],
    ['Alkatra', alkatra],
  ]),
]

/**
 * The companion faces as CSS variables, for the storefront's theme to set.
 * See `Companion` for why Latin stacks name them.
 */
export const BANGLA_COMPANION_PROPERTIES: Record<string, string> = {
  '--page-bangla-sans': `${googleSans.style.fontFamily}`,
  '--page-bangla-serif': `${notoSerifBengali.style.fontFamily}`,
  '--page-bangla-display': `${googleSans.style.fontFamily}`,
  '--page-bangla-hand': `${atma.style.fontFamily}`,
  '--page-bangla-mono': `${notoSansBengali.style.fontFamily}`,
}

export const FONT_OPTIONS: FontOption[] = FONT_GROUPS.flatMap(
  (entry) => entry.fonts
)

const BY_NAME = new Map(
  FONT_OPTIONS.map((option) => [option.name.toLowerCase(), option])
)

export function findFont(
  name: string | null | undefined
): FontOption | undefined {
  // Spaces squeezed as every other font-name comparison does, so "Hind  Siliguri"
  // is the catalogue face rather than a Google family to fetch.
  return name
    ? BY_NAME.get(name.trim().replace(/\s+/g, ' ').toLowerCase())
    : undefined
}

/**
 * The Unicode block Bengali script lives in.
 *
 * Written as escapes rather than as the literal characters so the range stays
 * readable and reviewable — the literal form is a pair of glyphs most editors
 * render identically to nothing in particular, and a stray edit to it would be
 * invisible in a diff.
 */
const BENGALI = /[\u0980-\u09FF]/

/**
 * Which script a merchant is actually typing, so the picker can lead with
 * fonts that can render it.
 *
 * A single Bengali character is enough to answer "bangla", and that is
 * deliberate rather than a threshold worth tuning. The question this answers is
 * not "which language is this page in" but "can a Latin-only face set this
 * text" — and the answer to that is no as soon as one Bengali glyph appears.
 * Mixed Bangla/English copy is the normal case on a Bangladeshi landing page,
 * and every family in the Bangla groups carries the `latin` subset too, so
 * leading with them is right for mixed text as well as pure Bangla.
 */
export function detectScript(
  ...texts: (string | null | undefined)[]
): FontScript {
  return texts.some((text) => text && BENGALI.test(text)) ? 'bangla' : 'latin'
}

/**
 * The catalogue ordered for the script being typed, groups that can render it
 * first.
 *
 * Nothing is hidden. A merchant who wants a Latin display face for a Bangla
 * headline is allowed to have one — they just should not have to scroll past
 * 65 families that cannot set their text to find the ten that can, and should
 * not pick one by mistake. `rendersScript` is what the picker warns on.
 */
export function fontGroupsForScript(
  script: FontScript
): (FontGroup & { rendersScript: boolean })[] {
  return FONT_GROUPS.map((entry) => ({
    ...entry,
    // Bangla families all carry the `latin` subset, so they render Latin text
    // fine; the reverse is not true, which is the whole asymmetry here.
    rendersScript: script === 'latin' || entry.fonts[0]?.script === 'bangla',
  })).sort((a, b) => Number(b.rendersScript) - Number(a.rendersScript))
}

/**
 * Turns a stored theme font into a `font-family` value.
 *
 * Themes saved before the picker existed hold whatever was typed into a free
 * text box, and that string is interpolated into a `style` attribute. Anything
 * that could close the declaration and start another one is stripped rather
 * than trusted, so an unrecognised value can only ever name a font.
 */
export function fontStack(name: string | null | undefined): string {
  const option = findFont(name)
  if (option) return option.stack

  // Any other Google Fonts family, loaded through NCOM's own font proxy (see
  // `lib/font-stylesheet.ts`). The Bangla companion sits behind it for the
  // same reason it sits behind every Latin catalogue face: a family without
  // Bangla letters should hand those letters to a real Bangla face, and one
  // that has them never reaches the companion at all. Decided by the name's
  // shape alone, which keeps the Google names list out of this file: a
  // typed-in "Arial" is named as itself but gets no stylesheet, so a
  // visitor's own copy of it is used if they have one. Spaces are evened out
  // because a quoted family name is matched against its `@font-face` letter
  // for letter (only case aside), and the stylesheet declares Google's
  // spelling: "Josefin  Sans" would load the face and then never use it.
  if (isGoogleFamilyName(name)) {
    return `${TAKA}, "${name!.trim().replace(/\s+/g, ' ')}", var(--page-bangla-sans, ${GENERIC.sans}), ${GENERIC.sans}`
  }

  const legacy = (name ?? '').replace(/[^\p{L}\p{N} '-]/gu, '').trim()
  return legacy
    ? `${TAKA}, "${legacy}", ${GENERIC.sans}`
    : `${TAKA}, ${GENERIC.sans}`
}

/**
 * Whether a stored font name could be a Google Fonts family outside the
 * catalogue: letters, digits and spaces only — the shape of every Google
 * family name — so it is safe both inside a CSS string and in a URL. Only the
 * shape: `googleFamilyName` in lib/font-stylesheet.ts is what checks that the
 * family exists before a page asks the font proxy for it.
 */
export function isGoogleFamilyName(name: string | null | undefined): boolean {
  if (!name) return false
  const trimmed = name.trim()
  return /^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/.test(trimmed) && !findFont(trimmed)
}
