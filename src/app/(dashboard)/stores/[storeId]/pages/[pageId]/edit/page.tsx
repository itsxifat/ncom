import { notFound } from 'next/navigation'
import { aiBuilderAvailable } from '@/server/services/aiSettingsService'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  getLayoutPage,
  getPageWithSections,
  listPages,
} from '@/server/services/pageService'
import { BuilderShell } from '@/modules/builder/BuilderShell'
import {
  listPickerProducts,
  listSellableVariants,
} from '@/server/services/productService'
import {
  listOffersForPage,
  getPageCheckout,
} from '@/server/services/offerAdminService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { loadStoreCatalogue } from '@/server/services/storefrontService'
import { THEME_BOOKKEEPING } from '@/server/services/publishService'
import { getSectionDefinition } from '@/modules/sections/registry'
import type { BuilderSection } from '@/modules/builder/store'
import { toCheckoutDraft } from '@/modules/builder/offer-drafts'
import { env } from '@/lib/env'
import { saveCheckoutAction } from './offer-actions'
import {
  createStorePageAction,
  publishSiteAction,
  saveDraftThemeAction,
  saveSectionsAction,
} from './actions'

/**
 * The builder, open on one page of one site.
 *
 * On an online store the store's shared layout — announcement bar, header,
 * footer — is loaded alongside the page and drawn around it on the canvas, so
 * a merchant edits the header where they see it rather than on a page of its
 * own. Both save back to their own page; see saveSectionsAction.
 */
export default async function PageEditPage({
  params,
}: PageProps<'/stores/[storeId]/pages/[pageId]/edit'>) {
  const { storeId, pageId } = await params
  const { organization } = await getActiveOrganization()

  let page
  try {
    page = await getPageWithSections(organization.id, storeId, pageId)
  } catch {
    notFound()
  }

  if (!page.store.theme) {
    notFound()
  }
  // The layout is edited around other pages, never opened on its own.
  if (page.role === 'LAYOUT') notFound()

  const isStore = page.store.kind === 'STORE'

  const toBuilder = (
    section: (typeof page.sections)[number],
    scope?: 'layout'
  ): BuilderSection => ({
    id: section.id,
    type: section.type,
    order: section.order,
    content: section.content as Record<string, unknown>,
    config: (section.config ?? {}) as Record<string, unknown>,
    isVisible: section.isVisible,
    scope,
  })

  const [layout, pages, catalogue] = await Promise.all([
    isStore ? getLayoutPage(organization.id, storeId) : null,
    listPages(organization.id, storeId),
    isStore ? loadStoreCatalogue(organization.id) : null,
  ])

  const layoutSections = (layout?.sections ?? []).map((section) =>
    toBuilder(section, 'layout')
  )
  const placed = (where: 'top' | 'bottom') =>
    layoutSections.filter(
      (section) =>
        (getSectionDefinition(section.type)?.placement ?? 'bottom') === where
    )

  const initialSections = [
    ...placed('top'),
    ...page.sections.map((section) => toBuilder(section)),
    ...placed('bottom'),
  ]

  // Organisation-scoped: one catalogue serves every storefront. Passing a
  // storeId here matched no products and left the picker permanently empty.
  const [products, settings, picker] = await Promise.all([
    listSellableVariants(organization.id),
    getOrganizationSettings(organization.id),
    listPickerProducts(organization.id),
  ])
  const currencyCode = settings?.currencyCode ?? picker.currencyCode

  // The Delivery tab belongs to a landing page: how it charges to ship, what
  // it rewards a big basket with, and whether its order form has offers. A
  // store charges delivery from the workspace's own settings.
  const delivery = isStore
    ? undefined
    : await (async () => {
        const [offerRows, checkout] = await Promise.all([
          listOffersForPage(organization.id, pageId),
          getPageCheckout(organization.id, storeId, pageId),
        ])
        return {
          storeId,
          pageId,
          currencyCode,
          initialCheckout: toCheckoutDraft(checkout, currencyCode),
          offerCount: offerRows.filter((offer) => offer.isActive).length,
          saveCheckout: saveCheckoutAction,
        }
      })()

  const liveUrl = `http://${page.store.subdomain}.${env.ROOT_DOMAIN}`
  const published = pages.some((candidate) => candidate.status === 'PUBLISHED')
  // Saved after the last publish: a save touches its page's updatedAt, and a
  // publish writes both stamps in one update, a moment apart — hence the
  // allowance, so a page just published does not read as changed.
  const pagesDirty = [page, layout].some(
    (candidate) =>
      candidate &&
      (!candidate.publishedAt ||
        candidate.updatedAt.getTime() - candidate.publishedAt.getTime() > 2000)
  )
  // The look counts too: a Design-panel change saves to the working theme and
  // goes live on Publish, so a shop switched to Bangla or given a new palette
  // has changes to publish even when no block changed.
  const dirty = pagesDirty || themeDiffersFromLive(page.store.theme)

  return (
    <BuilderShell
      entityId={pageId}
      backHref={`/stores/${storeId}`}
      title={page.title}
      theme={page.store.theme}
      initialSections={initialSections}
      products={products}
      catalog={{
        products: picker.products,
        cursor: picker.nextCursor,
        currencyCode: picker.currencyCode,
      }}
      delivery={delivery}
      canvasSrc={`/builder-canvas/${pageId}`}
      onSave={saveSectionsAction.bind(
        null,
        storeId,
        pageId,
        layout?.id ?? null
      )}
      // The versions this builder opens on. Every save sends back the ones it
      // last saw, so a save on top of a change made since — by an AI editor,
      // another tab — is refused instead of quietly undoing that change.
      initialRevisions={{
        page: page.sectionsRevision,
        layout: layout?.sectionsRevision ?? null,
      }}
      site={{
        storeId,
        storeName: page.store.name,
        kind: page.store.kind,
        pageId,
        pageRole: page.role,
        pages: pages.map((candidate) => ({
          id: candidate.id,
          title: candidate.title,
          slug: candidate.slug,
          isHome: candidate.isHome,
          role: candidate.role,
          status: candidate.status,
        })),
        categories: (catalogue?.categories ?? []).map((category) => ({
          id: category.id,
          name: category.name,
          handle: category.handle,
          parentId: category.parentId,
        })),
        collections: (catalogue?.collections ?? []).map((collection) => ({
          id: collection.id,
          title: collection.title,
          handle: collection.handle,
        })),
        liveUrl,
        aiAvailable: await aiBuilderAvailable(),
      }}
      publish={publishSiteAction.bind(null, storeId, pageId)}
      saveTheme={saveDraftThemeAction.bind(null, storeId)}
      createPage={
        isStore ? createStorePageAction.bind(null, storeId) : undefined
      }
      previewHref={`/stores/${storeId}/pages/${pageId}/preview`}
      initiallyLive={published}
      initiallyDirty={dirty}
    />
  )
}

/**
 * Whether the working theme differs from the copy frozen at the last publish.
 *
 * Compared by value, not by timestamp: freezing the theme writes its row too,
 * so its `updatedAt` cannot tell a draft change from a publish. Only the
 * columns the frozen copy holds are compared — the live site reads any other
 * from the working columns as well — and a site never published has no frozen
 * copy: its visitors already see the working columns.
 */
function themeDiffersFromLive(theme: { liveTheme: unknown }): boolean {
  const frozen = theme.liveTheme
  if (!frozen || typeof frozen !== 'object' || Array.isArray(frozen)) {
    return false
  }
  const working = theme as unknown as Record<string, unknown>
  return Object.entries(frozen).some(
    ([key, value]) =>
      !(key in THEME_BOOKKEEPING) &&
      JSON.stringify(working[key] ?? null) !== JSON.stringify(value ?? null)
  )
}
