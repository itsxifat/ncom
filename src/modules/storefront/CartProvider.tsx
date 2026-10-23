'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { Minus, Plus, ShoppingBag, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { storePaths } from '@/modules/sections/storefront'
import {
  addToCartAction,
  cartAction,
  cartSummaryAction,
  updateCartLineAction,
} from './cart-actions'
import type { CartView } from './cart-types'
import { hairline, muted, primaryButton, secondaryButton } from './ui'
import { useStoreText } from './StoreTextProvider'

export interface CartApi {
  /** Items in the cart, for the header's badge. */
  count: number
  cart: CartView | null
  isOpen: boolean
  /** True while a change is on its way to the server. */
  busy: boolean
  error: string | null
  currencyCode: string
  paths: ReturnType<typeof storePaths>
  openCart: () => void
  closeCart: () => void
  /** Adds and opens the drawer. Resolves false when the store refused. */
  add: (input: {
    variantId: string
    productId?: string
    quantity: number
  }) => Promise<boolean>
  setQuantity: (lineId: string, quantity: number) => Promise<void>
  /** Replaces the cart after a change made elsewhere — the cart page's code box. */
  replace: (cart: CartView) => void
}

const CartContext = createContext<CartApi | null>(null)

/**
 * The cart, wherever a store's blocks are being shown to a shopper.
 *
 * Null outside a live store — on a landing page, in the builder canvas, in a
 * preview — and every block that sells reads that as "not here": the header
 * still draws its bag icon and the product page its button, they just do not
 * put anything in anybody's cart. That is what lets the merchant click around
 * their own design without creating carts in their own shop.
 */
export function useCart(): CartApi | null {
  return useContext(CartContext)
}

/**
 * Holds the cart for one storefront page and draws the drawer it opens in.
 *
 * The badge count is fetched on its own, cheaply, when the page loads; the
 * priced cart only when the drawer opens or something is added. Pricing reads
 * the merchant's catalogue, possibly across the internet, and doing that on
 * every page view for a number in a badge would make browsing a shop as slow
 * as checking out of one.
 */
export function CartProvider({
  currencyCode,
  linkBase = '',
  children,
}: {
  currencyCode: string
  linkBase?: string
  children: React.ReactNode
}) {
  const [count, setCount] = useState(0)
  const [cart, setCart] = useState<CartView | null>(null)
  const [isOpen, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()
  const paths = useMemo(() => storePaths(linkBase), [linkBase])

  useEffect(() => {
    let cancelled = false
    cartSummaryAction()
      .then((summary) => {
        if (!cancelled) setCount(summary.count)
      })
      .catch(() => {
        // A badge that stays at zero is better than a page that breaks.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const replace = useCallback((next: CartView) => {
    setCart(next)
    setCount(next.count)
  }, [])

  const openCart = useCallback(() => {
    setOpen(true)
    setError(null)
    startTransition(async () => {
      const next = await cartAction()
      if (next) replace(next)
      else setCart(null)
    })
  }, [replace])

  const add = useCallback<CartApi['add']>(
    async (input) => {
      setError(null)
      const result = await addToCartAction(input)
      if (!result.ok) {
        setError(result.error)
        return false
      }
      replace(result.cart)
      setOpen(true)
      return true
    },
    [replace]
  )

  const setQuantity = useCallback<CartApi['setQuantity']>(
    async (lineId, quantity) => {
      setError(null)
      const result = await updateCartLineAction({ lineId, quantity })
      if (result.ok) replace(result.cart)
      else setError(result.error)
    },
    [replace]
  )

  const api = useMemo<CartApi>(
    () => ({
      count,
      cart,
      isOpen,
      busy,
      error,
      currencyCode,
      paths,
      openCart,
      closeCart: () => setOpen(false),
      add,
      setQuantity,
      replace,
    }),
    [
      count,
      cart,
      isOpen,
      busy,
      error,
      currencyCode,
      paths,
      openCart,
      add,
      setQuantity,
      replace,
    ]
  )

  return (
    <CartContext.Provider value={api}>
      {children}
      <CartDrawer />
    </CartContext.Provider>
  )
}

function CartDrawer() {
  const api = useCart()!
  const { isOpen, closeCart, cart, busy, error, currencyCode, paths } = api
  const { words, price } = useStoreText()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCart()
    }
    // The page under an open drawer should not scroll away beneath it on a
    // phone, where a stray swipe would otherwise move the shop, not the cart.
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
    }
  }, [isOpen, closeCart])

  const lines = cart?.lines ?? []
  const blocked = lines.some((line) => line.unavailable)

  return (
    <div
      aria-hidden={!isOpen}
      className={cn(
        'fixed inset-0 z-[60] transition-[visibility] duration-300',
        isOpen ? 'visible' : 'invisible'
      )}
    >
      <div
        onClick={closeCart}
        className={cn(
          'absolute inset-0 bg-black/40 transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0'
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={words.yourCart}
        style={{
          backgroundColor: 'var(--page-background)',
          color: 'var(--page-text)',
          fontFamily: 'var(--page-font-body)',
        }}
        className={cn(
          'absolute top-0 right-0 flex h-full w-full max-w-md flex-col shadow-2xl transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <header
          className={cn(
            'flex items-center justify-between border-b px-5 py-4',
            hairline
          )}
        >
          <h2 className="[font-family:var(--page-font-heading)] text-lg font-semibold">
            {words.cartWithCount(cart?.count ?? 0)}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={closeCart}
            aria-label={words.closeCart}
            className="-mr-2 flex size-10 items-center justify-center rounded-full transition hover:bg-[color-mix(in_oklab,var(--page-text)_8%,transparent)]"
          >
            <X className="size-5" />
          </button>
        </header>

        {error && (
          <p
            role="alert"
            className="mx-5 mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--page-text)_6%,transparent)]">
              <ShoppingBag className="size-7 opacity-60" />
            </span>
            <p className="text-base font-medium">
              {busy && !cart ? words.loadingCart : words.cartEmpty}
            </p>
            {!busy && (
              <a
                href={paths.allProducts}
                onClick={closeCart}
                className={secondaryButton}
              >
                {words.continueShopping}
              </a>
            )}
          </div>
        ) : (
          <>
            <ul
              className={cn('flex-1 divide-y overflow-y-auto px-5', hairline)}
            >
              {lines.map((line) => (
                <li key={line.id} className={cn('flex gap-4 py-4', hairline)}>
                  <a
                    href={paths.product(line.handle)}
                    className="size-20 shrink-0 overflow-hidden rounded-lg bg-[color-mix(in_oklab,var(--page-text)_6%,transparent)]"
                  >
                    {line.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- merchant CDN, not the optimiser's origin
                      <img
                        src={line.imageUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    )}
                  </a>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-start justify-between gap-3">
                      <a
                        href={paths.product(line.handle)}
                        className="line-clamp-2 text-sm font-medium hover:underline"
                      >
                        {line.title}
                      </a>
                      <span className="shrink-0 text-sm font-semibold">
                        {price(line.lineTotalCents, currencyCode)}
                      </span>
                    </div>
                    {line.variantTitle && (
                      <p className={cn('text-xs', muted)}>
                        {line.variantTitle}
                      </p>
                    )}
                    {line.unavailable && (
                      <p className="text-xs font-medium text-red-600">
                        {words.noLongerAvailableRemove}
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between pt-1">
                      <QuantityStepper
                        value={line.quantity}
                        disabled={busy}
                        onChange={(quantity) =>
                          api.setQuantity(line.id, quantity)
                        }
                      />
                      <button
                        type="button"
                        onClick={() => api.setQuantity(line.id, 0)}
                        className={cn(
                          'text-xs underline-offset-4 hover:underline',
                          muted
                        )}
                      >
                        {words.remove}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <footer
              className={cn('flex flex-col gap-3 border-t px-5 py-5', hairline)}
            >
              {cart && cart.discountCents > 0 && (
                <div className="flex justify-between text-sm">
                  <span className={muted}>
                    {cart.discountCode
                      ? words.discountWithCode(cart.discountCode)
                      : words.discount}
                  </span>
                  <span>−{price(cart.discountCents, currencyCode)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between">
                <span className="text-base font-semibold">
                  {words.subtotal}
                </span>
                <span className="text-lg font-semibold">
                  {price(
                    (cart?.subtotalCents ?? 0) - (cart?.discountCents ?? 0),
                    currencyCode
                  )}
                </span>
              </div>
              <p className={cn('text-xs', muted)}>
                {words.deliveryAddedAtCheckout}
              </p>
              <a
                href={blocked ? undefined : paths.checkout}
                aria-disabled={blocked}
                className={cn(
                  primaryButton,
                  'w-full',
                  blocked && 'pointer-events-none opacity-50'
                )}
              >
                {words.checkout}
              </a>
              <a href={paths.cart} className={cn(secondaryButton, 'w-full')}>
                {words.viewCart}
              </a>
            </footer>
          </>
        )}
      </aside>
    </div>
  )
}

export function QuantityStepper({
  value,
  onChange,
  disabled,
  min = 1,
  max = 99,
  size = 'sm',
}: {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  min?: number
  max?: number
  size?: 'sm' | 'lg'
}) {
  const { words, number } = useStoreText()
  const button =
    'flex items-center justify-center transition hover:bg-[color-mix(in_oklab,var(--page-text)_8%,transparent)] disabled:opacity-40'
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border',
        hairline,
        size === 'lg' ? 'h-12' : 'h-9'
      )}
    >
      <button
        type="button"
        aria-label={words.decreaseQuantity}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={cn(
          button,
          'h-full rounded-l-full',
          size === 'lg' ? 'w-12' : 'w-9'
        )}
      >
        <Minus className="size-3.5" />
      </button>
      <span
        aria-live="polite"
        className={cn(
          'text-center text-sm font-semibold tabular-nums',
          size === 'lg' ? 'w-10' : 'w-7'
        )}
      >
        {number(value)}
      </span>
      <button
        type="button"
        aria-label={words.increaseQuantity}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={cn(
          button,
          'h-full rounded-r-full',
          size === 'lg' ? 'w-12' : 'w-9'
        )}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}
