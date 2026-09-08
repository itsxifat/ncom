import { cn } from '@/lib/utils'
import { El } from './elements'

/**
 * The shared layout vocabulary every landing-page block is built from.
 *
 * These are the block-level equivalents of the page primitives in
 * `primitives.tsx`: that file owns the per-section design layer (background,
 * padding, borders — everything the Design tab writes), while this one owns the
 * intrinsic look of a block. Keeping them apart is what lets a block's own
 * design stay fixed while a merchant restyles the frame around it.
 *
 * Colour comes from `--lp-accent` / `--lp-text`, declared by PageThemeProvider.
 * A block never names a brand colour directly, which is what makes a page
 * re-skinnable from the theme alone.
 */

export const HERO_HEIGHTS: Record<string, string> = {
  small: 'min-h-[280px] sm:min-h-[340px]',
  medium: 'min-h-[380px] sm:min-h-[480px]',
  large: 'min-h-[480px] sm:min-h-[620px]',
  full: 'min-h-[85vh]',
}

export const SPACING: Record<string, string> = {
  small: 'py-4',
  medium: 'py-10',
  large: 'py-20',
}

export const ALIGN: Record<string, string> = {
  left: 'text-left items-start',
  center: 'text-center items-center',
  right: 'text-right items-end',
}

/** Every block sits in the same centred column so the page reads as one design. */
export function BlockSection({
  children,
  className = '',
  full = false,
}: {
  children: React.ReactNode
  className?: string
  full?: boolean
}) {
  if (full) return <div className={className}>{children}</div>
  return (
    <div className={cn('px-4 sm:px-6', className)}>
      <div className="mx-auto max-w-5xl">{children}</div>
    </div>
  )
}

export function BlockHeading({
  children,
  className = '',
  part = 'heading',
  html,
}: {
  children?: React.ReactNode
  className?: string
  /** The element key this heading is styled by. */
  part?: string
  /** Rich text, when the block's heading field carries formatting. */
  html?: string | null
}) {
  if (!children && !html) return null
  return (
    <El
      as="h2"
      part={part}
      html={html}
      className={cn(
        'text-2xl font-bold tracking-tight text-[color:var(--lp-text)] sm:text-3xl',
        className
      )}
    >
      {children}
    </El>
  )
}

/**
 * An image that fills its positioned ancestor.
 *
 * The visual equivalent of `next/image` with `fill`, written as a plain `<img>`
 * because sections render inside the builder's sandboxed canvas iframe and on
 * tenant domains, where the Next image optimizer is not on the serving origin.
 * The parent must be `relative` — same contract `fill` has.
 */
export function FillImg({
  src,
  alt = '',
  className,
  loading,
  part,
  index,
}: {
  src?: string | null
  alt?: string
  className?: string
  loading?: 'eager' | 'lazy'
  /** Element key, so a merchant can restyle this image like anything else. */
  part?: string
  index?: number
}) {
  if (!src) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={loading}
      data-el={part}
      data-el-i={index}
      className={cn('absolute inset-0 h-full w-full object-cover', className)}
    />
  )
}

/** An image that keeps its natural aspect ratio and fills the column width. */
export function BlockImg({
  src,
  alt = '',
  className,
  part,
  index,
}: {
  src?: string | null
  alt?: string
  className?: string
  part?: string
  index?: number
}) {
  if (!src) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      data-el={part}
      data-el-i={index}
      className={cn('h-auto w-full', className)}
    />
  )
}

/** Pull the YouTube id out of any of the URL shapes people paste. */
export function youtubeId(url: string | undefined | null): string {
  const m = String(url || '').match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/
  )
  return m ? m[1]! : ''
}
