import { NextResponse } from 'next/server'
import {
  getStoreForSeoRoutes,
  listIndexablePages,
} from '@/server/services/publishService'
import { env } from '@/lib/env'

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

  const urls = pages
    .map((page) => {
      const loc = page.isHome ? base : `${base}/${page.slug}`
      return `<url><loc>${loc}</loc><lastmod>${page.updatedAt.toISOString()}</lastmod></url>`
    })
    .join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`

  return new NextResponse(xml, {
    headers: { 'Content-Type': 'application/xml' },
  })
}
