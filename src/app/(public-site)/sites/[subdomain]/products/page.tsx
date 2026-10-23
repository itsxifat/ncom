import type { Metadata } from 'next'
import {
  listingMetadata,
  pageParam,
  renderListingPage,
  stringParam,
} from '@/server/storefront/site-page'
import { storeText } from '@/modules/storefront/i18n'

export async function generateMetadata({
  params,
}: PageProps<'/sites/[subdomain]/products'>): Promise<Metadata> {
  const { subdomain } = await params
  return listingMetadata(
    subdomain,
    ['products'],
    async (store) => storeText(store.theme).words.allProducts
  )
}

/** Everything the store sells, in the catalogue design. */
export default async function AllProductsPage({
  params,
  searchParams,
}: PageProps<'/sites/[subdomain]/products'>) {
  const [{ subdomain }, query] = await Promise.all([params, searchParams])
  return renderListingPage(
    subdomain,
    {
      kind: 'all',
      sort: stringParam(query.sort),
      page: pageParam(query.page),
    },
    ['products']
  )
}
