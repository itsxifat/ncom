import { notFound } from 'next/navigation'
import { after } from 'next/server'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { getPublishedPageForRender } from '@/server/services/publishService'
import { recordPageView } from '@/server/services/analyticsService'
import { env } from '@/lib/env'
import { PageRenderer } from '@/modules/sections/PageRenderer'
import { IntegrationScripts } from '@/components/analytics/integration-scripts'

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
  const url = `http://${subdomain}.${env.ROOT_DOMAIN}/${(path ?? []).join('/')}`

  return {
    title: snapshot.seoTitle || snapshot.title,
    description: snapshot.seoDescription ?? undefined,
    alternates: { canonical: url },
    robots: snapshot.robotsIndex ? undefined : { index: false, follow: false },
    openGraph: {
      title: snapshot.seoTitle || snapshot.title,
      description: snapshot.seoDescription ?? undefined,
      url,
      images: snapshot.ogImageUrl ? [snapshot.ogImageUrl] : undefined,
    },
    twitter: {
      card: snapshot.ogImageUrl ? 'summary_large_image' : 'summary',
      title: snapshot.seoTitle || snapshot.title,
      description: snapshot.seoDescription ?? undefined,
      images: snapshot.ogImageUrl ? [snapshot.ogImageUrl] : undefined,
    },
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

  const { project, page, snapshot, integration } = result

  // `after()` callbacks can't call `headers()`/`cookies()` themselves —
  // everything they need must be resolved beforehand and captured in the
  // closure.
  const headerList = await headers()
  const ip =
    headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headerList.get('x-real-ip') ??
    'unknown'
  const referrer = headerList.get('referer')
  const userAgent = headerList.get('user-agent') ?? ''

  after(async () => {
    await recordPageView({
      pageId: page.id,
      projectId: project.id,
      path: `/${(path ?? []).join('/')}`,
      referrer,
      userAgent,
      ip,
    })
  })

  return (
    <>
      {integration && (
        <IntegrationScripts
          gaMeasurementId={integration.gaMeasurementId}
          gtmContainerId={integration.gtmContainerId}
          metaPixelId={integration.metaPixelId}
          customHeadScript={integration.customHeadScript}
        />
      )}
      <PageRenderer theme={snapshot.theme} sections={snapshot.sections} />
    </>
  )
}
