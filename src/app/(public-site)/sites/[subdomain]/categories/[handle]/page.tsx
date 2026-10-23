import type { Metadata } from 'next'
import { loadStoreCatalogue } from '@/server/services/storefrontService'
import {
  listingMetadata,
  pageParam,
  renderListingPage,
  stringParam,
} from '@/server/storefront/site-page'

export async function generateMetadata({
  params,
}: PageProps<'/sites/[subdomain]/categories/[handle]'>): Promise<Metadata> {
  const { subdomain, handle } = await params
  return listingMetadata(subdomain, ['categories', handle], async (store) => {
    const catalogue = await loadStoreCatalogue(store.organizationId)
    return (
      catalogue.categories.find((category) => category.handle === handle)
        ?.name ?? null
    )
  })
}

/** One category's products, in the catalogue design. */
export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<'/sites/[subdomain]/categories/[handle]'>) {
  const [{ subdomain, handle }, query] = await Promise.all([
    params,
    searchParams,
  ])
  return renderListingPage(
    subdomain,
    {
      kind: 'category',
      handle,
      sort: stringParam(query.sort),
      page: pageParam(query.page),
    },
    ['categories', handle]
  )
}
