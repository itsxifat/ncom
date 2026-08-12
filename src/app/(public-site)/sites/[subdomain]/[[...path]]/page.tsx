import { notFound } from 'next/navigation'
import { after } from 'next/server'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { getPublishedPageForRender } from '@/server/services/publishService'
import { recordPageView } from '@/server/services/analyticsService'
import { getStorefrontCommerce } from '@/server/services/offerService'
import { isOverTrafficAllowance } from '@/server/services/entitlementService'
import {
  estimateHtmlBytes,
  monthlyVisitorHash,
  recordTraffic,
  recordVisit,
} from '@/server/services/usageService'
import { getPlatformFlag } from '@/server/services/platformFlagService'
import { env } from '@/lib/env'
import { PageRenderer } from '@/modules/sections/PageRenderer'
import { IntegrationScripts } from '@/components/analytics/integration-scripts'
import { AllowanceReachedPage } from '@/components/public/allowance-reached'

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
    // The favicon travels in the page snapshot's theme, so it is already
    // available here without a second query.
    icons: snapshot.theme.faviconUrl
      ? { icon: snapshot.theme.faviconUrl }
      : undefined,
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

  const { store, page, snapshot, integration } = result

  // A tenant past their monthly allowance gets a holding page instead of their
  // site. Two switches have to agree before that happens — the platform flag and
  // the plan's own `enforceTrafficCap` — because taking a paying customer's site
  // offline is the most damaging thing this codebase can do automatically.
  if (await getPlatformFlag('quota.enforcePublicTrafficCap')) {
    const allowance = await isOverTrafficAllowance(store.organizationId)
    if (allowance.over) {
      return <AllowanceReachedPage reason={allowance.reason ?? 'traffic'} />
    }
  }

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

  // What this page sells, resolved once and handed to every section so the
  // order form, the bundle cards and the sticky bar all quote the same prices.
  const commerce = await getStorefrontCommerce(
    page.id,
    store.id,
    store.organizationId
  )

  after(async () => {
    await recordPageView({
      pageId: page.id,
      storeId: store.id,
      path: `/${(path ?? []).join('/')}`,
      referrer,
      userAgent,
      ip,
    })

    // Plan metering, separate from the per-page analytics above: this is
    // organisation-scoped and feeds the quota checks, so it stays correct even
    // if a tenant deletes the page the view belonged to.
    await recordTraffic(
      store.organizationId,
      estimateHtmlBytes(snapshot.sections)
    )
    await recordVisit(store.organizationId, monthlyVisitorHash(ip, userAgent))
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
      <PageRenderer
        theme={snapshot.theme}
        sections={snapshot.sections}
        storeId={store.id}
        commerce={commerce}
      />
    </>
  )
}
