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
}: PageProps<'/sites/[subdomain]/search'>): Promise<Metadata> {
  const { subdomain } = await params
  return listingMetadata(
    subdomain,
    ['search'],
    async (store) => storeText(store.theme).words.search,
    // Search results are a different page for every query typed; letting
    // them into an index fills it with near-duplicates of the shop. A store's
    // only — a landing site's own "search" page keeps its own indexing.
    { robots: { index: false, follow: true } }
  )
}

/** What the shopper searched for, in the catalogue design. */
export default async function SearchPage({
  params,
  searchParams,
}: PageProps<'/sites/[subdomain]/search'>) {
  const [{ subdomain }, query] = await Promise.all([params, searchParams])
  return renderListingPage(
    subdomain,
    {
      kind: 'search',
      query: stringParam(query.q),
      sort: stringParam(query.sort),
      page: pageParam(query.page),
    },
    ['search']
  )
}
