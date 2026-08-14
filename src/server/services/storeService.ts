import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import {
  requireFeature,
  requireQuota,
} from '@/server/services/entitlementService'
import { slugify, withRandomSuffix } from '@/lib/slug'
import { RESERVED_SUBDOMAINS } from '@/lib/reserved-subdomains'
import { DEFAULT_THEME } from '@/lib/default-theme'
import type {
  CreateStoreInput,
  UpdateStoreInput,
} from '@/lib/validation/store-core'
import type { UpdateThemeInput } from '@/lib/validation/theme'
import type { PageTheme } from '@/modules/sections/types'
import type { UpdateIntegrationInput } from '@/lib/validation/integration'

async function uniqueSubdomain(base: string): Promise<string> {
  let baseSlug = slugify(base) || 'site'
  if (baseSlug.length < 3) baseSlug = `${baseSlug}-site`
  if (RESERVED_SUBDOMAINS.has(baseSlug)) baseSlug = withRandomSuffix(baseSlug)

  const existing = await prisma.store.findUnique({
    where: { subdomain: baseSlug },
    select: { id: true },
  })
  if (!existing) return baseSlug

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = withRandomSuffix(baseSlug)
    const collision = await prisma.store.findUnique({
      where: { subdomain: candidate },
      select: { id: true },
    })
    if (!collision) return candidate
  }

  throw new Error('Could not generate a unique subdomain')
}

export async function listStores(organizationId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  return prisma.store.findMany({
    where: { organizationId },
    include: { _count: { select: { pages: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getStore(organizationId: string, storeId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const store = await prisma.store.findFirst({
    where: { id: storeId, organizationId },
  })
  if (!store) throw new Error('Store not found')
  return store
}

export async function getStoreTheme(organizationId: string, storeId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const theme = await prisma.themeSettings.findFirst({
    where: { store: { id: storeId, organizationId } },
  })
  if (!theme) throw new Error('Theme not found')
  return theme
}

export async function updateStoreTheme(
  organizationId: string,
  storeId: string,
  input: UpdateThemeInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const store = await prisma.store.findFirst({
    where: { id: storeId, organizationId },
    select: { id: true },
  })
  if (!store) throw new Error('Store not found')

  return prisma.themeSettings.update({
    where: { storeId: store.id },
    data: input,
  })
}

export async function getStoreIntegration(
  organizationId: string,
  storeId: string
) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const store = await prisma.store.findFirst({
    where: { id: storeId, organizationId },
    select: { id: true },
  })
  if (!store) throw new Error('Store not found')

  return prisma.storeIntegrationConfig.findUnique({ where: { storeId } })
}

export async function updateStoreIntegration(
  organizationId: string,
  storeId: string,
  input: UpdateIntegrationInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const store = await prisma.store.findFirst({
    where: { id: storeId, organizationId },
    select: { id: true },
  })
  if (!store) throw new Error('Store not found')

  // Each analytics integration is a separate line on the price sheet, so each
  // is gated separately — and only when the tenant is actually setting one.
  // Checking unconditionally would stop a Free tenant from clearing a field they
  // filled in while on a higher plan.
  if (input.gaMeasurementId) {
    await requireFeature(organizationId, 'GOOGLE_ANALYTICS')
  }
  if (input.gtmContainerId) {
    await requireFeature(organizationId, 'GOOGLE_TAG_MANAGER')
  }
  if (input.metaPixelId) {
    await requireFeature(organizationId, 'META_PIXEL')
  }
  // A custom head script is how every one of the above could be added by hand,
  // so it sits behind the broadest of them rather than being ungated.
  if (input.customHeadScript) {
    await requireFeature(organizationId, 'GOOGLE_TAG_MANAGER')
  }

  const data = {
    gaMeasurementId: input.gaMeasurementId || null,
    gtmContainerId: input.gtmContainerId || null,
    metaPixelId: input.metaPixelId || null,
    customHeadScript: input.customHeadScript || null,
  }

  return prisma.storeIntegrationConfig.upsert({
    where: { storeId },
    create: { storeId, ...data },
    update: data,
  })
}

export async function createStore(
  organizationId: string,
  input: CreateStoreInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  await requireQuota(organizationId, 'STORES')

  const subdomain = input.subdomain
    ? input.subdomain
    : await uniqueSubdomain(input.name)

  if (input.subdomain) {
    const collision = await prisma.store.findUnique({
      where: { subdomain: input.subdomain },
      select: { id: true },
    })
    if (collision) throw new Error('This subdomain is already taken')
  }

  return provisionStore({
    organizationId,
    name: input.name,
    subdomain,
    currencyCode: input.currencyCode ?? 'USD',
  })
}

/**
 * Creates a store with everything it needs to sell, in one transaction.
 *
 * Commerce is not an opt-in extra any more — every store on the platform is an
 * ecommerce store, so provisioning it lazily behind an "enable" button only
 * ever produced a half-built store and a dead end. A store therefore arrives
 * with:
 *
 *   - a theme, so pages render
 *   - store settings, so prices have a currency
 *   - a stock location, because a product needs somewhere to live
 *   - a rest-of-world shipping zone with a free rate, because the pricing
 *     engine reports shipping as unavailable (and blocks checkout) for a
 *     destination with no matching rate
 *   - cash on delivery, enabled, so the very first order can actually be placed
 *   - starter theme code as drafts, unpublished
 *
 * The result is a store that can take a real order the moment a product is
 * added, with no further setup.
 */
async function provisionStore(input: {
  organizationId: string
  name: string
  subdomain: string
  currencyCode: string
}) {
  return prisma.$transaction(async (tx) => {
    const store = await tx.store.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        subdomain: input.subdomain,
        theme: { create: DEFAULT_THEME },
      },
    })

    await provisionCommerce(
      tx,
      input.organizationId,
      input.name,
      input.currencyCode
    )

    return store
  })
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Everything a store needs before it can take an order.
 *
 * Shared by plain creation and template-based creation — a store built from a
 * template is no less a store, and forgetting this here is exactly how a
 * merchant ends up with a beautiful storefront that cannot check out.
 */
export async function provisionCommerce(
  tx: Tx,
  organizationId: string,
  name: string,
  currencyCode: string
) {
  // Idempotent: commerce belongs to the organisation, so the second and third
  // store a merchant creates must reuse the existing catalogue, inventory and
  // payment configuration rather than quietly creating a parallel set.
  const existing = await tx.organizationSettings.findUnique({
    where: { organizationId },
    select: { organizationId: true },
  })
  if (existing) return

  await tx.organizationSettings.create({
    data: { organizationId, currencyCode, businessName: name },
  })

  await tx.location.create({
    data: { organizationId, name: 'Default location' },
  })

  const zone = await tx.shippingZone.create({
    data: { organizationId, name: 'Rest of world', countryCodes: [] },
  })

  await tx.shippingRate.create({
    data: {
      zoneId: zone.id,
      name: 'Standard shipping',
      priceCents: 0,
      description: 'Free shipping',
    },
  })

  // Cash on delivery needs no credentials, so it is the one method that can be
  // switched on for the merchant rather than by them.
  await tx.paymentProviderConfig.create({
    data: {
      organizationId,
      provider: 'CASH_ON_DELIVERY',
      displayName: 'Cash on delivery',
      isEnabled: true,
      testMode: false,
    },
  })
}

/**
 * Narrows a render-time PageTheme to the columns ThemeSettings actually has.
 *
 * PageTheme carries resolved values that are not stored (`logoUrl`) and allows
 * nulls where the column does not, so a theme coming back from a template's
 * JSON cannot be handed to Prisma directly.
 */
export function themeToCreateInput(theme: PageTheme) {
  return {
    primaryColor: theme.primaryColor,
    secondaryColor: theme.secondaryColor,
    backgroundColor: theme.backgroundColor,
    textColor: theme.textColor,
    headingFont: theme.headingFont,
    bodyFont: theme.bodyFont,
    buttonStyle: theme.buttonStyle,
    borderRadius: theme.borderRadius,
    spacingScale: theme.spacingScale,
    containerWidth: theme.containerWidth,
    customCss: theme.customCss ?? null,
    logoWidth: theme.logoWidth ?? 140,
    headingWeight: theme.headingWeight ?? '600',
    bodyScale: theme.bodyScale ?? '1',
    sectionSpacing: theme.sectionSpacing ?? 'comfortable',
    showStickyHeader: theme.showStickyHeader ?? true,
  }
}

export async function updateStore(
  organizationId: string,
  storeId: string,
  input: UpdateStoreInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const store = await prisma.store.findFirst({
    where: { id: storeId, organizationId },
    select: { id: true },
  })
  if (!store) throw new Error('Store not found')

  if (input.subdomain) {
    const collision = await prisma.store.findFirst({
      where: { subdomain: input.subdomain, NOT: { id: store.id } },
      select: { id: true },
    })
    if (collision) throw new Error('This subdomain is already taken')
  }

  return prisma.store.update({
    where: { id: store.id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.subdomain ? { subdomain: input.subdomain } : {}),
    },
  })
}

export async function deleteStore(organizationId: string, storeId: string) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const store = await prisma.store.findFirst({
    where: { id: storeId, organizationId },
    select: { id: true },
  })
  if (!store) throw new Error('Store not found')

  await prisma.store.delete({ where: { id: store.id } })
}

export async function duplicateStore(organizationId: string, storeId: string) {
  await requireOrgAccess(organizationId, 'EDITOR')

  const original = await prisma.store.findFirst({
    where: { id: storeId, organizationId },
    include: { theme: true, pages: { include: { sections: true } } },
  })
  if (!original) throw new Error('Store not found')

  const subdomain = await uniqueSubdomain(`${original.name}-copy`)

  return prisma.$transaction(async (tx) => {
    const copy = await tx.store.create({
      data: {
        organizationId,
        name: `${original.name} (Copy)`,
        subdomain,
        isSearchIndexable: original.isSearchIndexable,
        theme: original.theme
          ? {
              create: {
                primaryColor: original.theme.primaryColor,
                secondaryColor: original.theme.secondaryColor,
                backgroundColor: original.theme.backgroundColor,
                textColor: original.theme.textColor,
                headingFont: original.theme.headingFont,
                bodyFont: original.theme.bodyFont,
                buttonStyle: original.theme.buttonStyle,
                borderRadius: original.theme.borderRadius,
                spacingScale: original.theme.spacingScale,
                containerWidth: original.theme.containerWidth,
                customCss: original.theme.customCss,
              },
            }
          : { create: DEFAULT_THEME },
      },
    })

    for (const page of original.pages) {
      const newPage = await tx.page.create({
        data: {
          storeId: copy.id,
          slug: page.slug,
          title: page.title,
          isHome: page.isHome,
          seoTitle: page.seoTitle,
          seoDescription: page.seoDescription,
          robotsIndex: page.robotsIndex,
        },
      })

      if (page.sections.length > 0) {
        await tx.pageSection.createMany({
          data: page.sections.map((section) => ({
            pageId: newPage.id,
            type: section.type,
            order: section.order,
            content: section.content as object,
            config: section.config as object,
            isVisible: section.isVisible,
          })),
        })
      }
    }

    return copy
  })
}
