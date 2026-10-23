import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  QuotaExceededError,
  requireQuota,
} from '@/server/services/entitlementService'
import {
  loadStoreCatalogue,
  runProductQuery,
} from '@/server/services/storefrontService'
import { siteLanguage, type SiteLanguage } from '@/modules/sections/language'
import type { BusinessBrief } from '@/modules/sitespec/guide'

/**
 * The business side of the AI builder: who may use it, how often, and what it
 * is told about the shop.
 *
 * What a workspace may spend is its AI credits (aiCreditService). On top of
 * that, one person may start only a few requests a minute — no one designing
 * a site needs more, and it is a ceiling on what a stuck retry loop or a
 * compromised account can run through before anyone notices.
 */

const PER_MINUTE = 4

export async function checkAiAllowance(
  organizationId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireOrgAccess(organizationId, 'EDITOR')
  const minute = await checkRateLimit(
    `ai-design:user:${userId}`,
    PER_MINUTE,
    60
  )
  if (!minute.allowed) {
    return {
      ok: false,
      message:
        'That’s a lot of designs in a row — wait a minute and try again.',
    }
  }
  return { ok: true }
}

/**
 * Whether the workspace has room for one more site.
 *
 * Asked before a whole site is designed — by Claude or from a paste — because
 * the plan limit is otherwise only met at "Create", after the merchant has
 * waited for the design and, for the AI builder, after it has been paid for.
 * createStore still checks for itself; this is the early warning, and asks
 * what it asks: a site to spare, and a page for the new site's home page.
 */
export async function checkRoomForSite(
  organizationId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await requireQuota(organizationId, 'STORES')
    await requireQuota(organizationId, 'PAGES')
    return { ok: true }
  } catch (cause) {
    if (cause instanceof QuotaExceededError) {
      return { ok: false, message: cause.message }
    }
    throw cause
  }
}

/**
 * What the AI is told about this shop besides the owner's own words: its real
 * categories and some of its products, so a design links to what exists
 * instead of inventing a "Women's collection" the shop does not have.
 */
export async function shopBrief(
  organizationId: string,
  input: { request: string; language: SiteLanguage; storeName?: string | null }
): Promise<BusinessBrief> {
  const [catalogue, products] = await Promise.all([
    loadStoreCatalogue(organizationId).catch(() => null),
    runProductQuery(organizationId, { source: 'newest', limit: 20 }).catch(
      () => []
    ),
  ])
  return {
    request: input.request,
    language: input.language,
    storeName: input.storeName,
    categories: catalogue?.categories.map((category) => ({
      id: category.id,
      name: category.name,
      handle: category.handle,
    })),
    products: products.map((product) => ({
      id: product.id,
      title: product.title,
    })),
  }
}

/** The page being edited, checked against the workspace, with its site's facts. */
export async function pageForDesign(
  organizationId: string,
  storeId: string,
  pageId: string
) {
  const page = await prisma.page.findFirst({
    where: { id: pageId, storeId, store: { organizationId } },
    select: {
      id: true,
      title: true,
      role: true,
      store: {
        select: {
          id: true,
          name: true,
          kind: true,
          theme: { select: { language: true } },
        },
      },
    },
  })
  if (!page) return null
  return {
    id: page.id,
    title: page.title,
    role: page.role,
    storeId: page.store.id,
    storeName: page.store.name,
    kind: page.store.kind,
    language: siteLanguage(page.store.theme),
  }
}
