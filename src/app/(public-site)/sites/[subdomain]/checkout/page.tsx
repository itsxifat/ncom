import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { PageThemeProvider } from '@/modules/sections/theme'
import { getCart } from '@/server/services/cartService'
import { listCheckoutPaymentMethods } from '@/server/services/paymentService'
import { resolveStore } from '@/server/services/storefrontRenderService'
import { formatMoney } from '@/lib/money'
import { DEFAULT_THEME } from '@/lib/default-theme'
import { CART_TOKEN_COOKIE } from '@/lib/storefront-cookies'
import {
  CheckoutDetailsForm,
  PaymentSection,
  ShippingRatePicker,
  type CheckoutPaymentMethod,
} from '@/components/storefront/checkout-form'

/** Per-visitor and price-sensitive — never cache. */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
}

interface AddressShape {
  firstName?: string
  lastName?: string
  address1?: string
  address2?: string
  city?: string
  provinceCode?: string
  countryCode?: string
  postalCode?: string
  phone?: string
}

export default async function CheckoutPage({
  params,
}: PageProps<'/sites/[subdomain]/checkout'>) {
  const { subdomain } = await params

  const store = await resolveStore(subdomain)
  if (!store) notFound()

  const theme = store.theme ?? DEFAULT_THEME
  const currency = store.organization.settings?.currencyCode ?? 'USD'

  const jar = await cookies()
  const token = jar.get(CART_TOKEN_COOKIE)?.value ?? null
  const cart = token ? await getCart(store.id, token) : null

  // Nothing to check out — send them back rather than rendering an empty form.
  if (!cart || cart.lines.length === 0) redirect('/cart')

  const methods = (await listCheckoutPaymentMethods(
    store.id
  )) as CheckoutPaymentMethod[]

  const address = (cart.shippingAddress ?? {}) as AddressShape
  const hasAddress = Boolean(address.address1 && address.countryCode)
  const { pricing } = cart
  const format = (cents: number) => formatMoney(cents, currency)

  return (
    <PageThemeProvider theme={theme}>
      <div className="mx-auto grid max-w-5xl gap-12 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-10">
          <CheckoutDetailsForm
            subdomain={subdomain}
            defaults={{
              email: cart.email ?? '',
              firstName: address.firstName ?? '',
              lastName: address.lastName ?? '',
              address1: address.address1 ?? '',
              address2: address.address2 ?? '',
              city: address.city ?? '',
              provinceCode: address.provinceCode ?? '',
              countryCode: address.countryCode ?? '',
              postalCode: address.postalCode ?? '',
              phone: address.phone ?? '',
            }}
          />

          {/* Delivery and payment only appear once there is an address to
              price them against — offering a rate before we know the
              destination would mean quoting a number we may have to change. */}
          {hasAddress && (
            <>
              <ShippingRatePicker
                subdomain={subdomain}
                rates={pricing.availableShippingRates}
                selectedId={cart.shippingRateId}
                formatPrice={format}
              />

              {!pricing.shippingUnavailable && (
                <PaymentSection
                  subdomain={subdomain}
                  methods={methods}
                  totalCents={pricing.totalCents}
                  formatPrice={format}
                />
              )}
            </>
          )}
        </div>

        <aside className="flex flex-col gap-4 self-start rounded-[var(--page-radius)] border p-5">
          <h2 className="text-lg font-semibold">Order summary</h2>

          <ul className="flex flex-col gap-3">
            {cart.lines.map((line) => (
              <li key={line.id} className="flex items-center gap-3">
                {line.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={line.imageUrl}
                    alt=""
                    className="size-12 rounded-[var(--page-radius)] object-cover"
                  />
                ) : (
                  <div className="size-12 rounded-[var(--page-radius)] bg-black/5" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{line.title}</p>
                  <p className="text-xs opacity-70">
                    {line.variantTitle !== 'Default Title' &&
                      `${line.variantTitle} · `}
                    Qty {line.quantity}
                  </p>
                </div>
                <span className="text-sm">
                  {format(line.unitPriceCents * line.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="flex flex-col gap-1.5 border-t pt-4 text-sm">
            <Row label="Subtotal" value={format(pricing.subtotalCents)} />
            {pricing.discountTotalCents > 0 && (
              <Row
                label="Discount"
                value={`−${format(pricing.discountTotalCents)}`}
              />
            )}
            <Row
              label="Shipping"
              value={
                hasAddress
                  ? format(pricing.shippingTotalCents)
                  : 'Calculated next'
              }
            />
            {pricing.taxTotalCents > 0 && (
              <Row label="Tax" value={format(pricing.taxTotalCents)} />
            )}
            <div className="mt-2 flex justify-between border-t pt-3 text-base font-semibold">
              <dt>Total</dt>
              <dd>{format(pricing.totalCents)}</dd>
            </div>
          </dl>

          <Link href="/cart" className="text-sm underline">
            Edit cart
          </Link>
        </aside>
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
