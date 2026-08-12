import { NextResponse } from 'next/server'
import { getStoreForSeoRoutes } from '@/server/services/publishService'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ subdomain: string }> }
) {
  const { subdomain } = await params
  const store = await getStoreForSeoRoutes(subdomain)
  if (!store) return new NextResponse('Not found', { status: 404 })

  const base = `http://${subdomain}.${env.ROOT_DOMAIN}`

  const body = store.isSearchIndexable
    ? `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`
    : `User-agent: *\nDisallow: /\n`

  return new NextResponse(body, { headers: { 'Content-Type': 'text/plain' } })
}
