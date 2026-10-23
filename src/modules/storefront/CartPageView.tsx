'use client'

import { useEffect, useState, useTransition } from 'react'
import { ShoppingBag, Tag, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { applyDiscountAction, removeDiscountAction } from './cart-actions'
import type { CartView } from './cart-types'
import { QuantityStepper, useCart } from './CartProvider'
import { discountRejectionText } from './i18n'
import { useStoreText } from './StoreTextProvider'
import {
  hairline,
  headingFont,
  muted,
  panel,
  primaryButton,
  secondaryButton,
  textField,
} from './ui'

/**
 * The cart, as a page of its own.
 *
 * The drawer is where most shoppers see their cart; this page is where the
 * header's bag icon leads without a script, where a shared "/cart" link lands,
 * and where a discount code is easiest to type. It reads and writes the same
 * cart the drawer does, so a change here shows in the header's count at once.
 */
export function CartPageView({
  initialCart,
}: {
  initialCart: CartView | null
}) {
  const cart = useCart()
  const { words, price } = useStoreText()
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  useEffect(() => {
    if (initialCart) cart?.replace(initialCart)
    // Seeded once from the server's copy; after that the provider owns it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const view = cart?.cart ?? initialCart
  const paths = cart?.paths
  const lines = view?.lines ?? []
  const currency = view?.currencyCode ?? cart?.currencyCode ?? 'BDT'

  if (lines.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 px-6 py-24 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--page-text)_6%,transparent)]">
          <ShoppingBag className="size-9 opacity-60" />
        </span>
        <h1 className={cn('text-2xl font-semibold', headingFont)}>
          {words.cartEmpty}
        </h1>
        <p className={muted}>{words.cartEmptyHint}</p>
        <a href={paths?.allProducts ?? '/products'} className={primaryButton}>
          {words.startShopping}
        </a>
      </div>
    )
  }

  const blocked = lines.some((line) => line.unavailable)

  return (
    <div className="mx-auto grid w-full max-w-[var(--page-container-width)] gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14 lg:py-14">
      <div>
        <h1
          className={cn(
            'mb-6 text-3xl font-semibold tracking-tight',
            headingFont
          )}
        >
          {words.yourCart}
        </h1>
        <ul className={cn('divide-y border-y', hairline)}>
          {lines.map((line) => (
            <li key={line.id} className={cn('flex gap-4 py-5', hairline)}>
              <a
                href={paths?.product(line.handle)}
                className="size-24 shrink-0 overflow-hidden rounded-xl bg-[color-mix(in_oklab,var(--page-text)_6%,transparent)] sm:size-28"
              >
                {line.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- merchant CDN
                  <img
                    src={line.imageUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                )}
              </a>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <a
                      href={paths?.product(line.handle)}
                      className="font-medium hover:underline"
                    >
                      {line.title}
                    </a>
                    {line.variantTitle && (
                      <p className={cn('text-sm', muted)}>
                        {line.variantTitle}
                      </p>
                    )}
                    <p className={cn('text-sm', muted)}>
                      {words.each(price(line.unitPriceCents, currency))}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold">
                    {price(line.lineTotalCents, currency)}
                  </span>
                </div>
                {line.unavailable && (
                  <p className="text-sm font-medium text-red-600">
                    {words.noLongerAvailableRemove}
                  </p>
                )}
                <div className="mt-auto flex items-center gap-4 pt-2">
                  <QuantityStepper
                    value={line.quantity}
                    disabled={cart?.busy}
                    onChange={(quantity) =>
                      cart?.setQuantity(line.id, quantity)
                    }
                  />
                  <button
                    type="button"
                    onClick={() => cart?.setQuantity(line.id, 0)}
                    className={cn(
                      'inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline',
                      muted
                    )}
                  >
                    <X className="size-3.5" /> {words.remove}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {cart?.error && (
          <p role="alert" className="mt-4 text-sm font-medium text-red-600">
            {cart.error}
          </p>
        )}
      </div>

      <aside
        className={cn(
          panel,
          'flex flex-col gap-4 self-start p-6 lg:sticky lg:top-24'
        )}
      >
        <h2 className="text-lg font-semibold">{words.summary}</h2>
        {view?.discountCode ? (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <Tag className="size-3.5" /> {view.discountCode}
            </span>
            <button
              type="button"
              onClick={() =>
                startTransition(async () => {
                  const result = await removeDiscountAction()
                  if (result.ok) cart?.replace(result.cart)
                })
              }
              className={cn('text-xs underline', muted)}
            >
              {words.remove}
            </button>
          </div>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setCodeError(null)
              startTransition(async () => {
                const result = await applyDiscountAction(code)
                if (result.ok) {
                  cart?.replace(result.cart)
                  setCode('')
                } else setCodeError(result.error)
              })
            }}
          >
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={words.discountCode}
              aria-label={words.discountCode}
              className={cn(textField, 'h-10 text-sm')}
            />
            <button
              type="submit"
              disabled={busy || !code.trim()}
              className={cn(secondaryButton, 'min-h-10 px-4')}
            >
              {words.apply}
            </button>
          </form>
        )}
        {(codeError || view?.discountRejection) && (
          <p className="text-xs text-red-600">
            {codeError ?? discountRejectionText(words, view?.discountRejection)}
          </p>
        )}

        <dl
          className={cn('flex flex-col gap-2 border-t pt-4 text-sm', hairline)}
        >
          <div className="flex justify-between">
            <dt className={muted}>{words.subtotal}</dt>
            <dd className="font-medium">
              {price(view?.subtotalCents ?? 0, currency)}
            </dd>
          </div>
          {(view?.discountCents ?? 0) > 0 && (
            <div className="flex justify-between">
              <dt className={muted}>{words.discount}</dt>
              <dd className="font-medium">
                −{price(view!.discountCents, currency)}
              </dd>
            </div>
          )}
          <div
            className={cn(
              'mt-1 flex items-baseline justify-between border-t pt-3',
              hairline
            )}
          >
            <dt className="text-base font-semibold">{words.total}</dt>
            <dd className="text-xl font-semibold">
              {price(
                (view?.subtotalCents ?? 0) - (view?.discountCents ?? 0),
                currency
              )}
            </dd>
          </div>
        </dl>
        <p className={cn('text-xs', muted)}>{words.deliveryAddedAtCheckout}</p>
        <a
          href={blocked ? undefined : (paths?.checkout ?? '/checkout')}
          aria-disabled={blocked}
          className={cn(
            primaryButton,
            'w-full',
            blocked && 'pointer-events-none opacity-50'
          )}
        >
          {words.checkout}
        </a>
        <a
          href={paths?.allProducts ?? '/products'}
          className={cn(
            'text-center text-sm underline-offset-4 hover:underline',
            muted
          )}
        >
          {words.continueShopping}
        </a>
      </aside>
    </div>
  )
}
