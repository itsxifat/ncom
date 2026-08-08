import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPublishedPageForRender } from '@/server/services/publishService'
import { PageRenderer } from '@/modules/sections/PageRenderer'

interface RouteParams {
  subdomain: string
  path?: string[]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>
}): Promise<Metadata> {
  const { subdomain, path } = await params
  const result = await getPublishedPageForRender(subdomain, path ?? [])
  if (!result) return {}

  const { snapshot } = result
  return {
    title: snapshot.seoTitle || snapshot.title,
    description: snapshot.seoDescription ?? undefined,
    robots: snapshot.robotsIndex ? undefined : { index: false, follow: false },
  }
}

export default async function PublicSitePage({
  params,
}: {
  params: Promise<RouteParams>
}) {
  const { subdomain, path } = await params
  const result = await getPublishedPageForRender(subdomain, path ?? [])
  if (!result) notFound()

  const { snapshot } = result
  return <PageRenderer theme={snapshot.theme} sections={snapshot.sections} />
}
