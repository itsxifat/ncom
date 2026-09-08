import { fontStack } from '@/lib/fonts'

/**
 * The per-element design layer.
 *
 * `SectionConfig` styles the section *wrapper* — one background, one padding,
 * one text colour for the whole block. This file is the layer below it: every
 * individual thing a block draws (a headline, a button, one card in a grid) can
 * carry its own type, colour, spacing, border, effects and position.
 *
 * Three rules hold the whole design together, and breaking any of them breaks
 * either old pages or the theme:
 *
 * 1. **Unset means inherit.** Every property is optional at every breakpoint.
 *    A property nobody set never reaches the stylesheet at all, so the block's
 *    own Tailwind classes and the page theme keep painting it. This is what
 *    makes the feature safe to ship onto pages that already exist, and what
 *    makes "reset" a delete rather than a write.
 *
 * 2. **Nothing here is CSS text.** Values are numbers, enum members, and
 *    strings matched against a closed grammar (`isLength`, `isColor`). The
 *    generated stylesheet is assembled from those validated pieces, so a style
 *    blob — which arrives as untrusted JSON from the database — cannot smuggle
 *    a declaration, a selector, or a `</style>` into the page. Anything that
 *    fails validation is dropped, never passed through.
 *
 * 3. **Styles are emitted as a real stylesheet, not inline styles.** Per-
 *    breakpoint overrides have to be media queries: the published page is
 *    server-rendered and a phone must get the phone values in the first paint,
 *    with no JS and no layout flash. Inline styles cannot express that.
 */

// ── Breakpoints ───────────────────────────────────────────────────────

/**
 * `base` is the desktop value and the one everything falls back to; `tablet`
 * and `mobile` are max-width overrides layered on top in that order, so a value
 * set at tablet also applies on mobile unless mobile overrides it again. That
 * cascade is the point — a merchant who shrinks a headline for tablet should
 * not have to shrink it twice.
 */
export type StyleBreakpoint = 'base' | 'tablet' | 'mobile'

export const STYLE_BREAKPOINTS: StyleBreakpoint[] = ['base', 'tablet', 'mobile']

/**
 * Chosen to match the canvas device frames in `Canvas.tsx` (1440 / 768 / 375)
 * and Tailwind's own `sm` boundary, so a block's built-in `sm:` classes and a
 * merchant's mobile overrides switch at the same width. If these drift, a page
 * gets its mobile type sizes while still in its desktop layout.
 */
const MEDIA_QUERY: Record<StyleBreakpoint, string | null> = {
  base: null,
  tablet: '(max-width: 1023.98px)',
  mobile: '(max-width: 639.98px)',
}

// ── Value shapes ──────────────────────────────────────────────────────

export interface Sides {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export interface Corners {
  topLeft?: number
  topRight?: number
  bottomRight?: number
  bottomLeft?: number
}

export interface Shadow {
  x?: number
  y?: number
  blur?: number
  spread?: number
  color?: string
  inset?: boolean
}

export interface Gradient {
  angle?: number
  from?: string
  to?: string
}

export type Easing = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out'

export const EASINGS: Easing[] = [
  'ease-out',
  'ease',
  'ease-in',
  'ease-in-out',
  'linear',
]

export type AnimationType =
  | 'none'
  | 'fade'
  | 'fade-up'
  | 'fade-down'
  | 'fade-left'
  | 'fade-right'
  | 'zoom-in'
  | 'zoom-out'
  | 'rise'

export const ANIMATION_TYPES: AnimationType[] = [
  'none',
  'fade',
  'fade-up',
  'fade-down',
  'fade-left',
  'fade-right',
  'zoom-in',
  'zoom-out',
  'rise',
]

/**
 * Everything one element can be told to look like at one breakpoint.
 *
 * Flat on purpose. A nested shape reads better in a type but every control in
 * the inspector, every clipboard copy and every "is this property set?" check
 * would have to walk it, and the panel is built by mapping over property
 * descriptors — which only works if a property is one key.
 */
export interface ElementStyle {
  // ── Typography ──────────────────────────────────────────────────────
  /** A family name from `lib/fonts.ts`, resolved to a stack at render time. */
  fontFamily?: string
  /** px. */
  fontSize?: number
  fontWeight?: number
  fontStyle?: 'normal' | 'italic'
  /** Unitless multiplier, so it tracks whatever the font size ends up being. */
  lineHeight?: number
  /** px, may be negative. */
  letterSpacing?: number
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  textDecoration?: 'none' | 'underline' | 'line-through'
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  color?: string
  textShadow?: Shadow
  /** Clamps the element to N lines with an ellipsis. */
  lineClamp?: number

  // ── Fill ────────────────────────────────────────────────────────────
  backgroundColor?: string
  gradient?: Gradient
  backgroundImageUrl?: string
  backgroundSize?: 'cover' | 'contain' | 'auto'
  backgroundPosition?: 'center' | 'top' | 'bottom' | 'left' | 'right'
  /** 0–100. */
  opacity?: number

  // ── Box ─────────────────────────────────────────────────────────────
  /** px per side. Sides are independent so setting one never implies another. */
  padding?: Sides
  margin?: Sides
  /** A length: `240px`, `50%`, `20rem`, `100vw`, or `auto`. */
  width?: string
  minWidth?: string
  maxWidth?: string
  height?: string
  minHeight?: string
  maxHeight?: string

  // ── Border ──────────────────────────────────────────────────────────
  borderWidth?: Sides
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'double'
  borderColor?: string
  borderRadius?: Corners
  boxShadow?: Shadow

  // ── Filters ─────────────────────────────────────────────────────────
  /** px. */
  blur?: number
  /** Percentages, 100 being unchanged. */
  brightness?: number
  contrast?: number
  saturate?: number
  /** 0–100. */
  grayscale?: number

  // ── Transform ───────────────────────────────────────────────────────
  /** deg. */
  rotate?: number
  /** Percent, 100 being unscaled. */
  scale?: number
  /** px nudges. The keyboard-and-mouse way to move something a hair. */
  offsetX?: number
  offsetY?: number

  // ── Position ────────────────────────────────────────────────────────
  /**
   * `absolute` is the free-position escape hatch: the element leaves the
   * block's responsive flow and sits wherever it was dragged, inside its
   * nearest positioned ancestor. Everything else on the page keeps flowing, so
   * a merchant takes the responsive risk only on the elements they opt in.
   */
  position?: 'flow' | 'absolute'
  top?: string
  right?: string
  bottom?: string
  left?: string
  zIndex?: number

  // ── Layout ──────────────────────────────────────────────────────────
  display?: 'block' | 'inline-block' | 'flex' | 'inline-flex' | 'grid' | 'none'
  flexDirection?: 'row' | 'row-reverse' | 'column' | 'column-reverse'
  flexWrap?: 'nowrap' | 'wrap'
  justifyContent?:
    'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around'
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline'
  alignSelf?: 'auto' | 'flex-start' | 'center' | 'flex-end' | 'stretch'
  /** px. */
  gap?: number
  /** Reorders this element among its siblings without touching the others. */
  order?: number
  /** Columns, for elements that lay their children out in a grid. */
  gridColumns?: number

  // ── Media ───────────────────────────────────────────────────────────
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down'
  objectPosition?: 'center' | 'top' | 'bottom' | 'left' | 'right'
  aspectRatio?: string

  overflow?: 'visible' | 'hidden' | 'auto'
  /** Hides the element at this breakpoint only. */
  hidden?: boolean
}

export interface ElementTransition {
  /** ms. */
  duration?: number
  easing?: Easing
}

export interface ElementAnimation {
  type?: AnimationType
  /** ms. */
  duration?: number
  delay?: number
  easing?: Easing
}

/**
 * One element's complete design: the responsive style stack, a hover state, a
 * transition, and an entrance animation.
 *
 * `hover` is deliberately not per-breakpoint. Hover does not exist on a
 * touchscreen, so a phone-specific hover state would be a control that can
 * never fire — and the CSS is emitted behind `(hover: hover)` for the same
 * reason: a tap on a phone must not leave a button stuck in its hover colour.
 */
export interface ElementDesign {
  base?: ElementStyle
  tablet?: ElementStyle
  mobile?: ElementStyle
  hover?: ElementStyle
  transition?: ElementTransition
  animation?: ElementAnimation
}

/** Keyed by element key — see `elements.tsx` for what a key addresses. */
export type ElementDesignMap = Record<string, ElementDesign>

// ── Validation ────────────────────────────────────────────────────────

/**
 * The grammars below are the security boundary described at the top of this
 * file. They are allow-lists: a value that does not match is dropped, and there
 * is no path by which an unmatched value reaches the stylesheet.
 */

const LENGTH_RE = /^-?\d{1,5}(\.\d{1,3})?(px|%|rem|em|vw|vh)$/
const COLOR_RE =
  /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.]+(\s*[,/]\s*|\s+)[\d.%]+(\s*[,/]\s*|\s+)[\d.%]+(\s*[,/]\s*[\d.%]+)?\s*\)|hsla?\(\s*[\d.]+(deg)?(\s*[,/]\s*|\s+)[\d.]+%(\s*[,/]\s*|\s+)[\d.]+%(\s*[,/]\s*[\d.%]+)?\s*\)|transparent|currentColor|var\(--[a-zA-Z0-9-]{1,60}\))$/
const RATIO_RE = /^\d{1,4}(\.\d{1,3})?\s*\/\s*\d{1,4}(\.\d{1,3})?$/

/** A CSS length in a unit this editor emits, or `auto`. */
export function isLength(value: unknown): value is string {
  return (
    typeof value === 'string' && (value === 'auto' || LENGTH_RE.test(value))
  )
}

export function isColor(value: unknown): value is string {
  return typeof value === 'string' && COLOR_RE.test(value)
}

function len(value: unknown): string | undefined {
  return isLength(value) ? value : undefined
}

function color(value: unknown): string | undefined {
  return isColor(value) ? value : undefined
}

function num(
  value: unknown,
  min: number,
  max: number,
  fallback?: number
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | undefined {
  return typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined
}

/** A shadow, or undefined if it has nothing to draw. */
function shadow(value: Shadow | undefined, inset = true): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const x = num(value.x, -200, 200, 0)!
  const y = num(value.y, -200, 200, 0)!
  const blur = num(value.blur, 0, 400, 0)!
  const spread = num(value.spread, -200, 200, 0)!
  const paint = color(value.color) ?? 'rgba(0,0,0,0.25)'
  // A shadow with no offset, no blur and no spread paints nothing; emitting it
  // would still cost a repaint and would make "is this set?" answer yes for a
  // control the merchant has effectively cleared.
  if (!x && !y && !blur && !spread) return undefined
  const prefix = inset && value.inset ? 'inset ' : ''
  return `${prefix}${x}px ${y}px ${blur}px ${spread}px ${paint}`
}

// ── Declarations ──────────────────────────────────────────────────────

type Decl = [property: string, value: string]

function sideDecls(
  prefix: string,
  suffix: string,
  sides: Sides | undefined,
  out: Decl[]
) {
  if (!sides || typeof sides !== 'object') return
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const value = num(sides[side], -999, 9999)
    if (value !== undefined)
      out.push([`${prefix}-${side}${suffix}`, `${value}px`])
  }
}

/**
 * One `ElementStyle` as CSS declarations.
 *
 * Every branch is "was this set?" rather than "what is this, with a default" —
 * an unset property must produce no declaration at all, or rule 1 at the top of
 * this file breaks and every styled element detaches from the theme.
 */
export function styleDeclarations(style: ElementStyle | undefined): Decl[] {
  if (!style || typeof style !== 'object') return []
  const out: Decl[] = []

  // Typography
  if (style.fontFamily) out.push(['font-family', fontStack(style.fontFamily)])
  const fontSize = num(style.fontSize, 1, 400)
  if (fontSize !== undefined) out.push(['font-size', `${fontSize}px`])
  const fontWeight = num(style.fontWeight, 100, 900)
  if (fontWeight !== undefined)
    out.push(['font-weight', String(Math.round(fontWeight / 100) * 100)])
  const fontStyle = pick(style.fontStyle, ['normal', 'italic'] as const)
  if (fontStyle) out.push(['font-style', fontStyle])
  const lineHeight = num(style.lineHeight, 0.5, 4)
  if (lineHeight !== undefined) out.push(['line-height', String(lineHeight)])
  const letterSpacing = num(style.letterSpacing, -20, 60)
  if (letterSpacing !== undefined)
    out.push(['letter-spacing', `${letterSpacing}px`])
  const textTransform = pick(style.textTransform, [
    'none',
    'uppercase',
    'lowercase',
    'capitalize',
  ] as const)
  if (textTransform) out.push(['text-transform', textTransform])
  const textDecoration = pick(style.textDecoration, [
    'none',
    'underline',
    'line-through',
  ] as const)
  if (textDecoration) out.push(['text-decoration-line', textDecoration])
  const textAlign = pick(style.textAlign, [
    'left',
    'center',
    'right',
    'justify',
  ] as const)
  if (textAlign) out.push(['text-align', textAlign])
  const textColor = color(style.color)
  if (textColor) out.push(['color', textColor])
  const textShadow = shadow(style.textShadow, false)
  if (textShadow) out.push(['text-shadow', textShadow])
  const lineClamp = num(style.lineClamp, 1, 20)
  if (lineClamp !== undefined) {
    out.push(['display', '-webkit-box'])
    out.push(['-webkit-box-orient', 'vertical'])
    out.push(['-webkit-line-clamp', String(Math.round(lineClamp))])
    out.push(['overflow', 'hidden'])
  }

  // Fill
  const backgroundColor = color(style.backgroundColor)
  if (backgroundColor) out.push(['background-color', backgroundColor])
  if (style.gradient) {
    const from = color(style.gradient.from)
    const to = color(style.gradient.to)
    if (from && to) {
      const angle = num(style.gradient.angle, 0, 360, 180)!
      out.push([
        'background-image',
        `linear-gradient(${angle}deg, ${from}, ${to})`,
      ])
    }
  }
  if (
    typeof style.backgroundImageUrl === 'string' &&
    style.backgroundImageUrl
  ) {
    const url = safeUrl(style.backgroundImageUrl)
    // A gradient already claimed `background-image`; a URL on top of it would
    // silently replace it, so the gradient wins and the image is skipped.
    if (url && !style.gradient) {
      out.push(['background-image', `url("${url}")`])
      out.push([
        'background-size',
        pick(style.backgroundSize, ['cover', 'contain', 'auto'] as const) ??
          'cover',
      ])
      out.push([
        'background-position',
        pick(style.backgroundPosition, [
          'center',
          'top',
          'bottom',
          'left',
          'right',
        ] as const) ?? 'center',
      ])
      out.push(['background-repeat', 'no-repeat'])
    }
  }
  const opacity = num(style.opacity, 0, 100)
  if (opacity !== undefined) out.push(['opacity', String(opacity / 100)])

  // Box
  sideDecls('padding', '', style.padding, out)
  sideDecls('margin', '', style.margin, out)
  const width = len(style.width)
  if (width) out.push(['width', width])
  const minWidth = len(style.minWidth)
  if (minWidth) out.push(['min-width', minWidth])
  const maxWidth = len(style.maxWidth)
  if (maxWidth) out.push(['max-width', maxWidth])
  const height = len(style.height)
  if (height) out.push(['height', height])
  const minHeight = len(style.minHeight)
  if (minHeight) out.push(['min-height', minHeight])
  const maxHeight = len(style.maxHeight)
  if (maxHeight) out.push(['max-height', maxHeight])

  // Border
  const hasBorderWidth =
    style.borderWidth &&
    (['top', 'right', 'bottom', 'left'] as const).some(
      (side) => num(style.borderWidth?.[side], 0, 200) !== undefined
    )
  sideDecls('border', '-width', style.borderWidth, out)
  if (hasBorderWidth) {
    out.push([
      'border-style',
      pick(style.borderStyle, [
        'solid',
        'dashed',
        'dotted',
        'double',
      ] as const) ?? 'solid',
    ])
    out.push(['border-color', color(style.borderColor) ?? 'currentColor'])
  }
  if (style.borderRadius && typeof style.borderRadius === 'object') {
    const corners = [
      ['border-top-left-radius', style.borderRadius.topLeft],
      ['border-top-right-radius', style.borderRadius.topRight],
      ['border-bottom-right-radius', style.borderRadius.bottomRight],
      ['border-bottom-left-radius', style.borderRadius.bottomLeft],
    ] as const
    for (const [property, raw] of corners) {
      const value = num(raw, 0, 9999)
      if (value !== undefined) out.push([property, `${value}px`])
    }
  }
  const boxShadow = shadow(style.boxShadow)
  if (boxShadow) out.push(['box-shadow', boxShadow])

  // Filters
  const filters: string[] = []
  const blur = num(style.blur, 0, 100)
  if (blur) filters.push(`blur(${blur}px)`)
  const brightness = num(style.brightness, 0, 300)
  if (brightness !== undefined && brightness !== 100)
    filters.push(`brightness(${brightness}%)`)
  const contrast = num(style.contrast, 0, 300)
  if (contrast !== undefined && contrast !== 100)
    filters.push(`contrast(${contrast}%)`)
  const saturate = num(style.saturate, 0, 300)
  if (saturate !== undefined && saturate !== 100)
    filters.push(`saturate(${saturate}%)`)
  const grayscale = num(style.grayscale, 0, 100)
  if (grayscale) filters.push(`grayscale(${grayscale}%)`)
  if (filters.length) out.push(['filter', filters.join(' ')])

  // Transform. Composed into one declaration because `transform` is a single
  // property — emitting rotate and scale separately would mean the second
  // silently discarded the first.
  const transforms: string[] = []
  const offsetX = num(style.offsetX, -4000, 4000)
  const offsetY = num(style.offsetY, -4000, 4000)
  if (offsetX || offsetY)
    transforms.push(`translate(${offsetX ?? 0}px, ${offsetY ?? 0}px)`)
  const rotate = num(style.rotate, -360, 360)
  if (rotate) transforms.push(`rotate(${rotate}deg)`)
  const scale = num(style.scale, 1, 500)
  if (scale !== undefined && scale !== 100)
    transforms.push(`scale(${scale / 100})`)
  if (transforms.length) out.push(['transform', transforms.join(' ')])

  // Position
  if (style.position === 'absolute') out.push(['position', 'absolute'])
  for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
    const value = len(style[edge])
    if (value) out.push([edge, value])
  }
  const zIndex = num(style.zIndex, -100, 9999)
  if (zIndex !== undefined) out.push(['z-index', String(Math.round(zIndex))])

  // Layout
  const display = pick(style.display, [
    'block',
    'inline-block',
    'flex',
    'inline-flex',
    'grid',
    'none',
  ] as const)
  if (display && lineClamp === undefined) out.push(['display', display])
  const flexDirection = pick(style.flexDirection, [
    'row',
    'row-reverse',
    'column',
    'column-reverse',
  ] as const)
  if (flexDirection) out.push(['flex-direction', flexDirection])
  const flexWrap = pick(style.flexWrap, ['nowrap', 'wrap'] as const)
  if (flexWrap) out.push(['flex-wrap', flexWrap])
  const justifyContent = pick(style.justifyContent, [
    'flex-start',
    'center',
    'flex-end',
    'space-between',
    'space-around',
  ] as const)
  if (justifyContent) out.push(['justify-content', justifyContent])
  const alignItems = pick(style.alignItems, [
    'flex-start',
    'center',
    'flex-end',
    'stretch',
    'baseline',
  ] as const)
  if (alignItems) out.push(['align-items', alignItems])
  const alignSelf = pick(style.alignSelf, [
    'auto',
    'flex-start',
    'center',
    'flex-end',
    'stretch',
  ] as const)
  if (alignSelf) out.push(['align-self', alignSelf])
  const gap = num(style.gap, 0, 400)
  if (gap !== undefined) out.push(['gap', `${gap}px`])
  const order = num(style.order, -50, 50)
  if (order !== undefined) out.push(['order', String(Math.round(order))])
  const gridColumns = num(style.gridColumns, 1, 12)
  if (gridColumns !== undefined) {
    out.push(['display', 'grid'])
    out.push([
      'grid-template-columns',
      `repeat(${Math.round(gridColumns)}, minmax(0, 1fr))`,
    ])
  }

  // Media
  const objectFit = pick(style.objectFit, [
    'cover',
    'contain',
    'fill',
    'none',
    'scale-down',
  ] as const)
  if (objectFit) out.push(['object-fit', objectFit])
  const objectPosition = pick(style.objectPosition, [
    'center',
    'top',
    'bottom',
    'left',
    'right',
  ] as const)
  if (objectPosition) out.push(['object-position', objectPosition])
  if (typeof style.aspectRatio === 'string' && RATIO_RE.test(style.aspectRatio))
    out.push(['aspect-ratio', style.aspectRatio])

  const overflow = pick(style.overflow, ['visible', 'hidden', 'auto'] as const)
  if (overflow && lineClamp === undefined) out.push(['overflow', overflow])

  // Last, so it beats a `display` set anywhere above it. "Hidden" is an
  // instruction, not a suggestion — a merchant who hides something on mobile
  // must not have it reappear because the element also has a display override.
  if (style.hidden === true) out.push(['display', 'none'])

  return out
}

/**
 * A URL safe to put in `url()`.
 *
 * Only http(s) and root-relative paths — the scheme allow-list is what stops a
 * `javascript:` or `data:` URL from riding in through an image field, and the
 * quote/paren strip is what stops a crafted filename from closing the `url("…")`
 * and starting a new declaration.
 */
function safeUrl(raw: string): string | undefined {
  const value = raw.trim()
  if (!/^(https?:\/\/|\/)[^\s"'()\\]+$/.test(value)) return undefined
  return value
}

// ── Stylesheet ────────────────────────────────────────────────────────

/**
 * Section ids reach this file from the database and from the builder's
 * `temp-<uuid>` ids. They land in a selector, so anything that is not a plain
 * identifier is refused rather than escaped: there is no legitimate id with a
 * quote or a brace in it, and refusing is one rule to audit instead of an
 * escaping routine to get right.
 */
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
/** Element keys add `.` for nesting, `:` for extras and `#` for one instance. */
const SAFE_KEY_RE = /^[A-Za-z0-9_.:#-]{1,80}$/

function declBlock(decls: Decl[]): string {
  return decls.map(([property, value]) => `${property}:${value}`).join(';')
}

/**
 * The selector for one element inside one section.
 *
 * Two attribute selectors, which outweighs the single-class specificity of the
 * Tailwind utilities a block paints itself with — so a merchant's choice wins
 * over the block's default without a single `!important` anywhere.
 */
function selectorFor(sectionId: string, key: string): string | null {
  if (!SAFE_ID_RE.test(sectionId) || !SAFE_KEY_RE.test(key)) return null
  // `key#3` addresses one item of a repeated element; the part before the hash
  // is the shared key every instance carries in the DOM.
  const [base, index] = key.split('#')
  if (!base) return null
  const scope = `[data-section-id="${sectionId}"]`
  return index === undefined
    ? `${scope} [data-el="${base}"]`
    : `${scope} [data-el="${base}"][data-el-i="${index}"]`
}

interface Rule {
  selector: string
  decls: Decl[]
}

/**
 * The complete stylesheet for a page's per-element design.
 *
 * Emitted once, at the top of the rendered page, rather than as a `<style>` per
 * section: one sheet keeps every rule in a single cascade the browser sorts
 * once, and — more importantly — keeps the three media-query blocks contiguous,
 * so tablet rules cannot end up after mobile rules and win on a phone.
 */
export function buildElementStylesheet(
  sections: { id: string; elements?: ElementDesignMap | null }[]
): string {
  const byBreakpoint: Record<StyleBreakpoint, Rule[]> = {
    base: [],
    tablet: [],
    mobile: [],
  }
  const hoverRules: Rule[] = []
  const animated: string[] = []

  for (const section of sections) {
    const elements = section.elements
    if (!elements || typeof elements !== 'object') continue

    for (const [key, design] of Object.entries(elements)) {
      if (!design || typeof design !== 'object') continue
      const selector = selectorFor(section.id, key)
      if (!selector) continue

      for (const breakpoint of STYLE_BREAKPOINTS) {
        const decls = styleDeclarations(design[breakpoint])
        // A transition belongs with the base rule: it describes how this
        // element moves between states, and re-declaring it per breakpoint
        // would restart it mid-interaction on a resize.
        if (breakpoint === 'base') {
          const duration = num(design.transition?.duration, 0, 5000)
          if (duration) {
            const easing =
              pick(design.transition?.easing, EASINGS) ?? 'ease-out'
            decls.push([
              'transition',
              `all ${Math.round(duration)}ms ${easing}`,
            ])
          }
          const animation = design.animation
          const type = pick(animation?.type, ANIMATION_TYPES)
          if (type && type !== 'none') {
            animated.push(selector)
            decls.push(['--ncom-anim-name', `ncom-${type}`])
            decls.push([
              '--ncom-anim-duration',
              `${num(animation?.duration, 0, 5000) ?? 600}ms`,
            ])
            decls.push([
              '--ncom-anim-delay',
              `${num(animation?.delay, 0, 5000) ?? 0}ms`,
            ])
            decls.push([
              '--ncom-anim-easing',
              pick(animation?.easing, EASINGS) ?? 'ease-out',
            ])
          }
        }
        if (decls.length) byBreakpoint[breakpoint].push({ selector, decls })
      }

      const hover = styleDeclarations(design.hover)
      if (hover.length) hoverRules.push({ selector, decls: hover })
    }
  }

  const parts: string[] = []

  for (const rule of byBreakpoint.base) {
    parts.push(`${rule.selector}{${declBlock(rule.decls)}}`)
  }

  if (hoverRules.length) {
    // Behind `(hover: hover)` so a tap on a phone cannot leave an element stuck
    // in its hover state until the next tap elsewhere.
    const body = hoverRules
      .map((rule) => `${rule.selector}:hover{${declBlock(rule.decls)}}`)
      .join('')
    parts.push(`@media (hover: hover){${body}}`)
  }

  for (const breakpoint of ['tablet', 'mobile'] as const) {
    const rules = byBreakpoint[breakpoint]
    if (!rules.length) continue
    const body = rules
      .map((rule) => `${rule.selector}{${declBlock(rule.decls)}}`)
      .join('')
    parts.push(`@media ${MEDIA_QUERY[breakpoint]}{${body}}`)
  }

  if (animated.length) {
    // Grouped rather than one rule per element: the browser matches a selector
    // list in one pass, and it keeps the sheet from growing a paragraph per
    // animated headline on a long page.
    const hidden = animated
      .map((s) => `.ncom-anim ${s}:not(.ncom-in)`)
      .join(',')
    const shown = animated.map((s) => `${s}.ncom-in`).join(',')
    parts.push(ANIMATION_KEYFRAMES)
    // The start state is gated on `.ncom-anim`, which only the client observer
    // adds. Without JS the class never appears, nothing is ever hidden, and the
    // page reads exactly as it would have — a merchant's decoration must never
    // be able to make their own copy invisible.
    parts.push(`${hidden}{opacity:0}`)
    parts.push(
      `${shown}{animation:var(--ncom-anim-name) var(--ncom-anim-duration,600ms) var(--ncom-anim-easing,ease-out) var(--ncom-anim-delay,0ms) both}`
    )
    // Last, so it overrides both rules above for anyone who asked the OS not to
    // animate things at them.
    parts.push(
      `@media (prefers-reduced-motion: reduce){${hidden}{opacity:1}${shown}{animation:none}}`
    )
  }

  // A stylesheet is injected as the text child of a `<style>` element, where
  // the only sequence that can end it early is a closing tag. Every value in it
  // has already been through the grammars above, so this can only ever be a
  // no-op — it is here as the last line of defence, not the first.
  return parts.join('').replace(/<\/(style)/gi, '<\\/$1')
}

/**
 * The entrance animations a merchant can pick from.
 *
 * They animate the `translate` and `scale` *properties* rather than
 * `transform`. That is not a style preference: an element may already carry a
 * `transform` from its own rotate/scale/offset controls, and a keyframe
 * animating `transform` would wipe it for the animation's duration and then
 * snap it back. The individual properties compose with `transform` instead of
 * replacing it, so the two features stop fighting.
 */
const ANIMATION_KEYFRAMES = `
@keyframes ncom-fade{from{opacity:0}to{opacity:1}}
@keyframes ncom-fade-up{from{opacity:0;translate:0 24px}to{opacity:1;translate:0 0}}
@keyframes ncom-fade-down{from{opacity:0;translate:0 -24px}to{opacity:1;translate:0 0}}
@keyframes ncom-fade-left{from{opacity:0;translate:24px 0}to{opacity:1;translate:0 0}}
@keyframes ncom-fade-right{from{opacity:0;translate:-24px 0}to{opacity:1;translate:0 0}}
@keyframes ncom-zoom-in{from{opacity:0;scale:0.85}to{opacity:1;scale:1}}
@keyframes ncom-zoom-out{from{opacity:0;scale:1.15}to{opacity:1;scale:1}}
@keyframes ncom-rise{from{opacity:0;translate:0 60px;scale:0.96}to{opacity:1;translate:0 0;scale:1}}
`.replace(/\n/g, '')

/** Whether any element on the page asked for an entrance animation. */
export function pageUsesAnimation(
  sections: { elements?: ElementDesignMap | null }[]
): boolean {
  return sections.some((section) =>
    Object.values(section.elements ?? {}).some((design) => {
      const type = design?.animation?.type
      return typeof type === 'string' && type !== 'none'
    })
  )
}
