import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCart } from '@/server/services/cartService'
import { priceCartById } from '@/server/services/pricingService'
import { listCheckoutPaymentMethods } from '@/server/services/paymentService'
import { readCartToken, requestCustomer } from '@/server/storefront/request'
import {
  renderSitePage,
  storeChrome,
  storeForRoute,
  storeScreenMetadata,
} from '@/server/storefront/site-page'
import { StoreDocument } from '@/server/storefront/store-page'
import {
  CheckoutView,
  type CheckoutMethod,
} from '@/modules/storefront/CheckoutView'
import { toCartView } from '@/modules/storefront/cart-view'
import { defaultCountryFor } from '@/modules/storefront/checkout-shared'

export async function generateMetadata({
  params,
}: PageProps<'/sites/[subdomain]/checkout'>): Promise<Metadata> {
  const { subdomain } = await params
  return storeScreenMetadata(subdomain, ['checkout'], (words) => words.checkout)
}

/**
 * The store's checkout.
 *
 * An empty or expired cart goes back to the cart page rather than showing an
 * order form for nothing. Delivery rates are the ones the workspace offers in
 * the country the shop sells in; the shopper's choice is priced again by the
 * server when they press the button.
 */
export default async function CheckoutPage({
  params,
}: PageProps<'/sites/[subdomain]/checkout'>) {
  const { subdomain } = await params
  const store = await storeForRoute(subdomain)
  if (!store) return renderSitePage(subdomain, ['checkout'])

  const token = await readCartToken()
  const cart = token ? await getCart(store.organizationId, token) : null
  if (!cart || cart.lines.length === 0) redirect('/cart')

  const { layout, storefront, theme } = await storeChrome(store)
  const countryCode = defaultCountryFor(storefront.currencyCode)

  const [priced, methods, customer] = await Promise.all([
    priceCartById(cart.id, { countryCode }),
    listCheckoutPaymentMethods(store.organizationId),
    requestCustomer(store.organizationId),
  ])

  // Offline methods only for now. A card form needs a payment step this
  // checkout does not have yet, and offering a method that cannot complete is
  // worse than not offering it.
  const offline = methods.filter(
    (
      method
    ): method is typeof method & { provider: CheckoutMethod['provider'] } =>
      method.provider === 'CASH_ON_DELIVERY' || method.provider === 'MANUAL'
  )

  const address =
    customer?.addresses.find((entry) => entry.isDefault) ??
    customer?.addresses[0]

  return (
    <StoreDocument
      theme={theme}
      storeId={store.id}
      storefront={storefront}
      top={layout.top}
      bottom={layout.bottom}
    >
      <CheckoutView
        initialCart={toCartView(cart)}
        rates={priced.availableShippingRates}
        methods={offline.map((method) => ({
          provider: method.provider,
          displayName: method.displayName,
          instructions: method.instructions,
        }))}
        countryCode={countryCode}
        showCountry={countryCode !== 'BD'}
        prefill={{
          name: [customer?.firstName, customer?.lastName]
            .filter(Boolean)
            .join(' '),
          phone: customer?.phone ?? address?.phone ?? '',
          email: customer?.email ?? '',
          address: address?.address1 ?? '',
          city: address?.city ?? '',
        }}
        continueHref="/cart"
      />
    </StoreDocument>
  )
}
