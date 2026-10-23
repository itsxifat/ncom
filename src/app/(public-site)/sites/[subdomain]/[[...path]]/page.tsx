import type { Metadata } from 'next'
import { renderSitePage, siteMetadata } from '@/server/storefront/site-page'

/**
 * Every page with an address of its own: a landing page, a store's home page,
 * a store's "About us". A store's product, category, cart and account pages
 * have routes of their own beside this one; see server/storefront/site-page
 * for how all of them are drawn.
 */
export async function generateMetadata({
  params,
}: PageProps<'/sites/[subdomain]/[[...path]]'>): Promise<Metadata> {
  const { subdomain, path } = await params
  return siteMetadata(subdomain, path ?? [])
}

export default async function PublicSitePage({
  params,
}: PageProps<'/sites/[subdomain]/[[...path]]'>) {
  const { subdomain, path } = await params
  return renderSitePage(subdomain, path ?? [])
}
