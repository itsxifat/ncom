import { NextResponse } from 'next/server'
import {
  getStoreForSeoRoutes,
  listIndexablePages,
} from '@/server/services/publishService'
import { env } from '@/lib/env'
import { prisma } from '@/server/db/client'

// Must never be statically prerendered — each subdomain's sitemap depends
// on live, per-tenant DB state, and a cached "not found" for one subdomain
// must never leak into the response for another.
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ subdomain: string }> }
) {
  const { subdomain } = await params
  const store = await getStoreForSeoRoutes(subdomain)
  if (!store) return new NextResponse('Not found', { status: 404 })

  const base = `http://${subdomain}.${env.ROOT_DOMAIN}`

  if (!store.isSearchIndexable) {
    const empty = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`
    return new NextResponse(empty, {
      headers: { 'Content-Type': 'application/xml' },
    })
  }

  const pages = await listIndexablePages(store.id)

  const entry = (loc: string, lastmod?: Date) =>
    `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod.toISOString()}</lastmod>` : ''}</url>`

  const urls = pages
    .map((page) =>
      entry(page.isHome ? base : `${base}/${page.slug}`, page.updatedAt)
    )
    .join('')

  // An online store is mostly its products and categories, and those are the
  // pages people search for. The merchant's own products are listed from the
  // database; products on a connected website are already in that website's
  // own sitemap, and asking it for thousands here would make every crawl a
  // crawl of their shop.
  const shop =
    store.kind === 'STORE'
      ? await (async () => {
          const [products, categories] = await Promise.all([
            prisma.product.findMany({
              where: { organizationId: store.organizationId, status: 'ACTIVE' },
              select: { handle: true, updatedAt: true },
              orderBy: { updatedAt: 'desc' },
              take: 2000,
            }),
            prisma.category.findMany({
              where: { organizationId: store.organizationId, isActive: true },
              select: { handle: true, updatedAt: true },
            }),
          ])
          return [
            entry(`${base}/products`),
            ...categories.map((category) =>
              entry(
                `${base}/categories/${encodeURIComponent(category.handle)}`,
                category.updatedAt
              )
            ),
            ...products.map((product) =>
              entry(
                `${base}/products/${encodeURIComponent(product.handle)}`,
                product.updatedAt
              )
            ),
          ].join('')
        })()
      : ''

  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}${shop}</urlset>`

  return new NextResponse(xml, {
    headers: { 'Content-Type': 'application/xml' },
  })
}
