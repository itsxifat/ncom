import type { Metadata } from 'next'
import { getCart } from '@/server/services/cartService'
import { readCartToken } from '@/server/storefront/request'
import {
  renderSitePage,
  storeChrome,
  storeForRoute,
  storeScreenMetadata,
} from '@/server/storefront/site-page'
import { StoreDocument } from '@/server/storefront/store-page'
import { CartPageView } from '@/modules/storefront/CartPageView'
import { toCartView } from '@/modules/storefront/cart-view'

export async function generateMetadata({
  params,
}: PageProps<'/sites/[subdomain]/cart'>): Promise<Metadata> {
  const { subdomain } = await params
  return storeScreenMetadata(subdomain, ['cart'], (words) => words.yourCart)
}

/** The cart, as a page of its own, inside the store's header and footer. */
export default async function CartPage({
  params,
}: PageProps<'/sites/[subdomain]/cart'>) {
  const { subdomain } = await params
  const store = await storeForRoute(subdomain)
  if (!store) return renderSitePage(subdomain, ['cart'])

  const [{ layout, storefront, theme }, token] = await Promise.all([
    storeChrome(store),
    readCartToken(),
  ])
  const cart = token ? await getCart(store.organizationId, token) : null

  return (
    <StoreDocument
      theme={theme}
      storeId={store.id}
      storefront={storefront}
      top={layout.top}
      bottom={layout.bottom}
    >
      <CartPageView initialCart={cart ? toCartView(cart) : null} />
    </StoreDocument>
  )
}
