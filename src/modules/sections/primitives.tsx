import { cn } from '@/lib/utils'
import type { SectionConfig } from './types'

export function SectionContainer({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{ maxWidth: 'var(--page-container-width)' }}
      className={cn('mx-auto px-6', className)}
    >
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
}

export function SectionWrapper({
  config,
  className,
  children,
}: {
  config?: SectionConfig
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      style={{
        paddingTop: 'calc(var(--page-space-unit) * 4rem)',
        paddingBottom: 'calc(var(--page-space-unit) * 4rem)',
      }}
      className={cn(
        BG_VARIANTS[config?.backgroundVariant ?? 'default'],
        config?.alignment === 'center' && 'text-center',
        className
      )}
    >
      {children}
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
