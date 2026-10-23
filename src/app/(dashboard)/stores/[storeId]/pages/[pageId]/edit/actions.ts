'use server'

import { revalidatePath } from 'next/cache'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  createPage,
  saveSectionsOfPages,
  SectionsChangedElsewhereError,
  type PageSectionsSave,
  type SectionSaveInput,
} from '@/server/services/pageService'
import { getPageStarter } from '@/modules/templates/page-starters'
import { publishSite } from '@/server/services/publishService'
import { updateDraftTheme } from '@/server/services/storeService'
import {
  updateThemeSchema,
  type UpdateThemeInput,
} from '@/lib/validation/theme'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import {
  loadStoreCatalogue,
  runProductQuery,
} from '@/server/services/storefrontService'
import { hasCatalogSource } from '@/server/catalog'
import {
  productQueryKey,
  type StoreProductCard,
  type StorefrontProductQuery,
} from '@/modules/sections/storefront'
import { sampleCardsFor } from '@/modules/storefront/sample'

/**
 * Saves the builder's draft.
 *
 * On a store the builder holds two pages at once — this one and the store's
 * shared layout — in one list, each section marked with where it belongs. They
 * are split here and saved to their own pages, so the header edited on the
 * home page is saved once, as the header every page wears.
 *
 * `expected` is each page's save count as the builder last knew it (from the
 * page load, then from each save's answer). When the AI editor or another tab
 * has saved either page since, nothing is written and `{ conflict: true }`
 * comes back: this tab's copy is out of date, and saving it would quietly put
 * back what the other one changed. Left out, the save goes ahead regardless.
 */
export async function saveSectionsAction(
  storeId: string,
  pageId: string,
  layoutPageId: string | null,
  sections: (SectionSaveInput & { scope?: 'page' | 'layout' })[],
  expected?: { page: number; layout: number | null }
): Promise<
  | {
      idMapping: Record<string, string>
      revisions: { page: number; layout: number | null }
    }
  | { conflict: true }
> {
  const { organization } = await getActiveOrganization()

  const own = sections.filter((section) => section.scope !== 'layout')
  const shared = sections.filter((section) => section.scope === 'layout')

  const saves: PageSectionsSave[] = [
    {
      pageId,
      sections: own.map((section, order) => ({ ...section, order })),
      expectedRevision: expected?.page,
    },
  ]
  if (layoutPageId && shared.length > 0) {
    saves.push({
      pageId: layoutPageId,
      sections: shared.map((section, order) => ({ ...section, order })),
      expectedRevision: expected?.layout ?? undefined,
    })
  }

  let saved
  try {
    saved = await saveSectionsOfPages(organization.id, storeId, saves)
  } catch (cause) {
    if (cause instanceof SectionsChangedElsewhereError)
      return { conflict: true }
    throw cause
  }
  const [page, layout] = saved

  // A layout left unsaved keeps the count the builder already had: this save
  // learned nothing about it, and reporting its current count instead would
  // tell the builder it is up to date with a layout it has not seen.
  let layoutRevision: number | null = layout?.revision ?? null
  if (!layout && layoutPageId) {
    layoutRevision =
      expected?.layout ??
      (
        await prisma.page.findFirst({
          where: { id: layoutPageId, storeId },
          select: { sectionsRevision: true },
        })
      )?.sectionsRevision ??
      null
  }

  revalidatePath(`/stores/${storeId}/pages/${pageId}/preview`)
  return {
    idMapping: { ...page!.idMapping, ...layout?.idMapping },
    revisions: { page: page!.revision, layout: layoutRevision },
  }
}

/** Puts the site live as the builder shows it. See `publishSite`. */
export async function publishSiteAction(
  storeId: string,
  pageId: string
): Promise<{ ok: true; published: number } | { ok: false; error: string }> {
  const { organization } = await getActiveOrganization()
  try {
    const result = await publishSite(organization.id, storeId, pageId)
    revalidatePath('/stores')
    revalidatePath(`/stores/${storeId}`)
    return { ok: true, published: result.published }
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : 'Could not publish',
    }
  }
}

const draftThemeSchema = updateThemeSchema.partial()

/** Saves the working theme from the Design panel. Not live until Publish. */
export async function saveDraftThemeAction(
  storeId: string,
  patch: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const parsed = draftThemeSchema.safeParse(patch)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid' }
  }
  // Only what the panel sent. `.partial()` still fills a field's default when
  // its key is missing, so a palette change also wrote heading weight 600,
  // normal text size, comfortable spacing and a sticky header — undoing those
  // settings on every site that had chosen otherwise, while the canvas went
  // on showing the old ones.
  const sent = Object.fromEntries(
    Object.entries(parsed.data).filter(([key]) => Object.hasOwn(patch, key))
  ) as Partial<UpdateThemeInput>
  const { organization } = await getActiveOrganization()
  await updateDraftTheme(organization.id, storeId, sent)
  return { ok: true }
}

/**
 * Products for the blocks on the canvas, as the merchant changes them.
 *
 * The canvas renders in the browser and cannot read the catalogue itself; when
 * a grid is pointed at a different category it asks here, by the same queries
 * the live site runs. A workspace with no products at all gets the samples, so
 * a new store is designed around something rather than around empty boxes.
 */
export async function canvasProductsAction(
  storeId: string,
  queries: StorefrontProductQuery[]
): Promise<Record<string, StoreProductCard[]>> {
  const { organization } = await getActiveOrganization()
  await requireOrgAccess(organization.id, 'VIEWER')
  const store = await prisma.store.findFirst({
    where: { id: storeId, organizationId: organization.id },
    select: { id: true },
  })
  if (!store) return {}

  const [catalogue, products, connected] = await Promise.all([
    loadStoreCatalogue(organization.id),
    prisma.product.count({ where: { organizationId: organization.id } }),
    hasCatalogSource(organization.id),
  ])
  const sample = products === 0 && !connected

  const answers: Record<string, StoreProductCard[]> = {}
  await Promise.all(
    queries.slice(0, 40).map(async (query) => {
      const key = productQueryKey(query)
      if (sample) {
        answers[key] = sampleCardsFor(query.limit, catalogue.currencyCode)
        return
      }
      answers[key] = await runProductQuery(organization.id, query).catch(
        () => []
      )
    })
  )
  return answers
}

/** Adds a page to a store from one of the starters, for the Pages panel. */
export async function createStorePageAction(
  storeId: string,
  starterKey: string,
  title: string
): Promise<{ ok: true; pageId: string } | { ok: false; error: string }> {
  const { organization } = await getActiveOrganization()
  const starter = getPageStarter(starterKey)
  const name = title.trim().slice(0, 150) || starter.title
  try {
    const page = await createPage(
      organization.id,
      storeId,
      // The starter goes along for its address: an About page on a Bangla
      // store lands at /about, where the header already links, not at /page.
      { title: name, starter },
      starter.sections
    )
    revalidatePath(`/stores/${storeId}`)
    return { ok: true, pageId: page.id }
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : 'Could not add the page',
    }
  }
}
