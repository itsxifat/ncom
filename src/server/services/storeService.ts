import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import {
  getEntitlements,
  requireFeature,
  requireQuota,
} from '@/server/services/entitlementService'
import { slugify, withRandomSuffix } from '@/lib/slug'
import { RESERVED_SUBDOMAINS } from '@/lib/reserved-subdomains'
import { DEFAULT_THEME } from '@/lib/default-theme'
import {
  freezeTheme,
  invalidateStoreCache,
  THEME_BOOKKEEPING,
} from './publishService'
import { invalidateDomainCache } from './siteHandleService'
import { encryptSecret } from '@/lib/crypto'
import { UNCHANGED_SECRET } from '@/lib/validation/integration'
import type {
  CreateStoreInput,
  UpdateStoreInput,
} from '@/lib/validation/store-core'
import type { UpdateThemeInput } from '@/lib/validation/theme'
import type { PageTheme } from '@/modules/sections/types'
import { materializeSection } from '@/modules/templates/materialize'
import { localizeTemplate, textIn } from '@/modules/templates/localize'
import type { SiteLanguage } from '@/modules/sections/language'
import {
  BLANK_LANDING,
  BLANK_STORE,
  getTemplate,
  type SiteTemplate,
} from '@/modules/templates'
import { PAGE_STARTERS } from '@/modules/templates/page-starters'
import { countPages } from './usageService'
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
    select: { id: true, subdomain: true },
  })
  if (!store) throw new Error('Store not found')

  const theme = await prisma.themeSettings.update({
    where: { storeId: store.id },
    data: input,
  })

  // This form has a Save button and no publish step, so saving here is the
  // merchant saying "make it so": the working copy goes live with it. (The
  // builder's Design panel writes the working copy only — see
  // updateDraftTheme — and its changes go live with Publish.)
  await freezeTheme(store.id)

  // Published pages read the store's theme live rather than the copy frozen
  // into their snapshot, so a brand change reaches every live page without a
  // republish — but only once the cached store row is dropped.
  await invalidateStoreCache(store.subdomain)

  return theme
}

/**
 * Changes the working theme from the builder, without touching the live site.
 *
 * The Design panel saves as the merchant tries things — a palette, then
 * another, then a font — and none of that should reach shoppers until they
 * press Publish, which freezes the working copy into the live one.
 *
 * A live site with no frozen copy would show shoppers the working columns —
 * this draft included — so one is taken first from the columns as they stand,
 * which is what the site shows today. Every publish freezes the theme and
 * sites live before the frozen copy existed were given one, so this is the
 * guard for a site that somehow slipped through, not the usual path.
 */
export async function updateDraftTheme(
  organizationId: string,
  storeId: string,
  patch: Partial<UpdateThemeInput>
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  const store = await prisma.store.findFirst({
    where: { id: storeId, organizationId },
    select: {
      id: true,
      theme: { select: { liveTheme: true } },
      pages: { where: { status: 'PUBLISHED' }, select: { id: true }, take: 1 },
    },
  })
  if (!store) throw new Error('Store not found')
  if (store.theme && store.theme.liveTheme === null && store.pages.length > 0) {
    await freezeTheme(store.id)
  }
  return prisma.themeSettings.update({
    where: { storeId: store.id },
    data: patch,
  })
}

/**
 * The store's integration settings for the settings screen.
 *
 * The two encrypted credentials are reported as booleans and never returned,
 * not even to the merchant who typed them. There is no reason for a Server
 * Component to hold a decrypted access token in order to render "configured",
 * and a value that is never sent to a page cannot leak through one.
 */
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

  const config = await prisma.storeIntegrationConfig.findUnique({
    where: { storeId },
    select: {
      gaMeasurementId: true,
      gtmContainerId: true,
      metaPixelId: true,
      customHeadScript: true,
      metaTestEventCode: true,
      metaAccessToken: true,
      ga4ApiSecret: true,
      updatedAt: true,
    },
  })
  if (!config) return null

  const { metaAccessToken, ga4ApiSecret, ...rest } = config
  return {
    ...rest,
    hasMetaAccessToken: Boolean(metaAccessToken),
    hasGa4ApiSecret: Boolean(ga4ApiSecret),
  }
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
  // Server-side reporting is part of the same line on the price sheet as the
  // tag it pairs with, so it is gated by the same key rather than a new one.
  // Only a *newly typed* credential is checked: the masked placeholder and an
  // empty box both mean the merchant is not switching anything on, and a
  // downgraded tenant must still be able to clear what they can no longer use.
  if (isNewSecret(input.metaAccessToken)) {
    await requireFeature(organizationId, 'META_PIXEL')
  }
  if (isNewSecret(input.ga4ApiSecret)) {
    await requireFeature(organizationId, 'GOOGLE_ANALYTICS')
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
    metaTestEventCode: input.metaTestEventCode || null,
  }

  // Secrets are folded in separately because "absent from the form" and
  // "cleared by the merchant" are different intentions and the same empty
  // string. See `secretUpdate`.
  const secrets = {
    metaAccessToken: secretUpdate(input.metaAccessToken),
    ga4ApiSecret: secretUpdate(input.ga4ApiSecret),
  }

  return prisma.storeIntegrationConfig.upsert({
    where: { storeId },
    create: {
      storeId,
      ...data,
      metaAccessToken: secrets.metaAccessToken ?? null,
      ga4ApiSecret: secrets.ga4ApiSecret ?? null,
    },
    update: {
      ...data,
      // `undefined` leaves the stored ciphertext untouched, which is what an
      // untouched masked field has to mean — saving the pixel id must not
      // silently wipe the token that makes it work.
      ...(secrets.metaAccessToken === undefined
        ? {}
        : { metaAccessToken: secrets.metaAccessToken }),
      ...(secrets.ga4ApiSecret === undefined
        ? {}
        : { ga4ApiSecret: secrets.ga4ApiSecret }),
    },
  })
}

/**
 * Turns a submitted secret field into a database value.
 *
 * Three outcomes, and the distinction between them is the whole point:
 * `undefined` keeps what is stored (the merchant did not touch the masked
 * field), `null` clears it (they emptied it on purpose, which is how
 * server-side tracking is switched off), and a string replaces it.
 */
function secretUpdate(
  submitted: string | undefined
): string | null | undefined {
  if (!isNewSecret(submitted)) {
    return submitted === '' ? null : undefined
  }
  return encryptSecret(submitted)
}

/** Whether the merchant actually typed a new credential into this field. */
function isNewSecret(submitted: string | undefined): submitted is string {
  return Boolean(submitted) && submitted !== UNCHANGED_SECRET
}

export async function createStore(
  organizationId: string,
  input: CreateStoreInput,
  /** A design made for this site, used in place of `templateKey`. */
  design?: SiteTemplate
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

  const kind = input.kind ?? 'LANDING'
  // A design written for this site alone — by the AI builder, or pasted in
  // from the merchant's own AI — arrives as a template object of its own and
  // goes through exactly the path a gallery template does.
  const template =
    design ??
    getTemplate(input.templateKey) ??
    (kind === 'STORE' ? BLANK_STORE : BLANK_LANDING)
  if (template.kind !== kind) {
    throw new Error('That template is for a different kind of site')
  }

  // Pages a merchant can open count against their plan; the store's layout,
  // product page and catalogue page do not (see countPages). A template's
  // extra pages — about, contact — are made only while the plan has room, so
  // a plan with one page still gets a whole working store, just without them.
  const room = await standardPageRoom(organizationId)
  if (room < 1) {
    // The home page alone is over the limit: say so in the plan's own words.
    await requireQuota(organizationId, 'PAGES')
  }

  return provisionStore({
    organizationId,
    name: input.name,
    subdomain,
    currencyCode: input.currencyCode ?? 'USD',
    kind,
    template: localizeTemplate(template, input.language ?? 'en'),
    language: input.language ?? 'en',
    pageRoom: room,
  })
}

/** How many more standard pages the plan allows. Infinity when unlimited. */
async function standardPageRoom(organizationId: string): Promise<number> {
  const entitlements = await getEntitlements(organizationId)
  if (entitlements.quotaEnforcementDisabled) return Infinity
  const limit = entitlements.quotas.PAGES
  if (limit === null) return Infinity
  return Math.max(0, limit - (await countPages(organizationId)))
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
  kind: 'LANDING' | 'STORE'
  /** Already in the site's language — see `localizeTemplate`. */
  template: SiteTemplate
  language: SiteLanguage
  /** Standard pages the plan still allows. */
  pageRoom: number
}) {
  return prisma.$transaction(async (tx) => {
    const store = await tx.store.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        subdomain: input.subdomain,
        kind: input.kind,
        templateKey: input.template.key,
        theme: {
          create: { ...DEFAULT_THEME, ...templateThemeColumns(input.template) },
        },
      },
    })

    await provisionCommerce(
      tx,
      input.organizationId,
      input.name,
      input.currencyCode
    )

    // The home page first, so it is the one kept when the plan has room for
    // only one; the store's own design pages are always made.
    let room = Math.max(1, input.pageRoom)
    const pages = [...input.template.pages]
      .sort((a, b) => Number(Boolean(b.isHome)) - Number(Boolean(a.isHome)))
      .filter((page) => {
        if ((page.role ?? 'STANDARD') !== 'STANDARD') return true
        if (room < 1) return false
        room -= 1
        return true
      })

    // The header, footer and announcement bar link to the template's About,
    // Contact and Delivery pages. When the plan had no room for those, the
    // links go too — a shopper clicking "Contact" on a brand-new shop and
    // getting "page not found" thinks the shop is not real. The same goes for
    // the starter pages a blank store links to by default and does not have.
    const made = new Set(
      pages
        .filter((page) => (page.role ?? 'STANDARD') === 'STANDARD')
        .map((page) => page.slug)
    )
    const missing = new Set(
      [
        ...input.template.pages
          .filter((page) => (page.role ?? 'STANDARD') === 'STANDARD')
          .map((page) => page.slug),
        ...PAGE_STARTERS.map((starter) => starter.slug),
      ].filter((slug) => !made.has(slug))
    )

    for (const page of pages) {
      const role = page.role ?? 'STANDARD'
      await tx.page.create({
        data: {
          storeId: store.id,
          title: textIn(page.title, input.language),
          slug: page.slug,
          role,
          isHome: role === 'STANDARD' && Boolean(page.isHome),
          seoTitle: page.seo?.title?.slice(0, 70) || null,
          seoDescription: page.seo?.description?.slice(0, 300) || null,
          sections: {
            create: page.sections.map((section, order) => {
              const row = materializeSection(section, input.language)
              return {
                ...row,
                content: withoutLinksTo(row.content, missing) as object,
                order,
              }
            }),
          },
        },
      })
    }

    return store
  })
}

/**
 * A block's content with its links to pages the store does not have taken out.
 *
 * A link in a list — a menu item, a footer link — is dropped, and a list of
 * links left empty by that (a footer column) goes with it. Anything else that
 * merely carries a link, such as an announcement or a button, keeps its words
 * and loses only the address.
 */
function withoutLinksTo(value: unknown, missing: Set<string>): unknown {
  if (missing.size === 0) return value
  if (Array.isArray(value)) {
    const kept: unknown[] = []
    for (const item of value) {
      if (isLinkItem(item) && pointsAt(item.href, missing)) continue
      const pruned = withoutLinksTo(item, missing)
      if (emptiedByPruning(item, pruned)) continue
      kept.push(pruned)
    }
    return kept
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, field]) => [
        key,
        (key === 'href' || key.endsWith('Href')) &&
        typeof field === 'string' &&
        pointsAt(field, missing)
          ? ''
          : withoutLinksTo(field, missing),
      ])
    )
  }
  return value
}

/** `{ label, href }` and nothing more: a link whose only job is linking. */
function isLinkItem(item: unknown): item is { label: unknown; href: string } {
  return (
    isRecord(item) &&
    typeof item.href === 'string' &&
    Object.keys(item).every((key) => key === 'label' || key === 'href')
  )
}

/** Whether a list in this item had entries and pruning left it with none. */
function emptiedByPruning(before: unknown, after: unknown): boolean {
  if (!isRecord(before) || !isRecord(after)) return false
  return Object.entries(before).some(([key, field]) => {
    const now = after[key]
    return (
      Array.isArray(field) &&
      field.length > 0 &&
      Array.isArray(now) &&
      now.length === 0
    )
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** "/about", "/about/" or "/about#team" when "about" is a missing page. */
function pointsAt(href: string, missing: Set<string>): boolean {
  const match = /^\/([a-z0-9-]+)\/?(?:[?#].*)?$/.exec(href.trim())
  return Boolean(match && missing.has(match[1]!))
}

/**
 * The theme columns a template sets, and nothing else.
 *
 * A gallery template only ever names columns, but a design an AI wrote is
 * data from outside the codebase, and an unknown key here would fail the
 * whole transaction rather than be ignored.
 */
function templateThemeColumns(template: SiteTemplate) {
  const theme = template.theme
  return {
    primaryColor: theme.primaryColor,
    secondaryColor: theme.secondaryColor,
    backgroundColor: theme.backgroundColor,
    textColor: theme.textColor,
    headingFont: theme.headingFont,
    bodyFont: theme.bodyFont,
    ...(theme.buttonStyle && { buttonStyle: theme.buttonStyle }),
    ...(theme.borderRadius && { borderRadius: theme.borderRadius }),
    ...(theme.headingWeight && { headingWeight: theme.headingWeight }),
    ...(theme.containerWidth && { containerWidth: theme.containerWidth }),
    ...(theme.spacingScale && { spacingScale: theme.spacingScale }),
    ...(theme.sectionSpacing && { sectionSpacing: theme.sectionSpacing }),
    ...(theme.bodyScale && { bodyScale: theme.bodyScale }),
    ...(theme.showStickyHeader !== undefined && {
      showStickyHeader: theme.showStickyHeader,
    }),
    ...(theme.logoUrl && { logoUrl: theme.logoUrl }),
    ...(theme.logoWidth && { logoWidth: theme.logoWidth }),
    ...(theme.faviconUrl && { faviconUrl: theme.faviconUrl }),
    ...(theme.customCss && { customCss: theme.customCss }),
    language: theme.language ?? 'en',
    numerals: theme.numerals ?? 'latin',
  }
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
    language: theme.language === 'bn' ? 'bn' : 'en',
    numerals: theme.numerals === 'bangla' ? 'bangla' : 'latin',
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
    select: { id: true, subdomain: true },
  })
  if (!store) throw new Error('Store not found')

  if (input.subdomain) {
    const collision = await prisma.store.findFirst({
      where: { subdomain: input.subdomain, NOT: { id: store.id } },
      select: { id: true },
    })
    if (collision) throw new Error('This subdomain is already taken')
  }

  const updated = await prisma.store.update({
    where: { id: store.id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.subdomain ? { subdomain: input.subdomain } : {}),
    },
  })

  // The live header and every tab title read the name from the cached row, so
  // a rename stayed invisible for five minutes without this — and the old
  // address went on opening the shop for as long.
  await invalidateStoreCache(store.subdomain)
  if (updated.subdomain !== store.subdomain) {
    // A store deleted within the cache's lifetime may have left a row under
    // the new address; and the store's own domains still point at the old one.
    await invalidateStoreCache(updated.subdomain)
    const domains = await prisma.customDomain.findMany({
      where: { storeId: store.id },
      select: { hostname: true },
    })
    await Promise.all(
      domains.map((domain) => invalidateDomainCache(domain.hostname))
    )
  }

  return updated
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
    include: {
      // Every design column, not a list of them: a hand-kept list left out
      // the language and numerals, so a copy of a Bangla shop came out in
      // English with Latin digits, and the logo, favicon and heading weight
      // went missing with them. The live copy stays behind too — the copy has
      // never been published, and its first publish freezes its own.
      theme: { omit: THEME_BOOKKEEPING },
      pages: { include: { sections: true } },
    },
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
        // A copy of a store is a store: its layout, product page and
        // catalogue page come with it, and only make sense if it is one.
        kind: original.kind,
        templateKey: original.templateKey,
        theme: original.theme
          ? { create: original.theme }
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
          role: page.role,
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
