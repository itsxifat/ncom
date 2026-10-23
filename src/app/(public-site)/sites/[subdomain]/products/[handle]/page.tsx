import type { Metadata } from 'next'
import {
  productMetadata,
  renderProductPage,
} from '@/server/storefront/site-page'

export async function generateMetadata({
  params,
}: PageProps<'/sites/[subdomain]/products/[handle]'>): Promise<Metadata> {
  const { subdomain, handle } = await params
  return productMetadata(subdomain, handle)
}

/** One product, drawn in the store's product page design. */
export default async function StoreProductPage({
  params,
}: PageProps<'/sites/[subdomain]/products/[handle]'>) {
  const { subdomain, handle } = await params
  return renderProductPage(subdomain, handle)
}
