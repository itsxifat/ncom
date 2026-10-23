import 'server-only'
import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { cookies, headers } from 'next/headers'
import type { ReactNode } from 'react'
import { recordPageView } from '@/server/services/analyticsService'
import {
  readTrackingIdentity,
  trackPageEvents,
  trackingConfigFrom,
  type PageOfferSnapshot,
} from '@/server/services/trackingService'
import { isOverTrafficAllowance } from '@/server/services/entitlementService'
import {
  estimateHtmlBytes,
  monthlyVisitorHash,
  recordTraffic,
  recordVisit,
} from '@/server/services/usageService'
import { getPlatformFlag } from '@/server/services/platformFlagService'
import { IntegrationScripts } from '@/components/analytics/integration-scripts'
import type { StoreIntegrationConfig } from '@/generated/prisma/client'
import { AllowanceReachedPage } from '@/components/public/allowance-reached'

type Integration = StoreIntegrationConfig | null

/**
 * Everything that happens because someone looked at a public page, besides
 * drawing it.
 *
 * Every public page — a landing page, a store's home, a product, a category,
 * the cart — is one visit to the merchant and must be counted the same way: a
 * page view for their analytics, traffic and a visitor against their plan, and
 * the page-view (and product-view) events their ad accounts are owed. It used
 * to live inside the one landing-page route; a store has many routes, and each
 * of them counting differently would make the merchant's numbers disagree with
 * each other depending on which page a shopper happened to land on.
 *
 * Returns what the page must render: the analytics tags, or — for a tenant
 * past their monthly allowance with enforcement on — a holding page instead of
 * the site.
 */
export async function prepareVisit(input: {
  store: { id: string; organizationId: string }
  integration: Integration
  pageId: string
  pageTitle: string
  /** The path the visitor asked for, e.g. `/products/linen-shirt`. */
  path: string
  /** The rendered sections, for metering what the page cost to serve. */
  sections: object[]
  /** What the page sells, for the product-view event. Null when nothing. */
  offer: PageOfferSnapshot | null
  /** The site's own host, when the request somehow arrives without one. */
  fallbackHost: string
}): Promise<{ blocked: ReactNode | null; scripts: ReactNode | null }> {
  const { store, integration } = input

  // Two switches have to agree before a site is replaced by a holding page —
  // the platform flag and the plan's own `enforceTrafficCap` — because taking
  // a paying customer's site offline is the most damaging thing this codebase
  // can do automatically.
  if (await getPlatformFlag('quota.enforcePublicTrafficCap')) {
    const allowance = await isOverTrafficAllowance(store.organizationId)
    if (allowance.over) {
      return {
        blocked: (
          <AllowanceReachedPage reason={allowance.reason ?? 'traffic'} />
        ),
        scripts: null,
      }
    }
  }

  // `after()` callbacks cannot call `headers()`/`cookies()` themselves, so
  // everything they need is resolved now and captured in the closure.
  const headerList = await headers()
  const ip =
    headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headerList.get('x-real-ip') ??
    'unknown'
  const referrer = headerList.get('referer')
  const userAgent = headerList.get('user-agent') ?? ''

  const trackingConfig = trackingConfigFrom(store.id, integration)
  const cookieStore = trackingConfig ? await cookies() : null

  const pageUrl = `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${headerList.get('host') ?? input.fallbackHost}${input.path}`

  // One id per event per render, shared with the browser tag below so Meta
  // collapses its copy and ours into a single event.
  const eventIds = { pageView: randomUUID(), viewContent: randomUUID() }

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
        pageTitle: input.pageTitle,
        referrer,
        offer: input.offer,
        metaEventIds: eventIds,
      })
    })
  }

  after(async () => {
    await recordPageView({
      pageId: input.pageId,
      storeId: store.id,
      path: input.path,
      referrer,
      userAgent,
      ip,
    })

    // Plan metering, separate from the per-page analytics above: it is
    // organisation-scoped and feeds the quota checks, so it stays correct
    // even if a tenant deletes the page the view belonged to.
    await recordTraffic(
      store.organizationId,
      estimateHtmlBytes(
        input.sections as Parameters<typeof estimateHtmlBytes>[0]
      )
    )
    await recordVisit(store.organizationId, monthlyVisitorHash(ip, userAgent))
  })

  const scripts = integration ? (
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
          pageViewEventId: eventIds.pageView,
          viewContentEventId: input.offer ? eventIds.viewContent : null,
        }
      }
    />
  ) : null

  return { blocked: null, scripts }
}
