import { NextResponse } from 'next/server'
import { getProjectForSeoRoutes } from '@/server/services/publishService'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ subdomain: string }> }
) {
  const { subdomain } = await params
  const project = await getProjectForSeoRoutes(subdomain)
  if (!project) return new NextResponse('Not found', { status: 404 })

  const base = `http://${subdomain}.${env.ROOT_DOMAIN}`

  const body = project.isSearchIndexable
    ? `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`
    : `User-agent: *\nDisallow: /\n`

  return new NextResponse(body, { headers: { 'Content-Type': 'text/plain' } })
}
