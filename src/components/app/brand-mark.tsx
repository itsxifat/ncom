import Image from 'next/image'

import { cn } from '@/lib/utils'
import { BRAND_NAME, BRAND_WORDMARK } from '@/lib/brand'

/**
 * The logo lockup.
 *
 * The mark ships as flat lime on transparency, which is the identity and the
 * right thing on ink. On a light surface that same lime sits at roughly 1.3:1
 * against white — legible as a shape, but it reads as a washed-out artefact
 * rather than as a logo. So on light ground the mark is rendered in ink
 * instead.
 *
 * `brightness(0)` rather than a second asset: the wordmark is a single flat
 * colour over alpha, so multiplying the channels to zero yields a clean black
 * wordmark with the antialiased edges intact — one file, no second request, and
 * nothing to keep in sync when the logo is replaced. (Email cannot do this;
 * `lib/brand.ts` carries a real ink PNG for that.)
 *
 * `tone` says what the mark is standing on:
 *  - `onDark` — always ink ground (the rail, the marketing footer). Always lime.
 *  - `onLight` — ground that follows the page theme. Ink in light mode, and
 *    lime again inside anything carrying `.dark`, which covers both the dark
 *    theme and the rail's locally-forced dark scope.
 *
 * It still governs the optional `suffix` too, because that *is* ordinary text:
 * "Admin" has to stay legible, so it follows the body colour on light surfaces
 * and goes lime on dark ones.
 */
export function BrandMark({
  label = BRAND_NAME,
  suffix,
  tone = 'onDark',
  size = 'default',
  className,
}: {
  /** Accessible name. Also what a screen reader announces in place of the mark. */
  label?: string
  /** Qualifier beside the mark, e.g. "Admin". */
  suffix?: string
  /** What the mark is standing on. Decides ink versus lime. */
  tone?: 'onDark' | 'onLight'
  size?: 'sm' | 'default' | 'lg'
  className?: string
}) {
  const height = { sm: 'h-4', default: 'h-5', lg: 'h-7' }[size]

  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <Image
        src={BRAND_WORDMARK.src}
        alt={label}
        width={BRAND_WORDMARK.width}
        height={BRAND_WORDMARK.height}
        // Every placement is above the fold in a header or rail, so the mark
        // should not wait behind lazy-loading and pop in after paint.
        priority
        className={cn(
          'w-auto',
          height,
          tone === 'onLight' && 'brightness-0 dark:brightness-100'
        )}
      />
      {suffix && (
        <span
          className={cn(
            'font-display text-[1.0625rem] leading-none font-medium tracking-tight',
            tone === 'onDark' ? 'text-lime' : 'text-foreground'
          )}
        >
          {suffix}
        </span>
      )}
    </span>
  )
}
