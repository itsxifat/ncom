import { cn } from '@/lib/utils'
import { El } from '@/modules/sections/elements'
import {
  savingPercent,
  storePaths,
  type StoreProductCard,
} from '@/modules/sections/storefront'
import { Price } from './Price'
import { QuickAddButton } from './QuickAddButton'
import { DEFAULT_STORE_TEXT, type StoreText } from './i18n'

export type CardImageRatio = 'square' | 'portrait' | 'landscape'

const RATIO: Record<CardImageRatio, string> = {
  square: 'aspect-square',
  portrait: 'aspect-[4/5]',
  landscape: 'aspect-[4/3]',
}

/** The words a card draws that a merchant may want in their own language. */
export interface CardLabels {
  add: string
  choose: string
  soldOut: string
  sale: string
}

export const DEFAULT_CARD_LABELS: CardLabels = {
  add: 'Add to cart',
  choose: 'Choose options',
  soldOut: 'Sold out',
  sale: 'Sale',
}

/**
 * One product in a grid.
 *
 * Shared by every block that shows products — the grid, the related row, the
 * catalogue page — so a shop's cards look the same everywhere. Each of those
 * blocks declares the parts drawn here (`card`, `cardImage`, `cardBadge`,
 * `cardTitle`, `cardPrice`, `cardButton`) in its own `elements`, so a merchant
 * styling "Product card" on the home page is styling exactly what this draws,
 * and the check in scripts/check-elements.mts holds the two in step.
 *
 * Plain markup with one client island (the button), so it renders on the
 * server for the live site and in the browser for the builder canvas alike.
 */
export function ProductCard({
  product,
  index,
  currencyCode,
  linkBase,
  imageRatio = 'portrait',
  showButton = true,
  showVendor = false,
  labels = DEFAULT_CARD_LABELS,
  text = DEFAULT_STORE_TEXT,
}: {
  product: StoreProductCard
  index: number
  currencyCode: string
  linkBase: string
  imageRatio?: CardImageRatio
  showButton?: boolean
  showVendor?: boolean
  labels?: CardLabels
  /** The storefront's language, for the words a merchant cannot retype. */
  text?: StoreText
}) {
  const href = storePaths(linkBase).product(product.handle)
  const saving = savingPercent(product.priceCents, product.compareAtPriceCents)

  return (
    <El
      as="article"
      part="card"
      index={index}
      className="group/card relative flex flex-col gap-3"
    >
      <a
        href={href}
        className={cn(
          'relative block overflow-hidden rounded-[min(var(--page-radius),1rem)] bg-[color-mix(in_oklab,var(--page-text)_5%,var(--page-background))]',
          RATIO[imageRatio]
        )}
      >
        {product.imageUrl ? (
          <>
            <El
              as="img"
              part="cardImage"
              index={index}
              src={product.imageUrl}
              alt={product.title}
              loading="lazy"
              className={cn(
                'absolute inset-0 size-full object-cover transition duration-500 group-hover/card:scale-[1.03]',
                product.hoverImageUrl && 'group-hover/card:opacity-0'
              )}
            />
            {product.hoverImageUrl && (
              // The second photo is decoration on hover, not a separate
              // element: styling the card's image styles both.
              // eslint-disable-next-line @next/next/no-img-element -- merchant CDN, not the optimiser's origin
              <img
                src={product.hoverImageUrl}
                alt=""
                loading="lazy"
                className="absolute inset-0 size-full object-cover opacity-0 transition duration-500 group-hover/card:opacity-100"
              />
            )}
          </>
        ) : (
          <El
            as="div"
            part="cardImage"
            index={index}
            className="absolute inset-0 flex items-center justify-center text-xs opacity-40"
          >
            {text.words.noPhoto}
          </El>
        )}
        {(!product.available || saving) && (
          <El
            as="span"
            part="cardBadge"
            index={index}
            className={cn(
              'absolute top-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase',
              product.available
                ? 'bg-[var(--page-primary)] text-[var(--page-on-primary)]'
                : // Fixed, not themed: on a dark shop the theme's text colour
                  // is near-white, and a near-white badge on a pale photo
                  // says nothing.
                  'bg-neutral-900/80 text-white'
            )}
          >
            {product.available
              ? `${labels.sale} −${text.number(saving ?? 0)}%`
              : labels.soldOut}
          </El>
        )}
      </a>

      <div className="flex flex-1 flex-col gap-1">
        {showVendor && product.vendor && (
          <span className="text-xs tracking-wide uppercase opacity-60">
            {product.vendor}
          </span>
        )}
        <El
          as="h3"
          part="cardTitle"
          index={index}
          className="text-[15px] leading-snug font-medium"
        >
          <a href={href} className="hover:underline">
            {product.title}
          </a>
        </El>
        <El
          as="p"
          part="cardPrice"
          index={index}
          className="text-[15px] font-semibold"
        >
          <Price
            cents={product.priceCents}
            compareAtCents={product.compareAtPriceCents}
            currencyCode={currencyCode}
            from={product.priceVaries}
          />
        </El>
      </div>

      {showButton && (
        <QuickAddButton
          part="cardButton"
          index={index}
          className="inline-flex min-h-10 w-full items-center justify-center rounded-[min(var(--page-radius),0.75rem)] border border-[color-mix(in_oklab,var(--page-text)_18%,transparent)] px-4 text-sm font-semibold transition hover:border-[var(--page-primary)] hover:bg-[var(--page-primary)] hover:text-[var(--page-on-primary)]"
          variantId={product.quickAddVariantId}
          productId={product.id}
          productHref={href}
          available={product.available}
          addLabel={labels.add}
          chooseLabel={labels.choose}
          soldOutLabel={labels.soldOut}
        />
      )}
    </El>
  )
}

/** The descriptors a block that draws product cards must declare. */
export const PRODUCT_CARD_ELEMENT_KEYS = [
  'card',
  'cardImage',
  'cardBadge',
  'cardTitle',
  'cardPrice',
  'cardButton',
] as const
