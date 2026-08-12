import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageThemeProvider } from '@/modules/sections/theme'
import { CartLineForm } from '@/components/storefront/cart-line-form'
import { getCart } from '@/server/services/cartService'
import {
  buildCartDrop,
  renderStorefrontTemplate,
  resolveStore,
} from '@/server/services/storefrontRenderService'
import { formatMoney } from '@/lib/money'
import { DEFAULT_THEME } from '@/lib/default-theme'
import { CART_TOKEN_COOKIE } from '@/lib/storefront-cookies'

/**
 * The cart.
 *
 * Always dynamic — it reads a per-visitor cookie and per-visitor prices, so it
 * must never be cached or statically generated. Reading `cookies()` already
 * forces that; the explicit export documents the intent so nobody later adds a
 * revalidate and quietly serves one shopper's cart to another.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Cart',
  robots: { index: false, follow: false },
}

interface RouteParams {
  subdomain: string
}

export default async function CartPage({
  params,
}: {
  params: Promise<RouteParams>
}) {
  const { subdomain } = await params

  const store = await resolveStore(subdomain)
  if (!store) notFound()

  const theme = store.theme ?? DEFAULT_THEME
  const currency = store.organization.settings?.currencyCode ?? 'USD'

  const jar = await cookies()
  const token = jar.get(CART_TOKEN_COOKIE)?.value ?? null
  const cart = token ? await getCart(store.id, token) : null

  const rendered = await renderStorefrontTemplate(store.id, 'CART', {
    cart: cart ? buildCartDrop(cart) : undefined,
    request_path: '/cart',
  })

  if (!rendered.missingTemplate) {
    return (
      <PageThemeProvider theme={theme}>
        <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
      </PageThemeProvider>
    )
  }

  if (!cart || cart.lines.length === 0) {
    return (
      <PageThemeProvider theme={theme}>
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h1 className="text-3xl font-semibold">Your cart is empty</h1>
          <Link href="/" className="mt-6 inline-block underline">
            Continue shopping
          </Link>
        </div>
      </PageThemeProvider>
    )
  }

  const { pricing } = cart

  return (
    <PageThemeProvider theme={theme}>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="mb-8 text-3xl font-semibold">Your cart</h1>

        <ul className="flex flex-col divide-y">
          {cart.lines.map((line) => {
            const priced = pricing.lines.find((entry) => entry.id === line.id)
            const unavailable = cart.unavailableLineIds.includes(line.id)

            return (
              <li key={line.id} className="flex gap-4 py-5">
                {line.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={line.imageUrl}
                    alt={line.title}
                    className="size-20 rounded-[var(--page-radius)] object-cover"
                  />
                ) : (
                  <div className="size-20 rounded-[var(--page-radius)] bg-black/5" />
                )}

                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex justify-between gap-4">
                    <div>
                      <Link
                        href={`/products/${line.handle}`}
                        className="font-medium hover:underline"
                      >
                        {line.title}
                      </Link>
                      {line.variantTitle !== 'Default Title' && (
                        <p className="text-sm opacity-60">
                          {line.variantTitle}
                        </p>
                      )}
                      {unavailable && (
                        <p className="text-sm" style={{ color: '#dc2626' }}>
                          No longer available in this quantity
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {formatMoney(
                          priced?.subtotalCents ??
                            line.unitPriceCents * line.quantity,
                          currency
                        )}
                      </p>
                      {(priced?.discountCents ?? 0) > 0 && (
                        <p
                          className="text-sm"
                          style={{ color: 'var(--page-primary)' }}
                        >
                          -{formatMoney(priced!.discountCents, currency)}
                        </p>
                      )}
                    </div>
                  </div>

                  <CartLineForm
                    subdomain={subdomain}
                    lineId={line.id}
                    quantity={line.quantity}
                  />
                </div>
              </li>
            )
          })}
        </ul>

        <dl className="mt-8 flex flex-col gap-2 border-t pt-6">
          <Row
            label="Subtotal"
            value={formatMoney(pricing.subtotalCents, currency)}
          />
          {pricing.discountTotalCents > 0 && (
            <Row
              label={`Discount${cart.discountCode ? ` (${cart.discountCode})` : ''}`}
              value={`-${formatMoney(pricing.discountTotalCents, currency)}`}
            />
          )}
          {pricing.shippingTotalCents > 0 && (
            <Row
              label="Shipping"
              value={formatMoney(pricing.shippingTotalCents, currency)}
            />
          )}
          {pricing.taxTotalCents > 0 && (
            <Row
              label="Tax"
              value={formatMoney(pricing.taxTotalCents, currency)}
            />
          )}
          <div className="mt-2 flex justify-between border-t pt-3 text-lg font-semibold">
            <dt>Total</dt>
            <dd>{formatMoney(pricing.totalCents, currency)}</dd>
          </div>
        </dl>

        {pricing.discountRejectionReason && (
          <p className="mt-4 text-sm opacity-70">
            {describeRejection(pricing.discountRejectionReason)}
          </p>
        )}

        <Link
          href="/checkout"
          className="mt-8 block rounded-[var(--page-radius)] px-6 py-3 text-center font-medium"
          style={{
            backgroundColor: 'var(--page-primary)',
            color: 'var(--page-background)',
          }}
        >
          Checkout
        </Link>
      </div>
    </PageThemeProvider>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="opacity-70">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

/** Turns a pricing rejection code into something a shopper can act on. */
function describeRejection(reason: string): string {
  switch (reason) {
    case 'MINIMUM_SUBTOTAL_NOT_MET':
      return 'Your discount code needs a higher order subtotal to apply.'
    case 'MINIMUM_QUANTITY_NOT_MET':
      return 'Your discount code needs more items to apply.'
    case 'NO_ELIGIBLE_ITEMS':
      return 'Your discount code does not apply to the items in your cart.'
    default:
      return 'Your discount code could not be applied.'
  }
}
