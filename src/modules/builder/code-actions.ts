'use server'

import { getActiveOrganization } from '@/server/services/organizationService'
import { requireOrgAccess } from '@/server/auth/rbac'
import { prisma } from '@/server/db/client'
import { getStorefrontCommerce } from '@/server/services/offerService'

export interface CodeHookOffer {
  key: string
  label: string
  priceCents: number
  compareAtCents: number
  isDefault: boolean
}

export interface CodeHookCommerce {
  currencyCode: string
  offers: CodeHookOffer[]
  /** The page's delivery areas, by name, cheapest first. */
  deliveryAreas: { label: string; priceCents: number }[]
}

/**
 * What a landing page sells, for the custom-code block's "Connect to your
 * shop" panel: the snippets it offers name this page's own offers, with
 * today's prices as their fallback text, so a merchant copying one gets
 * something that works and looks right in any preview.
 *
 * The same read the page renders from, so the panel and the page cannot
 * disagree about which offers exist.
 */
export async function pageOffersForCodeAction(
  storeId: string,
  pageId: string
): Promise<CodeHookCommerce | null> {
  const { organization } = await getActiveOrganization()
  await requireOrgAccess(organization.id, 'VIEWER')
  const page = await prisma.page.findFirst({
    where: { id: pageId, storeId, store: { organizationId: organization.id } },
    select: { id: true },
  })
  if (!page) return null

  const commerce = await getStorefrontCommerce(pageId, storeId, organization.id)
  return {
    currencyCode: commerce.currencyCode,
    offers: commerce.offers.map((offer) => ({
      key: offer.key,
      label: offer.label,
      priceCents: offer.headlinePriceCents,
      compareAtCents: offer.compareAtCents,
      isDefault: offer.isDefault,
    })),
    deliveryAreas: [...commerce.shipping.rates]
      .sort((a, b) => a.priceCents - b.priceCents)
      .map((rate) => ({ label: rate.label, priceCents: rate.priceCents })),
  }
}
