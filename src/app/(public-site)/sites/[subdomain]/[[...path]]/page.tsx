import { randomUUID } from 'node:crypto'
import { notFound } from 'next/navigation'
import { after } from 'next/server'
import { cookies, headers } from 'next/headers'
import type { Metadata } from 'next'
import { getPublishedPageForRender } from '@/server/services/publishService'
import { recordPageView } from '@/server/services/analyticsService'
import {
  readTrackingIdentity,
  trackPageEvents,
  trackingConfigFrom,
  type PageOfferSnapshot,
} from '@/server/services/trackingService'
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

  // Server-side tracking, resolved here rather than in the `after()` below:
  // that callback cannot read `headers()` or `cookies()` from a Server
  // Component, so everything the events need is captured now and closed over.
  // The credentials ride along on the integration row already loaded for the
  // browser tags, so this costs no extra query per page view.
  const trackingConfig = trackingConfigFrom(store.id, integration)
  const cookieStore = trackingConfig ? await cookies() : null

  const pageUrl = `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${headerList.get('host') ?? `${subdomain}.${env.ROOT_DOMAIN}`}/${(path ?? []).join('/')}`

  // One id per event per render, shared with the browser tag rendered below so
  // Meta collapses its copy and ours into a single event.
  const trackingEventIds = {
    pageView: randomUUID(),
    viewContent: randomUUID(),
  }

  const trackedOffer = offerSnapshot(commerce)

  if (trackingConfig && cookieStore) {
    const identity = readTrackingIdentity({
      headers: headerList,
      cookies: cookieStore,
      measurementId: trackingConfig.ga4?.measurementId ?? null,
      ip: ip === 'unknown' ? null : ip,
      userAgent: userAgent || null,
    })

    after(async () => {
      await trackPageEvents({
        config: trackingConfig,
        identity,
        sourceUrl: pageUrl,
        pageTitle: snapshot.seoTitle || snapshot.title,
        referrer,
        offer: trackedOffer,
        metaEventIds: trackingEventIds,
      })
    })
  }

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
          // Only the booleans and the event ids cross into the browser. The
          // access token and API secret on `integration` stay on the server.
          serverTracking={
            trackingConfig && {
              meta: Boolean(trackingConfig.meta),
              ga4: Boolean(trackingConfig.ga4),
              pageViewEventId: trackingEventIds.pageView,
              viewContentEventId: trackedOffer
                ? trackingEventIds.viewContent
                : null,
            }
          }
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

/**
 * What this page is selling, for the product-view event.
 *
 * The default offer, because that is the one the page leads with and the one a
 * visitor is looking at before they touch anything. Returns null when the page
 * sells nothing, so a content page does not report a product view of nothing.
 */
function offerSnapshot(
  commerce: Awaited<ReturnType<typeof getStorefrontCommerce>>
): PageOfferSnapshot | null {
  const offer =
    commerce.offers.find((candidate) => candidate.isDefault) ??
    commerce.offers[0]
  if (!offer) return null

  // A FIXED offer's own lines, or the pool a buyer would pick from. Each
  // product contributes its first variant: the event describes what the page
  // shows, and the page shows one price per product until a choice is made.
  const lines = offer.items.length > 0 ? offer.items : offer.pool

  return {
    currencyCode: commerce.currencyCode,
    headlinePriceCents: offer.headlinePriceCents,
    items: lines.flatMap((line) => {
      const variant = line.variants[0]
      if (!variant) return []
      return [
        {
          id: variant.id,
          name: line.title,
          quantity: line.quantity || 1,
          priceCents: variant.priceCents,
        },
      ]
    }),
  }
}
