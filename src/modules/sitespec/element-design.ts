import { findFont } from '@/lib/fonts'
import { findGoogleFont } from '@/lib/google-fonts'
import type { SectionDefinition } from '../sections/registry'
import type { SiteKind } from '../sections/storefront'
import {
  ANIMATION_TYPES,
  EASINGS,
  isColor,
  isLength,
  isRatio,
  type Corners,
  type ElementAnimation,
  type ElementDesign,
  type ElementDesignMap,
  type ElementStyle,
  type ElementTransition,
  type Gradient,
  type Shadow,
  type Sides,
} from '../sections/elementStyle'
import {
  EXTRA_ELEMENT_TYPES,
  ICON_NAMES,
  extraElementSchema,
  extraKey,
  type ElementDescriptor,
  type ExtraElement,
  type ExtraElementType,
} from '../sections/elementDescriptors'
import { cutText, wellFormed } from './format'
import type { DesignIssue } from './normalize'

/**
 * The layer below a section's `style`: how each thing inside a block looks,
 * and the elements a design adds to a block.
 *
 * A section's `style` reaches the wrapper — one background, one padding. The
 * builder reaches further: every headline, button, card and image a block
 * draws, per screen size, with a hover state and an entrance animation
 * (`elementStyle.ts`), plus headings, buttons, badges and pictures a merchant
 * drops into a block (`extras`). This file is what lets a design written
 * outside the builder — our AI builder, a merchant's own AI, an AI code
 * editor — reach the same depth, so the only limit on a page is what someone
 * can describe.
 *
 * Same rule as the rest of the reader: repair, don't reject. A model writes
 * CSS from habit — `"font-size": "2rem"`, `"bold"`, `"0 8px 24px
 * rgba(0,0,0,.15)"`, `opacity: 0.5` — so each of those is read as what it
 * plainly means, and only what cannot be read at all is left out, with a
 * note. What comes out is exactly the shape `elementStyle.ts` paints from, so
 * the builder's own panels show and edit it like anything a merchant set.
 *
 * The stylesheet still validates every value again when it renders: this is
 * where a design is made useful, not where the page is made safe.
 */

// ── Properties ───────────────────────────────────────────────────────────

type PropertySpec =
  /** A number of pixels. "24px", "1.5rem" and "24" are all read. */
  | { type: 'px'; min: number; max: number }
  /**
   * A plain number in its own unit. `percent` says a value written as a
   * fraction or a multiple — `opacity: 0.5`, `scale: 1.1` — means that many
   * hundredths, which is how CSS writes them and not how the builder stores
   * them.
   */
  | {
      type: 'number'
      min: number
      max: number
      unit?: string
      percent?: 'fraction' | 'multiple'
    }
  | { type: 'choice'; options: readonly string[] }
  | { type: 'color' }
  | { type: 'length' }
  | { type: 'sides'; min: number; max: number }
  | { type: 'corners' }
  | { type: 'shadow'; text?: boolean }
  | { type: 'gradient' }
  | { type: 'font' }
  | { type: 'url' }
  | { type: 'flag' }
  | { type: 'ratio' }

const POSITIONS = ['center', 'top', 'bottom', 'left', 'right'] as const

/**
 * Every property an element can be given, with the range the stylesheet
 * draws it in (`styleDeclarations`). Typed against `ElementStyle`, so a
 * property added there and forgotten here fails the build rather than being
 * silently out of reach of every AI.
 */
const PROPERTIES = {
  fontFamily: { type: 'font' },
  fontSize: { type: 'px', min: 1, max: 400 },
  fontWeight: { type: 'number', min: 100, max: 900 },
  fontStyle: { type: 'choice', options: ['normal', 'italic'] },
  lineHeight: { type: 'number', min: 0.5, max: 4, unit: '× the font size' },
  letterSpacing: { type: 'px', min: -20, max: 60 },
  textTransform: {
    type: 'choice',
    options: ['none', 'uppercase', 'lowercase', 'capitalize'],
  },
  textDecoration: {
    type: 'choice',
    options: ['none', 'underline', 'line-through'],
  },
  textAlign: {
    type: 'choice',
    options: ['left', 'center', 'right', 'justify'],
  },
  color: { type: 'color' },
  textShadow: { type: 'shadow', text: true },
  lineClamp: { type: 'number', min: 1, max: 20, unit: 'lines' },

  backgroundColor: { type: 'color' },
  gradient: { type: 'gradient' },
  backgroundImageUrl: { type: 'url' },
  backgroundSize: { type: 'choice', options: ['cover', 'contain', 'auto'] },
  backgroundPosition: { type: 'choice', options: POSITIONS },
  opacity: { type: 'number', min: 0, max: 100, unit: '%', percent: 'fraction' },

  padding: { type: 'sides', min: 0, max: 9999 },
  margin: { type: 'sides', min: -999, max: 9999 },
  width: { type: 'length' },
  minWidth: { type: 'length' },
  maxWidth: { type: 'length' },
  height: { type: 'length' },
  minHeight: { type: 'length' },
  maxHeight: { type: 'length' },

  borderWidth: { type: 'sides', min: 0, max: 200 },
  borderStyle: {
    type: 'choice',
    options: ['solid', 'dashed', 'dotted', 'double'],
  },
  borderColor: { type: 'color' },
  borderRadius: { type: 'corners' },
  boxShadow: { type: 'shadow' },

  blur: { type: 'px', min: 0, max: 100 },
  brightness: {
    type: 'number',
    min: 0,
    max: 300,
    unit: '%, 100 = unchanged',
    percent: 'multiple',
  },
  contrast: {
    type: 'number',
    min: 0,
    max: 300,
    unit: '%, 100 = unchanged',
    percent: 'multiple',
  },
  saturate: {
    type: 'number',
    min: 0,
    max: 300,
    unit: '%, 100 = unchanged',
    percent: 'multiple',
  },
  grayscale: { type: 'number', min: 0, max: 100, unit: '%' },

  rotate: { type: 'number', min: -360, max: 360, unit: 'deg' },
  scale: {
    type: 'number',
    min: 1,
    max: 500,
    unit: '%, 100 = normal size',
    percent: 'multiple',
  },
  offsetX: { type: 'px', min: -4000, max: 4000 },
  offsetY: { type: 'px', min: -4000, max: 4000 },

  position: { type: 'choice', options: ['flow', 'absolute'] },
  top: { type: 'length' },
  right: { type: 'length' },
  bottom: { type: 'length' },
  left: { type: 'length' },
  zIndex: { type: 'number', min: -100, max: 9999 },

  display: {
    type: 'choice',
    options: ['block', 'inline-block', 'flex', 'inline-flex', 'grid', 'none'],
  },
  flexDirection: {
    type: 'choice',
    options: ['row', 'row-reverse', 'column', 'column-reverse'],
  },
  flexWrap: { type: 'choice', options: ['nowrap', 'wrap'] },
  justifyContent: {
    type: 'choice',
    options: [
      'flex-start',
      'center',
      'flex-end',
      'space-between',
      'space-around',
    ],
  },
  alignItems: {
    type: 'choice',
    options: ['flex-start', 'center', 'flex-end', 'stretch', 'baseline'],
  },
  alignSelf: {
    type: 'choice',
    options: ['auto', 'flex-start', 'center', 'flex-end', 'stretch'],
  },
  gap: { type: 'px', min: 0, max: 400 },
  order: { type: 'number', min: -50, max: 50 },
  gridColumns: { type: 'number', min: 1, max: 12 },

  objectFit: {
    type: 'choice',
    options: ['cover', 'contain', 'fill', 'none', 'scale-down'],
  },
  objectPosition: { type: 'choice', options: POSITIONS },
  aspectRatio: { type: 'ratio' },
  overflow: { type: 'choice', options: ['visible', 'hidden', 'auto'] },
  hidden: { type: 'flag' },
} as const satisfies Record<keyof ElementStyle, PropertySpec>

type PropertyName = keyof typeof PROPERTIES

/** Whole numbers only: CSS takes no half font weight or half a column. */
const WHOLE: ReadonlySet<PropertyName> = new Set([
  'fontWeight',
  'lineClamp',
  'zIndex',
  'order',
  'gridColumns',
])

/** How the guide lists them, in the order a designer thinks about an element. */
const PROPERTY_GROUPS: [label: string, properties: PropertyName[]][] = [
  [
    'Text',
    [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'fontStyle',
      'lineHeight',
      'letterSpacing',
      'textTransform',
      'textDecoration',
      'textAlign',
      'color',
      'textShadow',
      'lineClamp',
    ],
  ],
  [
    'Fill',
    [
      'backgroundColor',
      'gradient',
      'backgroundImageUrl',
      'backgroundSize',
      'backgroundPosition',
      'opacity',
    ],
  ],
  [
    'Size and spacing',
    [
      'padding',
      'margin',
      'width',
      'minWidth',
      'maxWidth',
      'height',
      'minHeight',
      'maxHeight',
    ],
  ],
  [
    'Border',
    ['borderWidth', 'borderStyle', 'borderColor', 'borderRadius', 'boxShadow'],
  ],
  [
    'Effects',
    [
      'blur',
      'brightness',
      'contrast',
      'saturate',
      'grayscale',
      'rotate',
      'scale',
      'offsetX',
      'offsetY',
    ],
  ],
  ['Position', ['position', 'top', 'right', 'bottom', 'left', 'zIndex']],
  [
    'Layout of what is inside',
    [
      'display',
      'flexDirection',
      'flexWrap',
      'justifyContent',
      'alignItems',
      'alignSelf',
      'gap',
      'order',
      'gridColumns',
    ],
  ],
  [
    'Pictures',
    ['objectFit', 'objectPosition', 'aspectRatio', 'overflow', 'hidden'],
  ],
]

// ── Limits ───────────────────────────────────────────────────────────────

/** Element designs one section may hold — far past any real block. */
const MAX_ELEMENT_KEYS = 150
/** Elements a design may add to one block. */
const MAX_EXTRAS = 40
/** A repeated element's items are addressed up to this index. */
const MAX_INSTANCE = 199
/** Notes kept about one section's element styling before they are summed up. */
const MAX_NOTES = 6

const EXTRA_ID_RE = /^[A-Za-z0-9_-]{1,40}$/
/** The stylesheet's own key grammar (`SAFE_KEY_RE` in elementStyle.ts). */
const SAFE_KEY_RE = /^[A-Za-z0-9_.:#-]{1,80}$/

// ── Reading values ───────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function squash(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** A number and the unit written after it: `"1.5rem"` → 1.5, `rem`. */
function readNumber(value: unknown): { n: number; unit: string } | undefined {
  if (typeof value === 'number')
    return Number.isFinite(value) ? { n: value, unit: '' } : undefined
  if (typeof value !== 'string') return undefined
  const match = /^\s*(-?(?:\d+\.?\d*|\.\d+))\s*([a-z%]*)\s*$/i.exec(value)
  if (!match) return undefined
  return { n: Number(match[1]), unit: match[2]!.toLowerCase() }
}

/** A length in pixels; `rem` and `em` count as 16px, the browser's default. */
const PX_PER: Record<string, number> = { '': 1, px: 1, rem: 16, em: 16 }

function readPx(value: unknown): number | undefined {
  const read = readNumber(value)
  if (!read || !Object.hasOwn(PX_PER, read.unit)) return undefined
  return round(read.n * PX_PER[read.unit]!)
}

/** Milliseconds: `300`, `"300ms"`, `"0.3s"`, or a bare `0.3` meaning seconds. */
function readMs(value: unknown): number | undefined {
  const read = readNumber(value)
  if (!read) return undefined
  if (read.unit === 's') return Math.round(read.n * 1000)
  if (read.unit === 'ms') return Math.round(read.n)
  if (read.unit !== '') return undefined
  return Math.round(read.n > 0 && read.n <= 10 ? read.n * 1000 : read.n)
}

/** CSS colour names a model reaches for, as the hex the stylesheet accepts. */
const NAMED_COLORS: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  gray: '#808080',
  grey: '#808080',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  darkgray: '#a9a9a9',
  darkgrey: '#a9a9a9',
  silver: '#c0c0c0',
  red: '#ff0000',
  darkred: '#8b0000',
  crimson: '#dc143c',
  maroon: '#800000',
  orange: '#ffa500',
  gold: '#ffd700',
  yellow: '#ffff00',
  green: '#008000',
  darkgreen: '#006400',
  lime: '#00ff00',
  olive: '#808000',
  teal: '#008080',
  cyan: '#00ffff',
  blue: '#0000ff',
  navy: '#000080',
  royalblue: '#4169e1',
  skyblue: '#87ceeb',
  purple: '#800080',
  violet: '#ee82ee',
  indigo: '#4b0082',
  magenta: '#ff00ff',
  pink: '#ffc0cb',
  hotpink: '#ff69b4',
  brown: '#a52a2a',
  beige: '#f5f5dc',
  ivory: '#fffff0',
  cream: '#fffdd0',
  whitesmoke: '#f5f5f5',
}

/** The stylesheet's colour grammar, as a plain yes or no. */
const colorOk = (candidate: string): boolean => isColor(candidate)

function readColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (colorOk(text)) return text
  const named = Object.hasOwn(NAMED_COLORS, text.toLowerCase())
    ? NAMED_COLORS[text.toLowerCase()]
    : undefined
  if (named) return named
  // "rgb(0 0 0 / 50%)" and friends with a stray space.
  const compact = text.replace(/\s+/g, ' ').replace(/\(\s+/g, '(')
  return colorOk(compact) ? compact : undefined
}

function readLength(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value))
    return `${round(value)}px`
  if (typeof value !== 'string') return undefined
  const text = value.trim().toLowerCase()
  if (isLength(text)) return text
  if (/^-?\d+(\.\d+)?$/.test(text)) return `${round(Number(text))}px`
  return undefined
}

/** CSS shorthand order: one value, [vertical, horizontal], [top, horizontal, bottom], or all four. */
function fourSides<T>(values: T[]): [T, T, T, T] | undefined {
  const [a, b, c, d] = values
  if (values.length === 1) return [a!, a!, a!, a!]
  if (values.length === 2) return [a!, b!, a!, b!]
  if (values.length === 3) return [a!, b!, c!, b!]
  if (values.length === 4) return [a!, b!, c!, d!]
  return undefined
}

function splitValues(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean)
}

function isAuto(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'auto'
}

function readSides(
  value: unknown,
  min: number,
  max: number
): Sides | undefined {
  const clampSide = (raw: unknown) => {
    const px = readPx(raw)
    return px === undefined ? undefined : Math.min(max, Math.max(min, px))
  }
  let list: unknown[] | undefined
  if (typeof value === 'number') list = [value]
  else if (typeof value === 'string') list = splitValues(value)
  else if (Array.isArray(value)) list = value
  if (list) {
    // "0 auto": a side the builder has no "auto" for is left unset, and the
    // numbers beside it still count (see readProperty for the note).
    const sides = fourSides(
      list.map((raw) => (isAuto(raw) ? 'auto' : clampSide(raw)))
    )
    if (!sides || sides.some((side) => side === undefined)) return undefined
    const out: Sides = {}
    ;(['top', 'right', 'bottom', 'left'] as const).forEach((side, index) => {
      const px = sides[index]
      if (typeof px === 'number') out[side] = px
    })
    return Object.keys(out).length ? out : undefined
  }
  if (!isRecord(value)) return undefined
  const out: Sides = {}
  const vertical = clampSide(value.y ?? value.vertical ?? value.block)
  const horizontal = clampSide(value.x ?? value.horizontal ?? value.inline)
  if (vertical !== undefined) out.top = out.bottom = vertical
  if (horizontal !== undefined) out.left = out.right = horizontal
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const px = clampSide(value[side])
    if (px !== undefined) out[side] = px
  }
  return Object.keys(out).length ? out : undefined
}

const CORNERS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const

function readCorners(value: unknown): Corners | undefined {
  const clampCorner = (raw: unknown) => {
    const px = readPx(raw)
    return px === undefined ? undefined : Math.min(9999, Math.max(0, px))
  }
  let list: unknown[] | undefined
  if (typeof value === 'number') list = [value]
  else if (typeof value === 'string') {
    // "50%" on a square is a circle; as pixels, a big radius is the same pill.
    list = splitValues(value).map((part) => (/%$/.test(part) ? 9999 : part))
  } else if (Array.isArray(value)) list = value
  if (list) {
    const corners = fourSides(list.map(clampCorner))
    if (!corners || corners.some((corner) => corner === undefined))
      return undefined
    const [topLeft, topRight, bottomRight, bottomLeft] = corners as number[]
    return { topLeft, topRight, bottomRight, bottomLeft }
  }
  if (!isRecord(value)) return undefined
  const out: Corners = {}
  for (const corner of CORNERS) {
    const raw = Object.entries(value).find(
      ([key]) => squash(key) === corner.toLowerCase()
    )?.[1]
    const px = clampCorner(raw)
    if (px !== undefined) out[corner] = px
  }
  return Object.keys(out).length ? out : undefined
}

/** Splits on commas and spaces that are not inside parentheses. */
function splitOutside(value: string, separator: ',' | ' '): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of value) {
    if (char === '(') depth += 1
    if (char === ')') depth = Math.max(0, depth - 1)
    const splits = separator === ' ' ? /\s/.test(char) : char === ','
    if (splits && depth === 0) {
      if (current.trim()) parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function readShadow(value: unknown, text: boolean): Shadow | undefined {
  if (isRecord(value)) {
    const out: Shadow = {}
    const x = readPx(value.x ?? value.offsetX)
    const y = readPx(value.y ?? value.offsetY)
    const blur = readPx(value.blur)
    const spread = readPx(value.spread)
    const paint = readColor(value.color)
    if (x !== undefined) out.x = Math.min(200, Math.max(-200, x))
    if (y !== undefined) out.y = Math.min(200, Math.max(-200, y))
    if (blur !== undefined) out.blur = Math.min(400, Math.max(0, blur))
    if (!text && spread !== undefined)
      out.spread = Math.min(200, Math.max(-200, spread))
    if (paint) out.color = paint
    if (!text && value.inset === true) out.inset = true
    return Object.keys(out).length ? out : undefined
  }
  if (typeof value !== 'string' || !value.trim()) return undefined
  if (value.trim().toLowerCase() === 'none') return undefined
  // The first shadow of a list: one is what an element carries.
  const first = splitOutside(value, ',')[0] ?? ''
  const lengths: number[] = []
  let paint: string | undefined
  let inset = false
  for (const token of splitOutside(first, ' ')) {
    if (token.toLowerCase() === 'inset') inset = true
    else if (readPx(token) !== undefined) lengths.push(readPx(token)!)
    else paint ??= readColor(token)
  }
  if (lengths.length < 2) return undefined
  const [x, y, blur, spread] = lengths
  return readShadow(
    { x, y, blur, spread, color: paint, inset: inset || undefined },
    text
  )
}

const GRADIENT_DIRECTIONS: Record<string, number> = {
  totop: 0,
  totopright: 45,
  toright: 90,
  tobottomright: 135,
  tobottom: 180,
  tobottomleft: 225,
  toleft: 270,
  totopleft: 315,
}

function readGradient(value: unknown): Gradient | undefined {
  if (isRecord(value)) {
    const from = readColor(value.from ?? value.start)
    const to = readColor(value.to ?? value.end)
    if (!from || !to) return undefined
    const angle = readNumber(value.angle)
    return {
      angle: angle ? ((Math.round(angle.n) % 360) + 360) % 360 : 180,
      from,
      to,
    }
  }
  if (typeof value !== 'string') return undefined
  const match = /^\s*(?:repeating-)?linear-gradient\((.*)\)\s*$/i.exec(value)
  if (!match) return undefined
  const parts = splitOutside(match[1]!, ',')
  let angle = 180
  const head = parts[0] ?? ''
  const degrees = /^(-?\d+(?:\.\d+)?)deg$/i.exec(head.trim())
  if (degrees) {
    angle = ((Math.round(Number(degrees[1])) % 360) + 360) % 360
    parts.shift()
  } else if (Object.hasOwn(GRADIENT_DIRECTIONS, squash(head))) {
    angle = GRADIENT_DIRECTIONS[squash(head)]!
    parts.shift()
  }
  // A stop is a colour with an optional position after it ("#fff 40%").
  const colors = parts
    .map((part) => readColor(splitOutside(part, ' ')[0] ?? ''))
    .filter((paint): paint is string => Boolean(paint))
  if (colors.length < 2) return undefined
  return { angle, from: colors[0]!, to: colors[colors.length - 1]! }
}

/** The family a font name means, spelled as the catalogue spells it. */
export function canonicalFont(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  // A CSS stack ("'Inter', sans-serif"): its first family is the choice.
  const first = value
    .split(',')[0]!
    .trim()
    .replace(/^["']|["']$/g, '')
  return findFont(first)?.name ?? findGoogleFont(first)?.family
}

function readUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value
    .trim()
    .replace(/^url\(\s*(['"]?)(.*)\1\s*\)$/i, '$2')
    .trim()
  return /^(https:\/\/|\/)[^\s"'()\\]{1,1990}$/.test(text) ? text : undefined
}

function readRatio(value: unknown): string | undefined {
  if (typeof value === 'number' && value > 0 && value < 10000)
    return `${round(value)} / 1`
  if (typeof value !== 'string') return undefined
  const text = value.trim().toLowerCase()
  if (text === 'square') return '1 / 1'
  const match = /^(\d+(?:\.\d+)?)\s*[/:x]\s*(\d+(?:\.\d+)?)$/.exec(text)
  if (match) {
    const ratio = `${match[1]} / ${match[2]}`
    return isRatio(ratio) ? ratio : undefined
  }
  const single = readNumber(text)
  return single && single.unit === '' && single.n > 0
    ? readRatio(single.n)
    : undefined
}

function readFlag(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

/** Other words for a choice, keyed by their squashed spelling. */
const CHOICE_SYNONYMS: Record<string, string[]> = {
  middle: ['center'],
  centre: ['center'],
  centered: ['center'],
  centred: ['center'],
  start: ['left', 'flex-start'],
  end: ['right', 'flex-end'],
  spaceevenly: ['space-around'],
  relative: ['flow'],
  static: ['flow'],
  inline: ['inline-block'],
  strikethrough: ['line-through'],
  vertical: ['column'],
  horizontal: ['row'],
  scroll: ['auto'],
  clip: ['hidden'],
  scaledown: ['scale-down'],
}

function readChoice(
  value: unknown,
  options: readonly string[]
): string | undefined {
  if (typeof value !== 'string') return undefined
  const key = squash(value)
  const wanted = [
    key,
    `flex${key}`,
    ...(Object.hasOwn(CHOICE_SYNONYMS, key) ? CHOICE_SYNONYMS[key]! : []),
  ].map(squash)
  return options.find((option) => wanted.includes(squash(option)))
}

const FONT_WEIGHTS: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  normal: 400,
  regular: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
}

// ── Notes ────────────────────────────────────────────────────────────────

/**
 * Where a section's notes about element styling collect before they join the
 * design's issues. A model that misreads the format once misreads it forty
 * times, and forty notes would bury the one that matters — so past a handful
 * they are counted instead of listed (see `flushNotes`).
 */
export interface ElementNotes {
  where: string
  list: DesignIssue[]
}

function note(
  notes: ElementNotes,
  level: DesignIssue['level'],
  message: string
) {
  notes.list.push({ level, where: notes.where, message })
}

/** Moves a section's element notes into `issues`, summing up past a handful. */
export function flushNotes(notes: ElementNotes, issues: DesignIssue[]) {
  if (notes.list.length <= MAX_NOTES) {
    issues.push(...notes.list)
    return
  }
  const shown = notes.list.slice(0, MAX_NOTES - 1)
  const rest = notes.list.length - shown.length
  issues.push(...shown, {
    level: notes.list.some((issue) => issue.level === 'warning')
      ? 'warning'
      : 'info',
    where: notes.where,
    message: `…and ${rest} more notes like these about its element styles.`,
  })
}

// ── One element style ────────────────────────────────────────────────────

/** Squashed name → property, for every property and the names CSS uses. */
const PROPERTY_BY_NAME = new Map<string, PropertyName>(
  (Object.keys(PROPERTIES) as PropertyName[]).map((name) => [
    squash(name),
    name,
  ])
)

const PROPERTY_ALIASES: Record<string, PropertyName> = {
  bg: 'backgroundColor',
  bgcolor: 'backgroundColor',
  backgroundcolour: 'backgroundColor',
  fill: 'backgroundColor',
  textcolor: 'color',
  textcolour: 'color',
  fontcolor: 'color',
  fontcolour: 'color',
  foreground: 'color',
  colour: 'color',
  font: 'fontFamily',
  family: 'fontFamily',
  size: 'fontSize',
  textsize: 'fontSize',
  weight: 'fontWeight',
  italic: 'fontStyle',
  leading: 'lineHeight',
  tracking: 'letterSpacing',
  case: 'textTransform',
  align: 'textAlign',
  textalignment: 'textAlign',
  maxlines: 'lineClamp',
  clamp: 'lineClamp',
  webkitlineclamp: 'lineClamp',
  radius: 'borderRadius',
  rounded: 'borderRadius',
  corners: 'borderRadius',
  shadow: 'boxShadow',
  dropshadow: 'boxShadow',
  rotation: 'rotate',
  zoom: 'scale',
  translatex: 'offsetX',
  translatey: 'offsetY',
  x: 'offsetX',
  y: 'offsetY',
  z: 'zIndex',
  layer: 'zIndex',
  columns: 'gridColumns',
  gridtemplatecolumns: 'gridColumns',
  fit: 'objectFit',
  ratio: 'aspectRatio',
  hide: 'hidden',
  w: 'width',
  h: 'height',
  bordercolour: 'borderColor',
  backgroundimage: 'backgroundImageUrl',
  image: 'backgroundImageUrl',
  imageurl: 'backgroundImageUrl',
}

type Side = 'top' | 'right' | 'bottom' | 'left'

type Target =
  | { kind: 'property'; name: PropertyName }
  | {
      kind: 'side'
      name: 'padding' | 'margin' | 'borderWidth'
      sides: Side[]
    }
  | { kind: 'corner'; corner: (typeof CORNERS)[number] }
  | { kind: 'background' | 'border' | 'transform' | 'font' }

function resolveProperty(raw: string): Target | null {
  const key = squash(raw)
  if (key === 'background') return { kind: 'background' }
  if (key === 'border') return { kind: 'border' }
  if (key === 'transform') return { kind: 'transform' }
  // "font: italic 700 24px Inter" — the shorthand, as against a family name.
  if (key === 'font') return { kind: 'font' }
  const direct = PROPERTY_BY_NAME.get(key)
  if (direct) return { kind: 'property', name: direct }
  if (Object.hasOwn(PROPERTY_ALIASES, key))
    return { kind: 'property', name: PROPERTY_ALIASES[key]! }
  const side =
    /^(padding|margin|border)(top|right|bottom|left|x|y|inline|block|horizontal|vertical)(width)?$/.exec(
      key
    )
  if (side && (side[1] !== 'border' || side[3])) {
    const which = side[2]!
    const sides: Side[] = ['x', 'inline', 'horizontal'].includes(which)
      ? ['left', 'right']
      : ['y', 'block', 'vertical'].includes(which)
        ? ['top', 'bottom']
        : [which as Side]
    return {
      kind: 'side',
      name:
        side[1] === 'border'
          ? 'borderWidth'
          : (side[1] as 'padding' | 'margin'),
      sides,
    }
  }
  const corner = /^border(top|bottom)(left|right)radius$/.exec(key)
  if (corner) {
    const name = `${corner[1]}${corner[2]![0]!.toUpperCase()}${corner[2]!.slice(1)}`
    return { kind: 'corner', corner: name as (typeof CORNERS)[number] }
  }
  return null
}

/**
 * One property's value read for its spec, or undefined when it cannot be.
 * `fontSize` is the element's own size in this style, which an `em` of
 * letter spacing is counted in.
 */
function readProperty(
  name: PropertyName,
  value: unknown,
  path: string,
  notes: ElementNotes,
  fontSize = 16
): unknown {
  const spec: PropertySpec = PROPERTIES[name]
  switch (spec.type) {
    case 'px': {
      const read = readNumber(value)
      const px =
        name === 'letterSpacing' && read?.unit === 'em'
          ? round(read.n * fontSize)
          : readPx(value)
      if (px === undefined) return undefined
      return clampNumber(px, spec.min, spec.max, path, notes)
    }
    case 'number': {
      if (name === 'fontWeight' && typeof value === 'string') {
        const named = FONT_WEIGHTS[squash(value)]
        if (named) return named
      }
      const read = readNumber(value)
      if (!read) return undefined
      let n = read.n
      // Only the unit the property is counted in: a line height of "24px"
      // is not 24 times the font size, and is better left out than read so.
      const unit = spec.unit?.startsWith('%')
        ? '%'
        : spec.unit === 'deg'
          ? 'deg'
          : ''
      if (read.unit && read.unit !== unit) return undefined
      if (spec.percent === 'fraction' && read.unit === '' && n > 0 && n <= 1) {
        n *= 100
      }
      if (spec.percent === 'multiple' && read.unit === '' && n > 0 && n <= 5) {
        n *= 100
      }
      if (WHOLE.has(name)) n = Math.round(n)
      return clampNumber(round(n), spec.min, spec.max, path, notes)
    }
    case 'choice':
      return readChoice(value, spec.options)
    case 'color':
      return readColor(value)
    case 'length':
      return readLength(value)
    case 'sides': {
      const sides = readSides(value, spec.min, spec.max)
      const parts =
        typeof value === 'string'
          ? splitValues(value)
          : Array.isArray(value)
            ? value
            : []
      if (sides && parts.some(isAuto)) {
        note(
          notes,
          'info',
          `"${path}": "auto" is not available here, so only the numbers were used. Centre an element with "alignSelf": "center" or its container's "alignItems", or with "margin" numbers.`
        )
      }
      return sides
    }
    case 'corners':
      return readCorners(value)
    case 'shadow':
      return readShadow(value, 'text' in spec && spec.text === true)
    case 'gradient':
      return readGradient(value)
    case 'font':
      return canonicalFont(value)
    case 'url':
      return readUrl(value)
    case 'flag':
      return readFlag(value)
    case 'ratio':
      return readRatio(value)
  }
}

function clampNumber(
  n: number,
  min: number,
  max: number,
  path: string,
  notes: ElementNotes
): number {
  if (n > max) {
    note(notes, 'info', `Set "${path}" to ${max}, the most it can be.`)
    return max
  }
  if (n < min) {
    note(notes, 'info', `Set "${path}" to ${min}, the least it can be.`)
    return min
  }
  return n
}

/** What went wrong with a value, in the words the guide uses for it. */
function expected(name: PropertyName): string {
  const spec: PropertySpec = PROPERTIES[name]
  switch (spec.type) {
    case 'px':
      return `a number of pixels (${spec.min}–${spec.max})`
    case 'number':
      return `a number (${spec.min}–${spec.max}${spec.unit ? `, ${spec.unit}` : ''})`
    case 'choice':
      return `one of ${spec.options.join(', ')}`
    case 'color':
      return 'a colour like "#1f7a4d", "rgba(0,0,0,.5)" or "var(--page-primary)"'
    case 'length':
      return 'a length like "240px", "50%", "20rem", "100vw" or "auto"'
    case 'sides':
      return 'a number of pixels, [vertical, horizontal], [top, right, bottom, left] or { top, right, bottom, left }'
    case 'corners':
      return 'a number of pixels or { topLeft, topRight, bottomRight, bottomLeft }'
    case 'shadow':
      return 'a shadow like "0 8px 24px rgba(0,0,0,.15)" or { x, y, blur, color }'
    case 'gradient':
      return 'a gradient like { "angle": 135, "from": "#…", "to": "#…" }'
    case 'font':
      return 'a font from the guide or a Google Fonts family by its exact name'
    case 'url':
      return 'an https:// image address'
    case 'flag':
      return 'true or false'
    case 'ratio':
      return 'a ratio like "16 / 9"'
  }
}

function closestProperty(raw: string): string | null {
  const key = squash(raw)
  let best: string | null = null
  let bestScore = Infinity
  for (const [squashed, name] of PROPERTY_BY_NAME) {
    const score = distance(key, squashed)
    if (score < bestScore) {
      bestScore = score
      best = name
    }
  }
  return bestScore <= 2 ? best : null
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      previous = current
    }
  }
  return row[b.length]!
}

/** `transform: "rotate(-3deg) scale(1.05) translateY(-4px)"` as the builder's own controls. */
function readTransform(value: string): Partial<ElementStyle> | undefined {
  const out: Partial<ElementStyle> = {}
  for (const match of value.matchAll(/([a-z]+[XY]?)\(([^)]*)\)/gi)) {
    const fn = match[1]!.toLowerCase()
    const args = match[2]!.split(/[\s,]+/).filter(Boolean)
    if (fn === 'rotate' || fn === 'rotatez') {
      const read = readNumber(args[0])
      if (read && (read.unit === 'deg' || read.unit === ''))
        out.rotate = Math.min(360, Math.max(-360, round(read.n)))
    } else if (fn === 'scale') {
      const read = readNumber(args[0])
      if (read && read.unit === '')
        out.scale = Math.min(500, Math.max(1, round(read.n * 100)))
    } else if (fn === 'translate' || fn === 'translatex') {
      const x = readPx(args[0])
      if (x !== undefined) out.offsetX = x
      if (fn === 'translate') {
        const y = readPx(args[1])
        if (y !== undefined) out.offsetY = y
      }
    } else if (fn === 'translatey') {
      const y = readPx(args[0])
      if (y !== undefined) out.offsetY = y
    }
  }
  return Object.keys(out).length ? out : undefined
}

/** `border: "1px solid #e5e7eb"` as width, style and colour. */
function readBorder(value: unknown): Partial<ElementStyle> | undefined {
  if (typeof value === 'number') return readBorder(`${value}px solid`)
  if (typeof value !== 'string') return undefined
  if (value.trim().toLowerCase() === 'none') {
    return { borderWidth: { top: 0, right: 0, bottom: 0, left: 0 } }
  }
  const out: Partial<ElementStyle> = {}
  for (const token of splitOutside(value, ' ')) {
    const px = readPx(token)
    const style = readChoice(token, PROPERTIES.borderStyle.options)
    if (px !== undefined) {
      const width = Math.min(200, Math.max(0, px))
      out.borderWidth = { top: width, right: width, bottom: width, left: width }
    } else if (style) out.borderStyle = style as ElementStyle['borderStyle']
    else {
      const paint = readColor(token)
      if (paint) out.borderColor = paint
    }
  }
  if (!out.borderWidth && (out.borderStyle || out.borderColor)) {
    out.borderWidth = { top: 1, right: 1, bottom: 1, left: 1 }
  }
  return Object.keys(out).length ? out : undefined
}

/** `background: "#111"`, `"linear-gradient(…)"` or `"url(…) center/cover"`. */
function readBackground(value: unknown): Partial<ElementStyle> | undefined {
  if (typeof value !== 'string') return undefined
  const gradient = readGradient(value)
  if (gradient) return { gradient }
  const url = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/i.exec(value)
  if (url) {
    const src = readUrl(url[2])
    if (!src) return undefined
    const rest = value.replace(url[0], ' ').toLowerCase()
    const out: Partial<ElementStyle> = { backgroundImageUrl: src }
    const size = /\b(cover|contain)\b/.exec(rest)?.[1]
    if (size) out.backgroundSize = size as ElementStyle['backgroundSize']
    const position = /\b(center|top|bottom|left|right)\b/.exec(rest)?.[1]
    if (position)
      out.backgroundPosition = position as ElementStyle['backgroundPosition']
    return out
  }
  const paint = readColor(value)
  return paint ? { backgroundColor: paint } : undefined
}

/** `font: "italic 700 24px/1.2 Inter"`. */
function readFontShorthand(value: unknown): Partial<ElementStyle> | undefined {
  if (typeof value !== 'string') return undefined
  // A family name on its own ("Lexend") is what most models mean by "font".
  const family = canonicalFont(value)
  if (family) return { fontFamily: family }
  const out: Partial<ElementStyle> = {}
  const tokens = splitOutside(value, ' ')
  const rest: string[] = []
  for (const token of tokens) {
    const [size, lineHeight] = token.split('/')
    if (token.toLowerCase() === 'italic') out.fontStyle = 'italic'
    else if (FONT_WEIGHTS[squash(token)] || /^[1-9]00$/.test(token))
      out.fontWeight = FONT_WEIGHTS[squash(token)] ?? Number(token)
    else if (readPx(size) !== undefined && /[a-z]/i.test(size!)) {
      out.fontSize = Math.min(400, Math.max(1, readPx(size)!))
      const height = readNumber(lineHeight)
      if (height && height.unit === '')
        out.lineHeight = Math.min(4, Math.max(0.5, height.n))
    } else rest.push(token)
  }
  const named = canonicalFont(rest.join(' '))
  if (named) out.fontFamily = named
  return Object.keys(out).length ? out : undefined
}

/**
 * One element's style at one screen size, read from whatever a model wrote:
 * camelCase or CSS's own kebab-case, shorthands, units, words for numbers.
 */
function readElementStyle(
  raw: unknown,
  path: string,
  notes: ElementNotes
): ElementStyle | undefined {
  if (!isRecord(raw)) {
    note(
      notes,
      'warning',
      `Ignored "${path}" — an element's style must be an object, like { "fontSize": 48, "color": "#ffffff" }.`
    )
    return undefined
  }
  const out: Record<string, unknown> = {}
  // The element's own font size, wherever in the object it was written, for
  // letter spacing given in `em`.
  const sizeEntry = Object.entries(raw).find(([key]) => {
    const target = resolveProperty(key)
    return target?.kind === 'property' && target.name === 'fontSize'
  })
  const fontSize = (sizeEntry && readPx(sizeEntry[1])) || 16
  for (const [key, value] of Object.entries(raw)) {
    if (key === '__proto__') continue
    // Nothing, not a request: an element design is laid over what is there.
    if (value === null || value === undefined || value === '') continue
    const at = `${path}.${key}`
    const target = resolveProperty(key)
    if (!target) {
      const guess = closestProperty(key)
      note(
        notes,
        'warning',
        `Ignored "${at}" — elements have no such style.${guess ? ` Did you mean "${guess}"?` : ''}`
      )
      continue
    }
    if (target.kind === 'property') {
      const read = readProperty(target.name, value, at, notes, fontSize)
      if (read === undefined) {
        note(
          notes,
          'warning',
          `Ignored "${at}" — it needs ${expected(target.name)}.`
        )
        continue
      }
      // Sides and corners set one at a time ("paddingTop") meet the whole
      // value ("padding") whichever came first.
      out[target.name] =
        isRecord(read) && isRecord(out[target.name])
          ? { ...(out[target.name] as object), ...read }
          : read
      continue
    }
    if (target.kind === 'side') {
      const spec = PROPERTIES[target.name]
      const px = readPx(value)
      if (px === undefined) {
        note(notes, 'warning', `Ignored "${at}" — it needs a number of pixels.`)
        continue
      }
      const clamped = Math.min(spec.max, Math.max(spec.min, px))
      const sides = { ...((out[target.name] as Sides | undefined) ?? {}) }
      for (const side of target.sides) sides[side] = clamped
      out[target.name] = sides
      continue
    }
    if (target.kind === 'corner') {
      const px = readPx(value)
      if (px === undefined) {
        note(notes, 'warning', `Ignored "${at}" — it needs a number of pixels.`)
        continue
      }
      out.borderRadius = {
        ...((out.borderRadius as Corners | undefined) ?? {}),
        [target.corner]: Math.min(9999, Math.max(0, px)),
      }
      continue
    }
    const read =
      target.kind === 'background'
        ? readBackground(value)
        : target.kind === 'border'
          ? readBorder(value)
          : target.kind === 'font'
            ? readFontShorthand(value)
            : typeof value === 'string'
              ? readTransform(value)
              : undefined
    if (!read) {
      note(
        notes,
        'warning',
        target.kind === 'transform'
          ? `Ignored "${at}" — use "rotate", "scale", "offsetX" and "offsetY" instead.`
          : `Ignored "${at}" — it could not be read.`
      )
      continue
    }
    Object.assign(out, read)
  }
  // A gradient claims the background image; a picture beside it would never show.
  if (out.gradient && out.backgroundImageUrl) {
    delete out.backgroundImageUrl
    note(
      notes,
      'info',
      `"${path}" had a gradient and a background picture; the gradient was kept.`
    )
  }
  return Object.keys(out).length ? (out as ElementStyle) : undefined
}

// ── One element's design ─────────────────────────────────────────────────

const STATES: Record<string, 'base' | 'tablet' | 'mobile' | 'hover'> = {
  base: 'base',
  default: 'base',
  desktop: 'base',
  all: 'base',
  normal: 'base',
  tablet: 'tablet',
  ipad: 'tablet',
  mobile: 'mobile',
  phone: 'mobile',
  hover: 'hover',
  onhover: 'hover',
}

const ANIMATION_SYNONYMS: Record<string, string> = {
  fadein: 'fade',
  appear: 'fade',
  fadeinup: 'fade-up',
  slideup: 'fade-up',
  slideinup: 'fade-up',
  fadeindown: 'fade-down',
  slidedown: 'fade-down',
  slideindown: 'fade-down',
  fadeinleft: 'fade-right',
  slideinleft: 'fade-right',
  fadeinright: 'fade-left',
  slideinright: 'fade-left',
  zoom: 'zoom-in',
  zoomin: 'zoom-in',
  scalein: 'zoom-in',
  zoomout: 'zoom-out',
  popin: 'zoom-in',
  riseup: 'rise',
}

function readEasing(value: unknown) {
  if (typeof value !== 'string') return undefined
  const key = squash(value)
  return EASINGS.find((easing) => squash(easing) === key)
}

function readTransition(
  value: unknown,
  path: string,
  notes: ElementNotes
): ElementTransition | undefined {
  let duration: number | undefined
  let easing: ElementTransition['easing']
  if (isRecord(value)) {
    duration = readMs(value.duration)
    easing = readEasing(value.easing ?? value.timing)
  } else if (typeof value === 'number' || typeof value === 'string') {
    // "all 200ms ease-out", or just "200ms".
    for (const token of String(value).split(/\s+/)) {
      duration ??= readMs(token)
      easing ??= readEasing(token)
    }
  }
  if (duration === undefined) {
    note(
      notes,
      'warning',
      `Ignored "${path}" — a transition needs { "duration": 200 } (milliseconds).`
    )
    return undefined
  }
  return {
    duration: Math.min(5000, Math.max(0, duration)),
    ...(easing && { easing }),
  }
}

function readAnimation(
  value: unknown,
  path: string,
  notes: ElementNotes
): ElementAnimation | undefined {
  const given = isRecord(value) ? value : { type: value }
  const raw = given.type ?? given.name
  const key = typeof raw === 'string' ? squash(raw) : ''
  const type =
    ANIMATION_TYPES.find((option) => squash(option) === key) ??
    (Object.hasOwn(ANIMATION_SYNONYMS, key)
      ? (ANIMATION_SYNONYMS[key] as ElementAnimation['type'])
      : undefined)
  if (!type) {
    note(
      notes,
      'warning',
      `Ignored "${path}" — an animation's "type" is one of ${ANIMATION_TYPES.join(', ')}.`
    )
    return undefined
  }
  const out: ElementAnimation = { type }
  const duration = readMs(given.duration)
  const delay = readMs(given.delay)
  const easing = readEasing(given.easing)
  if (duration !== undefined)
    out.duration = Math.min(5000, Math.max(0, duration))
  if (delay !== undefined) out.delay = Math.min(5000, Math.max(0, delay))
  if (easing) out.easing = easing
  return out
}

/**
 * One element's design. Written either as one style for every screen
 * (`{ "fontSize": 48 }`) or by state (`{ "base": …, "mobile": …, "hover": …,
 * "transition": …, "animation": … }`) — or both at once, where the loose
 * properties are the base and an explicit "base" wins over them.
 */
function readElementDesign(
  raw: unknown,
  path: string,
  notes: ElementNotes
): ElementDesign | undefined {
  if (!isRecord(raw)) {
    note(
      notes,
      'warning',
      `Ignored "${path}" — an element's design must be an object of styles.`
    )
    return undefined
  }
  const design: ElementDesign = {}
  const loose: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key === '__proto__' || value === null || value === undefined) continue
    const squashed = squash(key)
    const state = Object.hasOwn(STATES, squashed) ? STATES[squashed] : undefined
    if (state) {
      const style = readElementStyle(value, `${path}.${key}`, notes)
      if (style) design[state] = { ...design[state], ...style }
    } else if (squashed === 'transition') {
      const transition = readTransition(value, `${path}.${key}`, notes)
      if (transition) design.transition = transition
    } else if (['animation', 'animate', 'entrance'].includes(squashed)) {
      const animation = readAnimation(value, `${path}.${key}`, notes)
      if (animation) design.animation = animation
    } else {
      loose[key] = value
    }
  }
  if (Object.keys(loose).length > 0) {
    const style = readElementStyle(loose, path, notes)
    if (style) design.base = { ...style, ...design.base }
  }
  return Object.keys(design).length ? design : undefined
}

// ── Which element ────────────────────────────────────────────────────────

/**
 * The element a design's key means, in the stylesheet's own form: a block's
 * element (`title`), one item of a repeated one (`card#2`, from `card#2`,
 * `card[2]` or `card.2`), or an added element (`x:badge`).
 *
 * Read loosely, because the model is guessing from a list: "Headline" is the
 * element labelled Headline, and "ctaText" is the element that shows the
 * `ctaText` field.
 */
function resolveElementKey(
  raw: string,
  elements: ElementDescriptor[],
  extraIds: ReadonlySet<string> | null
): { key: string; note?: string } | { error: string } {
  const text = raw.trim()
  if (/^x:/i.test(text)) {
    const id = text.slice(2)
    if (!EXTRA_ID_RE.test(id))
      return { error: `"${cutText(text, 60)}" is not an added element's id.` }
    if (extraIds && !extraIds.has(id))
      return {
        error: `There is no added element "${cutText(id, 40)}" in this block's "extras".`,
      }
    return { key: extraKey(id) }
  }
  const instance = /^(.+?)(?:#|\[|\.)(\d+)\]?$/.exec(text)
  const name = instance ? instance[1]! : text
  const index = instance ? Number(instance[2]) : undefined

  const key = squash(name)
  const descriptor =
    elements.find((element) => element.key === name) ??
    elements.find((element) => squash(element.key) === key) ??
    elements.find((element) => squash(element.label) === key) ??
    elements.find(
      (element) =>
        element.contentField &&
        squash(element.contentField.replace(/\[\]/g, '')) === key
    )
  if (!descriptor) {
    let best: string | null = null
    let bestScore = Infinity
    for (const element of elements) {
      const score = distance(key, squash(element.key))
      if (score < bestScore) {
        bestScore = score
        best = element.key
      }
    }
    return {
      error: `This block has no element called "${cutText(name, 40)}".${bestScore <= 3 && best ? ` Did you mean "${best}"?` : ''}`,
    }
  }
  if (index === undefined) {
    return descriptor.key === name
      ? { key: descriptor.key }
      : {
          key: descriptor.key,
          note: `Read "${cutText(text, 40)}" as the "${descriptor.key}" element.`,
        }
  }
  if (!descriptor.repeated) {
    return {
      key: descriptor.key,
      note: `"${descriptor.key}" appears once in this block, so "${cutText(text, 40)}" styles it.`,
    }
  }
  if (index > MAX_INSTANCE)
    return { error: `"${cutText(text, 40)}" is past the last item.` }
  return { key: `${descriptor.key}#${index}` }
}

export interface ElementDesignResult {
  /** The designs the section's elements are given, keyed as the stylesheet keys them. */
  elements: ElementDesignMap
  /** Elements the design set to null: their styling is taken off. */
  cleared: string[]
}

/**
 * A section's `elements`: a design per element, laid over what the section
 * already has when it is a rewrite (see `restyleConfig` in style-keys.ts).
 *
 * `extraIds` is the section's added elements when the design listed them, so
 * a style for one that is not there is caught. Null when the design left the
 * list out: the section keeps the extras it has, which this cannot see, so an
 * `x:` key is taken on trust.
 */
export function normalizeElementDesign(
  raw: unknown,
  context: {
    definition: SectionDefinition
    extraIds: ReadonlySet<string> | null
    notes: ElementNotes
  }
): ElementDesignResult | undefined {
  const { definition, extraIds, notes } = context
  if (!isRecord(raw)) {
    note(
      notes,
      'warning',
      'Ignored "elements" — it must be an object keyed by element name, like { "title": { "fontSize": 48 } }.'
    )
    return undefined
  }
  if (definition.elements.length === 0 && !extraIds?.size) {
    note(
      notes,
      'warning',
      `Ignored "elements" — the ${definition.name.toLowerCase()} block has no elements to style. Style it with "style" instead.`
    )
    return undefined
  }
  const out: ElementDesignMap = {}
  const cleared: string[] = []
  let count = 0
  for (const [rawKey, value] of Object.entries(raw)) {
    if (rawKey === '__proto__') continue
    const resolved = resolveElementKey(rawKey, definition.elements, extraIds)
    if ('error' in resolved) {
      note(
        notes,
        'warning',
        `Ignored "elements.${cutText(rawKey, 40)}": ${resolved.error}`
      )
      continue
    }
    if (resolved.note) note(notes, 'info', resolved.note)
    if (!SAFE_KEY_RE.test(resolved.key)) continue
    if (value === null) {
      cleared.push(resolved.key)
      continue
    }
    if (count >= MAX_ELEMENT_KEYS) {
      note(
        notes,
        'warning',
        `Only the first ${MAX_ELEMENT_KEYS} element designs were used.`
      )
      break
    }
    const design = readElementDesign(value, `elements.${resolved.key}`, notes)
    if (!design) continue
    count += 1
    out[resolved.key] = mergeDesign(out[resolved.key], design)
  }
  return { elements: out, cleared }
}

/**
 * A raw element design split into its states, with loose properties moved
 * into `base` — so a patch written as one style (`{ "fontSize": 40 }`) lands
 * on the base of a design written by state, and is not outranked by it.
 */
function byState(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const loose: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key === '__proto__') continue
    const squashed = squash(key)
    const state = Object.hasOwn(STATES, squashed) ? STATES[squashed] : undefined
    if (state) out[state] = value
    else if (squashed === 'transition') out.transition = value
    else if (['animation', 'animate', 'entrance'].includes(squashed))
      out.animation = value
    else loose[key] = value
  }
  if (Object.keys(loose).length > 0) {
    out.base = isRecord(out.base) ? { ...loose, ...out.base } : loose
  }
  return out
}

/**
 * Element designs to send through the reader for a change to part of one
 * section (MCP's update_section): each element passed laid over the design it
 * has, state by state and property by property, where null takes an element,
 * a state or a property off. Elements not passed are not touched — the
 * caller keeps them, as `mergeElementConfig` does.
 */
export function patchElementDesigns(
  current: ElementDesignMap | null | undefined,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (key === '__proto__') continue
    const before =
      current && Object.hasOwn(current, key) ? current[key] : undefined
    if (value === null || !isRecord(value) || !isRecord(before)) {
      out[key] = value
      continue
    }
    const merged: Record<string, unknown> = byState(before)
    for (const [state, change] of Object.entries(byState(value))) {
      if (change === null) {
        delete merged[state]
      } else if (isRecord(change) && isRecord(merged[state])) {
        const properties = { ...(merged[state] as Record<string, unknown>) }
        for (const [name, setting] of Object.entries(change)) {
          if (setting === null) delete properties[name]
          else properties[name] = setting
        }
        // A state with nothing left in it is no state at all.
        if (Object.keys(properties).length > 0) merged[state] = properties
        else delete merged[state]
      } else {
        merged[state] = change
      }
    }
    // An element with nothing left is one whose design was taken off.
    out[key] = Object.keys(merged).length > 0 ? merged : null
  }
  return out
}

/**
 * Two sets of element designs as one, the second's laid over the first's
 * element by element and state by state — an added element's own `style`
 * under what `elements` says about it.
 */
export function combineElementDesigns(
  first: ElementDesignMap | undefined,
  second: ElementDesignMap | undefined
): ElementDesignMap {
  const out: ElementDesignMap = { ...first }
  for (const [key, design] of Object.entries(second ?? {})) {
    out[key] = mergeDesign(out[key], design)
  }
  return out
}

/** Two designs for one element, the second laid over the first state by state. */
function mergeDesign(
  first: ElementDesign | undefined,
  second: ElementDesign
): ElementDesign {
  if (!first) return second
  const out: ElementDesign = { ...first }
  for (const state of ['base', 'tablet', 'mobile', 'hover'] as const) {
    if (second[state]) out[state] = { ...first[state], ...second[state] }
  }
  if (second.transition) out.transition = second.transition
  if (second.animation) out.animation = second.animation
  return out
}

// ── Added elements ───────────────────────────────────────────────────────

const EXTRA_TYPE_SYNONYMS: Record<string, ExtraElementType> = {
  title: 'heading',
  headline: 'heading',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  subheading: 'heading',
  paragraph: 'text',
  p: 'text',
  richtext: 'text',
  label: 'text',
  badge: 'text',
  tag: 'text',
  pill: 'text',
  note: 'text',
  caption: 'text',
  link: 'button',
  cta: 'button',
  a: 'button',
  img: 'image',
  picture: 'image',
  photo: 'image',
  logo: 'image',
  hr: 'divider',
  line: 'divider',
  separator: 'divider',
  rule: 'divider',
  space: 'spacer',
  gap: 'spacer',
  emoji: 'text',
}

const ICON_SYNONYMS: Record<string, (typeof ICON_NAMES)[number]> = {
  delivery: 'truck',
  shipping: 'truck',
  van: 'truck',
  box: 'package',
  parcel: 'package',
  guarantee: 'shield-check',
  warranty: 'shield-check',
  safe: 'shield-check',
  secure: 'lock',
  security: 'lock',
  fast: 'zap',
  lightning: 'zap',
  bolt: 'zap',
  fire: 'flame',
  hot: 'flame',
  love: 'heart',
  like: 'thumbs-up',
  cash: 'credit-card',
  money: 'credit-card',
  payment: 'credit-card',
  card: 'credit-card',
  call: 'phone',
  telephone: 'phone',
  email: 'mail',
  envelope: 'mail',
  location: 'map-pin',
  address: 'map-pin',
  pin: 'map-pin',
  discount: 'percent',
  offer: 'percent',
  sale: 'tag',
  price: 'tag',
  return: 'refresh-cw',
  returns: 'refresh-cw',
  exchange: 'refresh-cw',
  refresh: 'refresh-cw',
  quality: 'award',
  badge: 'award',
  medal: 'award',
  verified: 'check-circle',
  tick: 'check',
  checkmark: 'check',
  chat: 'message-circle',
  message: 'message-circle',
  whatsapp: 'message-circle',
  customers: 'users',
  people: 'users',
  time: 'clock',
  timer: 'clock',
  growth: 'trending-up',
  trending: 'trending-up',
  magic: 'sparkles',
  sparkle: 'sparkles',
  new: 'sparkles',
  arrow: 'arrow-right',
  next: 'chevron-right',
  warning: 'alert-circle',
  alert: 'alert-circle',
  present: 'gift',
}

function readIcon(value: unknown): (typeof ICON_NAMES)[number] | undefined {
  if (typeof value !== 'string') return undefined
  const key = squash(value)
  return (
    ICON_NAMES.find((icon) => squash(icon) === key) ??
    (Object.hasOwn(ICON_SYNONYMS, key) ? ICON_SYNONYMS[key] : undefined)
  )
}

function firstText(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string') return value
    if (typeof value === 'number') return String(value)
  }
  return undefined
}

export interface ExtrasResult {
  extras: ExtraElement[]
  /** Styles written on the added elements themselves, keyed `x:<id>`. */
  styles: ElementDesignMap
}

/**
 * A section's `extras`: headings, text, buttons, pictures, icons, dividers and
 * spacers the design adds to the block, beyond what the block draws itself.
 *
 * The list is the section's whole list — the export sends every one, so one
 * an edit leaves out was taken off. Each may carry its own `style`, read as
 * that element's design so a model never has to invent an id to style it.
 */
export function normalizeExtras(
  raw: unknown,
  context: {
    definition: SectionDefinition
    kind: SiteKind
    notes: ElementNotes
  }
): ExtrasResult | undefined {
  const { definition, kind, notes } = context
  const slots = definition.slots ?? []
  if (slots.length === 0) {
    note(
      notes,
      'warning',
      `Ignored "extras" — the ${definition.name.toLowerCase()} block has no place to add elements.`
    )
    return undefined
  }
  let list: unknown[]
  if (Array.isArray(raw)) list = raw
  else if (isRecord(raw)) list = [raw]
  else {
    note(notes, 'warning', 'Ignored "extras" — it must be a list of elements.')
    return undefined
  }
  if (list.length > MAX_EXTRAS) {
    note(
      notes,
      'warning',
      `Only the first ${MAX_EXTRAS} added elements were used — the design had ${list.length}.`
    )
    list = list.slice(0, MAX_EXTRAS)
  }

  const extras: ExtraElement[] = []
  const styles: ElementDesignMap = {}
  const used = new Set<string>()
  list.forEach((entry, index) => {
    const at = `extras[${index + 1}]`
    const item: Record<string, unknown> =
      typeof entry === 'string'
        ? { type: 'text', html: entry }
        : isRecord(entry)
          ? entry
          : {}
    const typeKey = typeof item.type === 'string' ? squash(item.type) : ''
    const type =
      EXTRA_ELEMENT_TYPES.find((option) => option === typeKey) ??
      (Object.hasOwn(EXTRA_TYPE_SYNONYMS, typeKey)
        ? EXTRA_TYPE_SYNONYMS[typeKey]
        : undefined)
    if (!type) {
      note(
        notes,
        'warning',
        `Left out ${at} — its "type" must be one of ${EXTRA_ELEMENT_TYPES.join(', ')}.`
      )
      return
    }

    // The builder's own ids are UUIDs, which this takes too.
    let id = typeof item.id === 'string' ? item.id.trim() : ''
    if (!EXTRA_ID_RE.test(id)) id = ''
    if (!id || used.has(id)) {
      let n = index + 1
      while (used.has(`${type}-${n}`)) n += 1
      id = `${type}-${n}`
    }
    used.add(id)

    const slotKey =
      typeof item.slot === 'string'
        ? slots.find(
            (slot) =>
              slot.key === item.slot ||
              squash(slot.label) === squash(String(item.slot))
          )?.key
        : undefined
    if (item.slot !== undefined && !slotKey) {
      note(
        notes,
        'info',
        `Put ${at} in "${slots[0]!.key}" — the block's places for added elements are ${slots.map((slot) => `"${slot.key}"`).join(', ')}.`
      )
    }

    const html = firstText(item, ['html', 'text', 'content', 'label', 'title'])
    const href = firstText(item, ['href', 'link', 'url', 'to'])
    const src = firstText(item, ['src', 'image', 'url', 'imageUrl'])
    const icon = item.icon ?? item.name
    const extra: Record<string, unknown> = {
      id,
      type,
      slot: slotKey ?? slots[0]!.key,
      html: cutText(wellFormed(html ?? ''), 5000),
      // A button with nowhere to go goes where the page sells: a landing
      // page's order form, a store's products.
      href:
        type === 'button' && href
          ? cutText(href.trim(), 500)
          : kind === 'STORE'
            ? '/products'
            : '#order',
      alt: cutText(wellFormed(firstText(item, ['alt']) ?? ''), 300),
    }
    if (type === 'image') {
      const url = readUrl(src)
      if (src && !url) {
        note(
          notes,
          'warning',
          `${at}'s picture was left empty — it needs an https:// address.`
        )
      }
      extra.src = url ?? ''
    }
    if (type === 'icon') {
      const name = readIcon(icon)
      if (!name) {
        note(
          notes,
          'warning',
          `${at} shows a star — "icon" must be one of: ${ICON_NAMES.join(', ')}.`
        )
      }
      extra.icon = name ?? 'star'
    }
    const parsed = extraElementSchema.safeParse(extra)
    if (!parsed.success) {
      note(notes, 'warning', `Left out ${at} — it could not be used.`)
      return
    }
    extras.push(parsed.data)

    if (item.style !== undefined && item.style !== null) {
      const design = readElementDesign(item.style, `${at}.style`, notes)
      if (design) styles[extraKey(id)] = design
    }
  })
  return { extras, styles }
}

// ── For the guide ────────────────────────────────────────────────────────

function describe(name: PropertyName): string {
  const spec: PropertySpec = PROPERTIES[name]
  switch (spec.type) {
    case 'px':
      return `${name} ${spec.min}–${spec.max}`
    case 'number':
      return `${name} ${spec.min}–${spec.max}${spec.unit ? ` (${spec.unit})` : ''}`
    case 'choice':
      return `${name} ${spec.options.join('|')}`
    case 'color':
      return `${name} (colour)`
    case 'length':
      return `${name} (length)`
    case 'sides':
      return `${name} (sides)`
    case 'corners':
      return `${name} (corners)`
    case 'shadow':
      return `${name} (shadow)`
    case 'gradient':
      return `${name} { angle, from, to }`
    case 'font':
      return `${name} (font name)`
    case 'url':
      return `${name} (https:// image)`
    case 'flag':
      return `${name} true (hide it on that screen size)`
    case 'ratio':
      return `${name} "16 / 9"`
  }
}

/** Every property an element takes, grouped, one line per group. */
export function elementPropertyLines(): string[] {
  return PROPERTY_GROUPS.map(
    ([label, names]) => `- ${label}: ${names.map(describe).join(', ')}`
  )
}

/** The words a guide uses for one block's elements and its places for extras. */
export function blockElementText(definition: {
  elements: ElementDescriptor[]
  slots?: { key: string; label: string }[]
}): string[] {
  const lines: string[] = []
  if (definition.elements.length > 0) {
    const parts = definition.elements.map((element) => {
      const name = `${element.key}${element.repeated ? '[]' : ''}`
      const label =
        squash(element.label) === squash(element.key)
          ? ''
          : ` "${element.label}"`
      return `${name}${label} (${element.kind})`
    })
    lines.push(`Elements: ${parts.join(', ')}`)
  }
  if (definition.slots?.length) {
    lines.push(
      `Extras go in: ${definition.slots.map((slot) => `"${slot.key}"${squash(slot.key) === squash(slot.label) ? '' : ` (${slot.label})`}`).join(', ')}`
    )
  }
  return lines
}
