import type { Metadata } from 'next'
import { prisma } from '@/server/db/client'
import {
  listingMetadata,
  pageParam,
  renderListingPage,
  stringParam,
} from '@/server/storefront/site-page'

export async function generateMetadata({
  params,
}: PageProps<'/sites/[subdomain]/collections/[handle]'>): Promise<Metadata> {
  const { subdomain, handle } = await params
  return listingMetadata(subdomain, ['collections', handle], async (store) => {
    const collection = await prisma.collection.findFirst({
      where: { organizationId: store.organizationId, handle },
      select: { title: true },
    })
    return collection?.title ?? null
  })
}

/** One collection's products — "Best sellers", "New in" — in the catalogue design. */
export default async function CollectionPage({
  params,
  searchParams,
}: PageProps<'/sites/[subdomain]/collections/[handle]'>) {
  const [{ subdomain, handle }, query] = await Promise.all([
    params,
    searchParams,
  ])
  return renderListingPage(
    subdomain,
    {
      kind: 'collection',
      handle,
      sort: stringParam(query.sort),
      page: pageParam(query.page),
    },
    ['collections', handle]
  )
}
