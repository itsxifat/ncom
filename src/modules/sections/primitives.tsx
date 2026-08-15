import { cn } from '@/lib/utils'
import { fontStack } from '@/lib/fonts'
import type { SectionConfig } from './types'

export function SectionContainer({
  className,
  children,
  config,
}: {
  className?: string
  children: React.ReactNode
  /** Optional: lets one section be wider or narrower than the theme default. */
  config?: SectionConfig
}) {
  const maxWidth = config?.fullWidth
    ? '100%'
    : config?.maxWidth !== undefined
      ? `${config.maxWidth}px`
      : 'var(--page-container-width)'

  return (
    <div style={{ maxWidth }} className={cn('mx-auto px-6', className)}>
      {children}
    </div>
  )
}

const BG_VARIANTS: Record<
  NonNullable<SectionConfig['backgroundVariant']>,
  string
> = {
  default: '',
  muted: 'bg-[color-mix(in_oklab,var(--page-text)_5%,var(--page-background))]',
  primary: 'bg-[var(--page-primary)] text-[var(--page-background)]',
  dark: 'bg-[var(--page-text)] text-[var(--page-background)]',
  // 'custom' paints from config.backgroundColor instead of a class.
  custom: '',
}

/**
 * The outer element of every section, and the single place per-section design
 * overrides are applied.
 *
 * Every override falls back to the page theme when unset, so a section that
 * configures nothing is indistinguishable from one rendered before these
 * options existed. Values that end up in `style` are numbers or colour strings
 * from a closed set of controls — never raw CSS text — so a section's design
 * cannot smuggle arbitrary declarations into the page.
 */
export function SectionWrapper({
  config,
  className,
  children,
  defaultPadding = true,
}: {
  config?: SectionConfig
  className?: string
  children: React.ReactNode
  /**
   * Whether an unconfigured section gets the theme's standard vertical rhythm.
   *
   * The landing-page blocks carry their own spacing as part of their design, so
   * they pass `false` and stay pixel-identical to the reference implementation
   * until a merchant actually sets padding in the Design tab. An explicit
   * `paddingTop`/`paddingBottom` still wins either way — this only decides what
   * "unset" means.
   */
  defaultPadding?: boolean
}) {
  const hasBackgroundImage = Boolean(config?.backgroundImageUrl)
  const overlay = config?.backgroundOverlay ?? 0

  const fallbackPadding = defaultPadding
    ? 'calc(var(--page-space-unit) * 4rem)'
    : undefined

  const style: React.CSSProperties = {
    // Padding falls back to the theme's spacing unit when not overridden.
    paddingTop:
      config?.paddingTop !== undefined
        ? `${config.paddingTop}rem`
        : fallbackPadding,
    paddingBottom:
      config?.paddingBottom !== undefined
        ? `${config.paddingBottom}rem`
        : fallbackPadding,
  }

  if (config?.backgroundVariant === 'custom' && config.backgroundColor) {
    style.backgroundColor = config.backgroundColor
  }

  if (config?.textColor) style.color = config.textColor

  // Typeface overrides work by redefining the same two variables the theme
  // sets, one level further down the tree. Every block already paints from
  // `--page-font-heading` / `--page-font-body`, so overriding them here reaches
  // all of them through inheritance — there is nothing to add to a block, and a
  // block added later gets this for free. Unset stays unset, so the value keeps
  // cascading from the theme.
  if (config?.headingFont) {
    ;(style as Record<string, string>)['--page-font-heading'] = fontStack(
      config.headingFont
    )
  }
  if (config?.bodyFont) {
    const stack = fontStack(config.bodyFont)
    ;(style as Record<string, string>)['--page-font-body'] = stack
    // The body variable is applied as `font-family` on the theme provider, far
    // above this section, so redefining the variable alone would not repaint
    // this section's own text — only descendants that name the variable again.
    style.fontFamily = stack
  }

  if (config?.borderRadius !== undefined) {
    style.borderRadius = `${config.borderRadius}px`
    // A radius with no clipping does nothing visible on a section that has a
    // background image.
    style.overflow = 'hidden'
  }

  if (hasBackgroundImage) {
    style.backgroundImage = `url(${JSON.stringify(config!.backgroundImageUrl)})`
    style.backgroundSize = config?.backgroundSize ?? 'cover'
    style.backgroundPosition = config?.backgroundPosition ?? 'center'
    style.backgroundRepeat = 'no-repeat'
  }

  const alignmentClass =
    config?.alignment === 'center'
      ? 'text-center'
      : config?.alignment === 'right'
        ? 'text-right'
        : undefined

  return (
    <section
      id={config?.anchorId || undefined}
      style={style}
      className={cn(
        'relative',
        BG_VARIANTS[config?.backgroundVariant ?? 'default'],
        alignmentClass,
        config?.borderTop &&
          'border-t border-[color-mix(in_oklab,currentColor_15%,transparent)]',
        config?.borderBottom &&
          'border-b border-[color-mix(in_oklab,currentColor_15%,transparent)]',
        // Tailwind cannot express "hide below sm" and "hide from sm up" from a
        // single toggle, so both are explicit.
        config?.hideOnMobile && 'hidden sm:block',
        config?.hideOnDesktop && 'sm:hidden',
        className,
        config?.customClassName
      )}
    >
      {/* Overlay sits between the background image and the content, so text
          stays readable over a busy photo. */}
      {hasBackgroundImage && overlay > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: `rgb(0 0 0 / ${overlay}%)` }}
        />
      )}
      <div className="relative">{children}</div>
    </section>
  )
}

export function PageHeading({
  as: Tag = 'h2',
  className,
  children,
}: {
  as?: 'h1' | 'h2' | 'h3'
  className?: string
  children: React.ReactNode
}) {
  return (
    <Tag
      style={{ fontFamily: 'var(--page-font-heading)' }}
      className={cn('font-semibold tracking-tight text-balance', className)}
    >
      {children}
    </Tag>
  )
}

export function PageEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{ color: 'var(--page-primary)' }}
      className="text-xs font-semibold tracking-[0.14em] uppercase"
    >
      {children}
    </span>
  )
}

const BUTTON_BASE =
  'inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90'

export function PageButton({
  href,
  variant = 'solid',
  className,
  children,
}: {
  href?: string
  variant?: 'solid' | 'outline' | 'ghost'
  className?: string
  children: React.ReactNode
}) {
  const style: React.CSSProperties = { borderRadius: 'var(--page-radius)' }
  let variantClass = ''

  if (variant === 'solid') {
    style.backgroundColor = 'var(--page-primary)'
    style.color = '#fff'
  } else if (variant === 'outline') {
    style.borderColor = 'var(--page-primary)'
    style.color = 'var(--page-primary)'
    variantClass = 'border bg-transparent'
  } else {
    style.color = 'var(--page-primary)'
    variantClass = 'bg-transparent'
  }

  return (
    <a
      href={href ?? '#'}
      style={style}
      className={cn(BUTTON_BASE, variantClass, className)}
    >
      {children}
    </a>
  )
}

/** Resolves the theme's configured button style unless a section explicitly overrides it. */
export function resolveButtonVariant(
  themeButtonStyle: 'SOLID' | 'OUTLINE' | 'GHOST'
): 'solid' | 'outline' | 'ghost' {
  return themeButtonStyle.toLowerCase() as 'solid' | 'outline' | 'ghost'
}
