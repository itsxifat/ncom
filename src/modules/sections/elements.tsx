import type { ComponentType, ElementType, ReactNode } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Award,
  Check,
  CheckCircle,
  ChevronRight,
  Clock,
  CreditCard,
  Flame,
  Gift,
  Heart,
  Info,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Percent,
  Phone,
  RefreshCw,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  ThumbsUp,
  TrendingUp,
  Truck,
  Users,
  Zap,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { safeHref, sanitizeRichText } from './sanitizeHtml'
import {
  extraKey,
  type ExtraElement,
  type IconName,
} from './elementDescriptors'
import type { SectionConfig } from './types'

/**
 * The primitives that make a block's insides addressable.
 *
 * A block used to be a closed piece of markup: the merchant could restyle the
 * frame around it and nothing within. Wrapping each meaningful thing a block
 * draws in `<El>` is what opens it up — the element gains a `data-el` key, and
 * the stylesheet built in `elementStyle.ts` can then target it by that key.
 *
 * Two properties of this design are what keep it cheap:
 *
 * **`El` renders *as* the tag it replaces, never around it.** `<El as="h1">`
 * emits an `<h1>`, so converting a block is adding an attribute, not adding a
 * wrapper — no block's layout shifts on the way in, and a block already shipped
 * looks pixel-identical until someone styles it.
 *
 * **`El` carries no design of its own.** It does not read `config`, does not
 * compute styles and has no context to consume, which is why it stays a plain
 * server component. All styling arrives through the one stylesheet the page
 * emits, matched on `data-el`. The consequence worth knowing: an element's
 * appearance lives entirely in that sheet, so there is exactly one place a
 * "why does this look like that" question is ever answered.
 */

export function El({
  part,
  index,
  as = 'div',
  html,
  className,
  children,
  ...rest
}: {
  /** The element key. Must match a descriptor in the block's `elements`. */
  part: string
  /**
   * Which instance, for a block that draws one of these per list item. The
   * shared key still matches, so styling "all cards" and styling "card three"
   * are the same mechanism at two specificities.
   */
  index?: number
  as?: ElementType
  /**
   * Rich text for this element, sanitised on the way in.
   *
   * Passing plain words here is fine and is what most content is: the
   * sanitiser escapes text and emits it unchanged, so a field that has never
   * been formatted renders exactly as it did before rich text existed.
   */
  html?: string | null
  className?: string
  children?: ReactNode
  // Blocks pass through the attributes their original markup carried — href on
  // a link, src on an image, aria-* anywhere.
  [attribute: string]: unknown
}) {
  const Component = as as ComponentType<Record<string, unknown>>

  const props: Record<string, unknown> = {
    ...rest,
    'data-el': part,
    className,
  }
  if (index !== undefined) props['data-el-i'] = index

  if (html !== undefined && html !== null) {
    props.dangerouslySetInnerHTML = { __html: sanitizeRichText(html) }
    return <Component {...props} />
  }

  props.children = children
  return <Component {...props} />
}

// ── Merchant-added elements ───────────────────────────────────────────

const ICONS: Record<IconName, ComponentType<{ className?: string }>> = {
  star: Star,
  heart: Heart,
  check: Check,
  'check-circle': CheckCircle,
  shield: Shield,
  'shield-check': ShieldCheck,
  truck: Truck,
  package: Package,
  gift: Gift,
  tag: Tag,
  percent: Percent,
  clock: Clock,
  zap: Zap,
  flame: Flame,
  award: Award,
  'thumbs-up': ThumbsUp,
  phone: Phone,
  mail: Mail,
  'map-pin': MapPin,
  'credit-card': CreditCard,
  lock: Lock,
  'refresh-cw': RefreshCw,
  sparkles: Sparkles,
  'trending-up': TrendingUp,
  users: Users,
  'message-circle': MessageCircle,
  'arrow-right': ArrowRight,
  'chevron-right': ChevronRight,
  info: Info,
  'alert-circle': AlertCircle,
}

/** The extras a section config holds, ignoring anything malformed. */
export function sectionExtras(
  config: SectionConfig | undefined
): ExtraElement[] {
  const extras = config?.extras
  if (!Array.isArray(extras)) return []
  return extras.filter(
    (extra): extra is ExtraElement =>
      !!extra && typeof extra === 'object' && typeof extra.id === 'string'
  )
}

/**
 * Renders the elements a merchant added to one slot of a block.
 *
 * Every block places one of these in its main content container, which is what
 * makes "add a second button to the hero" possible without the hero knowing
 * anything about second buttons. An extra lands at the end of the slot in
 * source order; where it *appears* is then a style question like any other —
 * `order` moves it within the flow, and free positioning takes it out of the
 * flow entirely.
 */
export function Extras({
  config,
  slot = 'content',
  className,
}: {
  config?: SectionConfig
  slot?: string
  className?: string
}) {
  const extras = sectionExtras(config).filter(
    (extra) => (extra.slot || 'content') === slot
  )
  if (!extras.length) return null

  return (
    <>
      {extras.map((extra) => (
        <ExtraElementView key={extra.id} extra={extra} className={className} />
      ))}
    </>
  )
}

/**
 * One added element.
 *
 * The classes here are a starting look, not a design: enough that a newly
 * added button reads as a button the moment it appears, light enough that the
 * merchant's own styling wins without fighting it. Anything a merchant is
 * likely to change — colour, size, spacing — is left to the theme's variables
 * or omitted, so their first edit is an override of nothing rather than a
 * fight with a hardcoded value.
 */
function ExtraElementView({
  extra,
  className,
}: {
  extra: ExtraElement
  className?: string
}) {
  const key = extraKey(extra.id)

  switch (extra.type) {
    case 'heading':
      return (
        <El
          as="h3"
          part={key}
          html={extra.html}
          className={cn(
            'text-xl font-semibold tracking-tight text-[color:var(--lp-text)]',
            className
          )}
        />
      )

    case 'text':
      return (
        <El
          as="p"
          part={key}
          html={extra.html}
          className={cn(
            'text-[15px] leading-relaxed text-[color:var(--lp-text)]/75',
            className
          )}
        />
      )

    case 'button': {
      // An unresolvable link becomes a plain `#`, not a dropped element: a
      // button that vanished would leave the merchant hunting for an element
      // the tree still lists.
      const href = safeHref(extra.href || '#order') ?? '#order'
      return (
        <El
          as="a"
          part={key}
          href={href}
          html={extra.html}
          className={cn(
            // Painted by a class, not an inline `style`. An inline declaration
            // outranks every selector, so an inline background here would make
            // this element's own colour control do nothing — which on an
            // element that exists purely to be styled would be absurd.
            'inline-flex w-fit items-center justify-center rounded-full bg-[var(--lp-accent)] px-7 py-3 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.99]',
            className
          )}
        />
      )
    }

    case 'image':
      if (!extra.src) {
        // Drawn rather than skipped, so an image element added but not yet
        // given a picture is still something to click on the canvas.
        return (
          <El
            as="div"
            part={key}
            className={cn(
              'flex min-h-24 w-full items-center justify-center rounded-lg border border-dashed border-current/25 text-xs opacity-50',
              className
            )}
          >
            Choose an image
          </El>
        )
      }
      return (
        // A plain `img` rather than `next/image`, for the same reason the block
        // primitives use one: sections render on tenant domains and inside the
        // builder's iframe, neither of which is the optimizer's origin.
        <El
          as="img"
          part={key}
          src={extra.src}
          alt={extra.alt || ''}
          className={cn('h-auto w-full', className)}
        />
      )

    case 'icon': {
      const Glyph = ICONS[extra.icon as IconName] ?? Star
      return (
        <El
          as="span"
          part={key}
          className={cn(
            'inline-flex size-8 items-center justify-center text-[color:var(--lp-accent)]',
            className
          )}
        >
          <Glyph className="size-full" />
        </El>
      )
    }

    case 'divider':
      return (
        <El
          as="hr"
          part={key}
          className={cn('w-full border-current/15', className)}
        />
      )

    case 'spacer':
      return (
        <El
          as="div"
          part={key}
          aria-hidden
          className={cn('h-6 w-full', className)}
        />
      )

    default:
      return null
  }
}
