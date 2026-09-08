'use client'

import { useState } from 'react'
import { El, Extras } from '../elements'
import { cn } from '@/lib/utils'
import { CountdownClock } from './CountdownClock'
import type { CountdownContent } from './content'
import type { SectionConfig } from '../types'

/**
 * Everything a countdown block draws.
 *
 * The whole block is client-side rather than just the digits, because two of
 * its behaviours are decisions only the browser can make: whether the deadline
 * has passed (which decides if the block is on the page at all under
 * `onExpire: hide`), and where an evergreen visitor's own window ends.
 *
 * The server still renders it — the panel, heading and layout are all in the
 * first paint. Only the numbers arrive a frame later, which is the same
 * trade-off the block has always made.
 */

const ALIGN_ITEMS: Record<CountdownContent['align'], string> = {
  left: 'items-start text-left',
  center: 'items-center text-center',
  right: 'items-end text-right',
}

export function CountdownBody({
  content,
  config,
  target,
  sectionId,
  editing,
}: {
  content: CountdownContent
  config?: SectionConfig
  /** Fixed deadline as an epoch, or null when the block runs evergreen. */
  target: number | null
  sectionId: string
  editing: boolean
}) {
  const [expired, setExpired] = useState(false)

  // In the builder an expired block stays on the canvas whatever `onExpire`
  // says. A block that removes itself the moment the merchant looks at it is
  // unselectable, and they would have no way to change the date that expired.
  const hidden = expired && content.onExpire === 'hide' && !editing
  if (hidden) return null

  const accent = content.accentColor || 'var(--lp-accent)'
  const onPanel = content.panel

  return (
    // The accent arrives as a custom property and is painted by a class, not
    // by an inline `background`. Inline declarations outrank every selector, so
    // an inline paint here would have made this element's own colour controls
    // in the design panel do nothing at all.
    <El
      as="div"
      part="panel"
      className={cn(
        'flex flex-col',
        ALIGN_ITEMS[content.align],
        onPanel && 'rounded-2xl px-6 py-8 [background:var(--cd-accent)]'
      )}
      style={
        {
          '--cd-accent': accent,
          // Amber reads as a warning against a brand-coloured panel, where red
          // on red would vanish; red is the clearer signal on the page's own
          // background.
          '--lp-countdown-urgent': onPanel ? '#ffd166' : '#d92d20',
        } as React.CSSProperties
      }
    >
      {content.title && (
        <El
          as="p"
          part="title"
          html={content.title}
          className={cn(
            'mb-4 text-[12px] tracking-[3px] uppercase',
            onPanel ? 'text-white/85' : 'text-[color:var(--lp-text)]/60'
          )}
        />
      )}

      <CountdownClock
        target={target}
        content={content}
        sectionId={sectionId}
        onPanel={onPanel}
        editing={editing}
        onExpiredChange={setExpired}
      />

      {content.subtitle && (
        <El
          as="p"
          part="subtitle"
          html={content.subtitle}
          className={cn(
            'mt-4 max-w-prose text-[13px] leading-relaxed',
            onPanel ? 'text-white/80' : 'text-[color:var(--lp-text)]/65'
          )}
        />
      )}

      {content.ctaText && !(expired && content.onExpire === 'message') && (
        <El
          as="a"
          part="button"
          href="#order"
          html={content.ctaText}
          className={cn(
            'mt-5 inline-flex w-fit items-center justify-center rounded-full px-7 py-3 text-[14px] font-semibold shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.99]',
            onPanel
              ? 'bg-white [color:var(--cd-accent)]'
              : 'text-white [background:var(--cd-accent)]'
          )}
        />
      )}

      {editing && expired && content.onExpire === 'hide' && (
        <p
          className={cn(
            'mt-4 rounded-md px-3 py-1.5 text-[11px]',
            onPanel
              ? 'bg-black/25 text-white/90'
              : 'bg-[color-mix(in_oklab,currentColor_10%,transparent)] text-[color:var(--lp-text)]/70'
          )}
        >
          Expired — this block is hidden on the published page.
        </p>
      )}

      <Extras config={config} slot="content" />
    </El>
  )
}
