'use client'

import type { PublicOffer } from '@/lib/offers/types'
import { priceVariesByVariant } from '@/lib/offers/pricing'

/**
 * How the buyer chooses between the page's offers.
 *
 * Four presentations of one choice, because the same three bundles want to look
 * very different on a beauty page and on an electronics page — and because this
 * control is where the page either makes the middle option obvious or fails to.
 * They differ in layout only: every style shows the same price, the same
 * strike-through and the same badge, so switching cannot change what is sold.
 *
 * `cards` is the default and the safest: a row of upright cards, the
 * highlighted one visibly bigger.
 * `rows`  stacks horizontally — easiest to scan on a phone, and the right pick
 *         when the labels are long.
 * `tiles` is a compact grid for four or more options.
 * `radio` is a plain list for merchants who want the form to look like a form.
 */
export function OfferPicker({
  offers,
  selectedKey,
  onSelect,
  style,
  money,
  live = null,
}: {
  offers: PublicOffer[]
  selectedKey: string
  onSelect: (key: string) => void
  style: 'cards' | 'rows' | 'tiles' | 'radio'
  money: (cents: number) => string
  /**
   * The chosen offer priced against what the buyer has actually picked.
   *
   * A headline price is computed before anyone has chosen a size, so on a page
   * where Large costs more than Small the card would go on advertising the
   * Small price while the summary below charged for the Large. Handing the live
   * quote back up keeps the two numbers the same number.
   */
  live?: { key: string; priceCents: number; compareAtCents: number } | null
}) {
  const layout =
    style === 'rows'
      ? 'grid-cols-1'
      : style === 'tiles'
        ? 'grid-cols-2 sm:grid-cols-4'
        : style === 'radio'
          ? 'grid-cols-1'
          : 'grid-cols-1 sm:grid-cols-3'

  return (
    <div className={`grid gap-2.5 ${layout}`}>
      {offers.map((offer) => {
        const selected = offer.key === selectedKey
        const quoted = live && live.key === offer.key ? live : null
        const price = quoted ? quoted.priceCents : offer.headlinePriceCents
        const compareAt = quoted ? quoted.compareAtCents : offer.compareAtCents
        // "from" only until the buyer's own choices have priced it exactly.
        const isFrom = !quoted && priceVariesByVariant(offer)
        // Only a genuine saving is advertised. A compare-at that is not above
        // the price is a fake discount, and rendering it as one teaches buyers
        // to distrust every price on the page.
        const saving = Math.max(0, compareAt - price)

        return (
          <button
            key={offer.key}
            type="button"
            onClick={() => onSelect(offer.key)}
            aria-pressed={selected}
            className={`relative rounded-2xl border-2 p-4 text-left transition ${
              selected
                ? 'border-current bg-black/[0.03] shadow-sm'
                : 'border-neutral-200 hover:border-neutral-400'
            } ${style === 'rows' ? 'flex items-center gap-4' : ''}`}
          >
            {offer.badge && (
              <span className="absolute -top-2.5 left-4 rounded-full bg-current px-2.5 py-0.5 text-[11px] font-bold text-white">
                <span className="mix-blend-normal">{offer.badge}</span>
              </span>
            )}

            {/*
              A dial, not a control. The whole card is the button — this only
              shows which one is chosen, so it is drawn rather than being a
              real radio the keyboard can land on.
            */}
            {style === 'radio' && (
              <span
                aria-hidden
                className={`mr-3 inline-flex size-4 shrink-0 items-center justify-center rounded-full border transition ${
                  selected ? 'border-current' : 'border-neutral-300'
                }`}
              >
                {selected && (
                  <span className="size-2 rounded-full bg-current" />
                )}
              </span>
            )}

            {offer.imageUrl && style !== 'radio' && style !== 'tiles' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={offer.imageUrl}
                alt=""
                className={
                  style === 'rows'
                    ? 'h-14 w-14 flex-none rounded-xl object-cover'
                    : 'mb-3 h-24 w-full rounded-xl object-cover'
                }
              />
            )}

            <span className={style === 'rows' ? 'min-w-0 flex-1' : 'block'}>
              <span className="block font-bold">{offer.label}</span>
              {offer.description && (
                <span className="mt-0.5 block text-xs text-[color:var(--page-muted,#64748b)]">
                  {offer.description}
                </span>
              )}
            </span>

            <span
              className={
                style === 'rows' ? 'flex-none text-right' : 'mt-2 block'
              }
            >
              <span className="block text-xl font-extrabold tabular-nums">
                {isFrom && (
                  <span className="text-xs font-semibold text-[color:var(--page-muted,#64748b)]">
                    from{' '}
                  </span>
                )}
                {money(price)}
              </span>
              {saving > 0 && (
                <span className="block text-xs">
                  <s className="text-[color:var(--page-muted,#64748b)]">
                    {money(compareAt)}
                  </s>{' '}
                  <span className="font-semibold text-emerald-600">
                    save {money(saving)}
                  </span>
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
