import Image from 'next/image'

import { cn } from '@/lib/utils'
import { BRAND_NAME, BRAND_WORDMARK } from '@/lib/brand'

/**
 * The logo lockup.
 *
 * The mark is always rendered in the brand's lime, on every surface. It is never
 * recoloured, filtered or inverted: the colour is the identity, and an ink
 * version of it would be a second logo the brand does not have.
 *
 * That is a deliberate choice about a logotype, not an oversight about contrast.
 * WCAG 1.4.3 exempts "text that is part of a logo or brand name" from its
 * contrast minimum, precisely because a brand mark is an identifier rather than
 * something the reader has to decode. On the light marketing header and the auth
 * canvas the lime therefore reads soft — which is a look, and the intended one.
 *
 * `tone` no longer touches the mark. It still governs the optional `suffix`
 * beside it, because that *is* ordinary text: "Admin" has to stay legible, so it
 * follows the body colour on light surfaces and goes lime on dark ones.
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
  /** Affects only `suffix`; the mark itself is always brand lime. */
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
        className={cn('w-auto', height)}
      />
      {suffix && (
        <span
          className={cn(
            'font-display text-[1.0625rem] leading-none font-medium tracking-tight',
            // On a light surface the lime qualifier would have the same contrast
            // problem the mark does, so it follows the body colour instead.
            tone === 'onDark' ? 'text-lime' : 'text-foreground'
          )}
        >
          {suffix}
        </span>
      )}
    </span>
  )
}
