import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import {
  requireFeature,
  requireQuota,
} from '@/server/services/entitlementService'
import { slugify, withRandomSuffix } from '@/lib/slug'
import { resolveRange } from '@/lib/date-range'
import type { CreatePageInput, UpdatePageSeoInput } from '@/lib/validation/page'
import { STORE_ROUTE_SEGMENTS } from '@/modules/sections/storefront'
import { materializeSection } from '@/modules/templates/materialize'
import { siteLanguage } from '@/modules/sections/language'
import { textIn, type Localized } from '@/modules/templates/localize'
import type { TemplateSection } from '@/modules/templates/types'
import type { PageStarter } from '@/modules/templates/page-starters'

async function assertStoreInOrg(organizationId: string, storeId: string) {
  const store = await prisma.store.findFirst({
    where: { id: storeId, organizationId },
    select: { id: true },
  })
  if (!store) throw new Error('Store not found')
}

/**
 * The addresses a new page may get when the merchant did not type one, best
 * first; `uniquePageSlug` takes the first that is free.
 *
 * A starter's own address comes first whenever the page is still that starter —
 * its name kept, or written in Bangla, which no address can spell. The
 * templates' headers and footers link to /about, /contact and /delivery, so an
 * About page added later in either language lands where those links already
 * point, rather than at /about-us, or at /page because every Bangla letter was
 * dropped. A page renamed in Latin letters goes by its new name, and a Bangla
 * name with no starter behind it is spelled out in Latin letters, which a
 * shopper can at least read. When the best address is taken — a second "About
 * us" — the next readable one is used before any random suffix is.
 */
function pageSlugCandidates(
  title: string,
  starter?: Pick<PageStarter, 'key' | 'title' | 'slug'>
): string[] {
  const latin = slugify(title)
  const spelled = slugify(romanizeBangla(title))
  const starterSlug = starter && starter.key !== 'blank' ? starter.slug : ''
  const starterName =
    starter &&
    [textIn(starter.title, 'en'), textIn(starter.title, 'bn')].includes(title)
      ? starter.slug
      : null
  const candidates = starterName
    ? [starterName, latin, spelled]
    : latin
      ? [latin, starterSlug, spelled]
      : [starterSlug, spelled]
  candidates.push(starter?.slug ?? '', 'page')
  return [...new Set(candidates.filter(Boolean))]
}

/** "ক k খ kh" -> { ক: 'k', খ: 'kh' }: a letter table that reads as one. */
function letterTable(pairs: string): Record<string, string> {
  const words = pairs.trim().split(/\s+/)
  const table: Record<string, string> = {}
  for (let index = 0; index < words.length; index += 2) {
    table[words[index]!] = words[index + 1]!
  }
  return table
}

const BANGLA_VOWELS = letterTable(
  'অ o আ a ই i ঈ i উ u ঊ u ঋ ri এ e ঐ oi ও o ঔ ou'
)
const BANGLA_VOWEL_SIGNS = letterTable(
  'া a ি i ী i ু u ূ u ৃ ri ে e ৈ oi ো o ৌ ou'
)
const BANGLA_CONSONANTS = letterTable(`
  ক k খ kh গ g ঘ gh ঙ ng চ ch ছ chh জ j ঝ jh ঞ n ট t ঠ th ড d ঢ dh ণ n
  ত t থ th দ d ধ dh ন n প p ফ f ব b ভ bh ম m য j র r ল l শ sh ষ sh স s
  হ h ৎ t
`)
/** ড় ঢ় য়: the letter with a dot below, which NFC always writes as two. */
const BANGLA_DOTTED = letterTable('ড r ঢ rh য y')
/** Anusvara and visarga; chandrabindu, only a nasal tone, is dropped. */
const BANGLA_MARKS: Record<string, string> = {
  ...letterTable('ং ng ঃ h'),
  '\u0981': '',
}
const HASANTA = '\u09CD'
const NUKTA = '\u09BC'

/**
 * Bangla spelled roughly in Latin letters, for an address: "যোগাযোগ" becomes
 * "jogajog", "বিশেষ অফার" becomes "bishesh ofar". Not a transliteration
 * standard — just enough that /amader-golp says something /page does not.
 */
function romanizeBangla(text: string): string {
  const letters = [...text.normalize('NFC')]
  let out = ''
  letters.forEach((letter, index) => {
    if (letter === HASANTA || letter === NUKTA) return
    const dotted = letters[index + 1] === NUKTA
    const next = letters[index + (dotted ? 2 : 1)]
    const consonant = dotted
      ? (BANGLA_DOTTED[letter] ?? BANGLA_CONSONANTS[letter])
      : BANGLA_CONSONANTS[letter]
    if (consonant !== undefined) {
      // য after a hasanta is the "y" of ক্যা, not a "j" of its own.
      out += letter === 'য' && letters[index - 1] === HASANTA ? 'y' : consonant
      // The inherent vowel is heard before another letter, not at a word's
      // end or where a vowel sign or hasanta replaces it.
      const voiced =
        letter !== 'ৎ' &&
        next !== undefined &&
        (BANGLA_CONSONANTS[next] !== undefined ||
          BANGLA_VOWELS[next] !== undefined ||
          BANGLA_MARKS[next] !== undefined)
      if (voiced) out += 'o'
      return
    }
    const digit = '০১২৩৪৫৬৭৮৯'.indexOf(letter)
    if (digit >= 0) {
      out += String(digit)
      return
    }
    out +=
      BANGLA_VOWELS[letter] ??
      BANGLA_VOWEL_SIGNS[letter] ??
      BANGLA_MARKS[letter] ??
      letter
  })
  return out
}

async function uniquePageSlug(
  storeId: string,
  candidates: string[],
  reserved: Set<string> = new Set()
): Promise<string> {
  const slugs = candidates
    .map((candidate) => slugify(candidate))
    .filter(Boolean)
    .map((slug) => (reserved.has(slug) ? `${slug}-page` : slug))
  if (slugs.length === 0) slugs.push('page')

  const taken = new Set(
    (
      await prisma.page.findMany({
        where: { storeId, slug: { in: slugs } },
        select: { slug: true },
      })
    ).map((page) => page.slug)
  )
  const free = slugs.find((slug) => !taken.has(slug))
  if (free) return free

  const baseSlug = slugs[0]!
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = withRandomSuffix(baseSlug)
    const collision = await prisma.page.findUnique({
      where: { storeId_slug: { storeId, slug: candidate } },
      select: { id: true },
    })
    if (!collision) return candidate
  }

  throw new Error('Could not generate a unique page slug')
}

/**
 * Visits and orders per page over the last seven Dhaka days, for the page
 * cards. A page's worth is the orders it brings in, and a card that shows it
 * next to the Edit button is the nudge to fix the page that gets visits and no
 * orders. Cancelled orders are left out: a refused parcel was not a sale.
 */
export async function getRecentPageStats(
  organizationId: string
): Promise<Map<string, { visits: number; orders: number }>> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const week = resolveRange({ range: 'last_7_days' })
  const createdAt = { gte: week.start ?? undefined, lt: week.end }

  const [visits, orders] = await Promise.all([
    prisma.pageView.groupBy({
      by: ['pageId'],
      where: { store: { organizationId }, createdAt },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['pageId'],
      where: {
        organizationId,
        cancelledAt: null,
        pageId: { not: null },
        createdAt,
      },
      _count: { _all: true },
    }),
  ])

  const stats = new Map<string, { visits: number; orders: number }>()
  for (const row of visits) {
    stats.set(row.pageId, { visits: row._count._all, orders: 0 })
  }
  for (const row of orders) {
    if (!row.pageId) continue
    const entry = stats.get(row.pageId) ?? { visits: 0, orders: 0 }
    entry.orders = row._count._all
    stats.set(row.pageId, entry)
  }
  return stats
}

export async function listPages(organizationId: string, storeId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')
  await assertStoreInOrg(organizationId, storeId)

  // The layout is edited inside the builder, around whichever page is open;
  // listed on its own it would be a page with a header and nothing under it.
  // A store's product and catalogue designs come after its own pages.
  const pages = await prisma.page.findMany({
    where: { storeId, role: { not: 'LAYOUT' } },
    orderBy: [{ isHome: 'desc' }, { createdAt: 'asc' }],
  })
  const rank = { STANDARD: 0, PRODUCT: 1, CATALOG: 2, LAYOUT: 3 } as const
  return pages.sort((a, b) => rank[a.role] - rank[b.role])
}

/** A store's layout page, which holds its header and footer. */
export async function getLayoutPage(organizationId: string, storeId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')
  await assertStoreInOrg(organizationId, storeId)
  return prisma.page.findFirst({
    where: { storeId, role: 'LAYOUT' },
    include: { sections: { orderBy: { order: 'asc' } } },
  })
}

export async function createPage(
  organizationId: string,
  storeId: string,
  /**
   * The title may be a starter's bilingual pair; see templates/localize. The
   * starter the page is made from, when there is one, gives it its address
   * when no slug is typed — see `pageSlugBase`.
   */
  input: Omit<CreatePageInput, 'title'> & {
    title: string | Localized
    starter?: Pick<PageStarter, 'key' | 'title' | 'slug'>
  },
  /** What the page starts with — a starter's blocks. Empty when omitted. */
  sections: TemplateSection[] = []
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  await assertStoreInOrg(organizationId, storeId)

  const store = await prisma.store.findUniqueOrThrow({
    where: { id: storeId },
    select: { kind: true, theme: { select: { language: true } } },
  })
  // A starter's words come in the site's language, like a template's do.
  const language = siteLanguage(store.theme)
  const title = textIn(input.title, language)
  const pageCount = await prisma.page.count({
    where: { storeId, role: 'STANDARD' },
  })

  // A landing site is one page by definition — the page the ad sends people
  // to. A second campaign is a second landing site, with its own address, its
  // own offers and its own numbers, rather than a page hidden under the first.
  if (store.kind === 'LANDING' && pageCount > 0) {
    throw new Error(
      'A landing page site has one page. Create a new landing page for another campaign.'
    )
  }

  // Inside the service, not the action: the builder, the template picker and the
  // "new page" form all land here, and a check in one action would leave the
  // other two paths able to exceed the plan.
  await requireQuota(organizationId, 'PAGES')

  // A store's own addresses — /products, /cart — are not page slugs.
  const reserved = new Set<string>(
    store.kind === 'STORE' ? STORE_ROUTE_SEGMENTS : []
  )
  if (input.slug && reserved.has(input.slug)) {
    throw new Error(
      `“${input.slug}” is used by your shop itself — pick another address`
    )
  }

  const slug = input.slug
    ? input.slug
    : await uniquePageSlug(
        storeId,
        pageSlugCandidates(title, input.starter),
        reserved
      )

  if (input.slug) {
    const collision = await prisma.page.findUnique({
      where: { storeId_slug: { storeId, slug: input.slug } },
    })
    if (collision) throw new Error('This slug is already used on this store')
  }

  return prisma.page.create({
    data: {
      storeId,
      title,
      slug,
      isHome: pageCount === 0,
      sections: {
        create: sections.map((section, order) => ({
          ...materializeSection(section, language),
          order,
        })),
      },
    },
  })
}

export async function updatePageSeo(
  organizationId: string,
  storeId: string,
  pageId: string,
  input: UpdatePageSeoInput
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  await assertStoreInOrg(organizationId, storeId)

  const page = await prisma.page.findFirst({
    where: { id: pageId, storeId },
    select: { id: true },
  })
  if (!page) throw new Error('Page not found')

  const collision = await prisma.page.findFirst({
    where: { storeId, slug: input.slug, NOT: { id: pageId } },
    select: { id: true },
  })
  if (collision) throw new Error('This slug is already used on this store')

  // Title and description are "Basic SEO" and included everywhere. The social
  // preview image and the indexing switch are what the price sheet sells as
  // Advanced SEO, so they are gated — and only when being set, so a downgraded
  // tenant can still clear them.
  if (input.ogImageMediaId || input.robotsIndex === false) {
    await requireFeature(organizationId, 'ADVANCED_SEO')
  }

  if (input.ogImageMediaId) {
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: input.ogImageMediaId, organizationId },
      select: { id: true },
    })
    if (!asset) throw new Error('Image not found')
  }

  return prisma.page.update({
    where: { id: pageId },
    data: {
      title: input.title,
      slug: input.slug,
      seoTitle: input.seoTitle || null,
      seoDescription: input.seoDescription || null,
      ogImageMediaId: input.ogImageMediaId || null,
      robotsIndex: input.robotsIndex,
    },
  })
}

export async function getPageForSeoSettings(
  organizationId: string,
  storeId: string,
  pageId: string
) {
  await requireOrgAccess(organizationId, 'VIEWER')
  await assertStoreInOrg(organizationId, storeId)

  const page = await prisma.page.findFirst({
    where: { id: pageId, storeId },
    include: { ogImage: true },
  })
  if (!page) throw new Error('Page not found')

  return page
}

export async function getPageWithSections(
  organizationId: string,
  storeId: string,
  pageId: string
) {
  await requireOrgAccess(organizationId, 'VIEWER')
  await assertStoreInOrg(organizationId, storeId)

  const page = await prisma.page.findFirst({
    where: { id: pageId, storeId },
    include: {
      sections: { orderBy: { order: 'asc' } },
      store: { include: { theme: true } },
    },
  })
  if (!page) throw new Error('Page not found')

  return page
}

/**
 * Resolves a page's tenant from the page id alone (no org/store in the
 * URL) and authorizes against it — used by the chrome-free render route
 * embedded in an iframe by both the authenticated preview and, later, the
 * visual builder's canvas.
 */
export async function getPageForRawPreview(pageId: string) {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { storeId: true, store: { select: { organizationId: true } } },
  })
  if (!page) throw new Error('Page not found')

  return getPageWithSections(page.store.organizationId, page.storeId, pageId)
}

/**
 * Resolves a page by its shareable `previewToken` — deliberately unauthenticated
 * (the token itself, a random cuid, is the credential) so a client can be
 * sent a link to sign off on a draft before it's published. Renders live
 * section rows, not a published snapshot, since the whole point is
 * previewing unpublished work.
 */
export async function getPageByPreviewToken(token: string) {
  const page = await prisma.page.findUnique({
    where: { previewToken: token },
    include: {
      sections: { orderBy: { order: 'asc' } },
      store: { include: { theme: true } },
    },
  })
  if (!page) throw new Error('Page not found')

  return page
}

export interface SectionSaveInput {
  id: string
  /** A block key from modules/sections/registry.ts. */
  type: string
  order: number
  content: object
  config: object
  isVisible: boolean
}

/**
 * Refused save: the page's blocks were saved somewhere else — the AI editor,
 * another tab — since the caller loaded them, so saving its copy would undo
 * that work. Nothing was written; the caller reloads to see the newer version.
 */
export class SectionsChangedElsewhereError extends Error {
  constructor() {
    super(
      'This page was changed somewhere else since you opened it. Reload to see the latest version.'
    )
    this.name = 'SectionsChangedElsewhereError'
  }
}

/** One page's blocks to save, and the save count the caller last saw. */
export interface PageSectionsSave {
  pageId: string
  sections: SectionSaveInput[]
  /**
   * The page's `sectionsRevision` when the caller loaded it. Given, the save is
   * refused if anyone has saved the page since; left out, the save goes ahead
   * whatever happened in between (the AI editor reads the page just before
   * writing it).
   */
  expectedRevision?: number
}

export interface PageSectionsSaved {
  /** Sent id -> stored id, for every block that got a new row. */
  idMapping: Record<string, string>
  /** The page's `sectionsRevision` after this save. */
  revision: number
}

/**
 * Reconciles the builder's in-memory draft with PageSection rows: creates
 * rows for client-generated temp ids, updates the rest, and deletes any
 * row no longer present in the incoming list (sections removed in the
 * editor since the last save). Returns a sent id -> stored id map so the
 * client can reconcile its own state after a successful save, and the page's
 * new save count. See `PageSectionsSave` for `expectedRevision`.
 */
export async function savePageSections(
  organizationId: string,
  storeId: string,
  pageId: string,
  sections: SectionSaveInput[],
  expectedRevision?: number
): Promise<PageSectionsSaved> {
  const [saved] = await saveSectionsOfPages(organizationId, storeId, [
    { pageId, sections, expectedRevision },
  ])
  return saved!
}

/**
 * Saves the blocks of several pages of one store together — the builder's page
 * and the store's layout — so either both are saved or, when one of them was
 * changed elsewhere, neither is. Throws `SectionsChangedElsewhereError` then.
 */
export async function saveSectionsOfPages(
  organizationId: string,
  storeId: string,
  saves: PageSectionsSave[]
): Promise<PageSectionsSaved[]> {
  await requireOrgAccess(organizationId, 'EDITOR')
  await assertStoreInOrg(organizationId, storeId)

  const pageIds = [...new Set(saves.map((save) => save.pageId))]
  const found = await prisma.page.count({
    where: { id: { in: pageIds }, storeId },
  })
  if (found !== pageIds.length) throw new Error('Page not found')

  return prisma.$transaction(async (tx) => {
    const results: PageSectionsSaved[] = []
    for (const save of saves) {
      // Locks the page row until this commits: two saves of one page take
      // turns, and the second compares against the rows and the count the
      // first left rather than both passing a check made before either wrote.
      await tx.$queryRaw`SELECT id FROM "Page" WHERE id = ${save.pageId} FOR UPDATE`
      const page = await tx.page.findUniqueOrThrow({
        where: { id: save.pageId },
        select: {
          sectionsRevision: true,
          sections: {
            select: {
              id: true,
              type: true,
              order: true,
              content: true,
              config: true,
              isVisible: true,
            },
          },
        },
      })

      // A save that changes nothing is neither counted nor checked. The
      // store's header and footer travel with every save of every page, so
      // counting them each time made two tabs on two different pages of one
      // store refuse each other's saves although nobody touched the layout.
      // A stale copy is still caught: it differs from what is stored, so it
      // is a change, and the count decides.
      if (sameSections(page.sections, save.sections)) {
        results.push({ idMapping: {}, revision: page.sectionsRevision })
        continue
      }
      if (
        save.expectedRevision !== undefined &&
        page.sectionsRevision !== save.expectedRevision
      ) {
        throw new SectionsChangedElsewhereError()
      }
      const counted = await tx.page.update({
        where: { id: save.pageId },
        data: {
          sectionsRevision: { increment: 1 },
          // Marks the page as changed since it was published, which is how
          // the builder knows to offer "Publish changes".
          updatedAt: new Date(),
        },
        select: { sectionsRevision: true },
      })
      results.push({
        idMapping: await reconcileSections(tx, save.pageId, save.sections),
        revision: counted.sectionsRevision,
      })
    }
    return results
  })
}

/** JSON with its object keys in order, so two equal values compare equal. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`
      )
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/** Whether a save would leave a page's blocks exactly as they are stored. */
function sameSections(
  stored: {
    id: string
    type: string
    order: number
    content: unknown
    config: unknown
    isVisible: boolean
  }[],
  incoming: SectionSaveInput[]
): boolean {
  if (stored.length !== incoming.length) return false
  const byId = new Map(stored.map((section) => [section.id, section]))
  return incoming.every((section) => {
    const row = byId.get(section.id)
    return (
      row !== undefined &&
      row.type === section.type &&
      row.order === section.order &&
      row.isVisible === section.isVisible &&
      stableJson(row.content) === stableJson(section.content) &&
      stableJson(row.config ?? {}) === stableJson(section.config ?? {})
    )
  })
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

async function reconcileSections(
  tx: Tx,
  pageId: string,
  sections: SectionSaveInput[]
): Promise<Record<string, string>> {
  const idMapping: Record<string, string> = {}
  const existingIds = new Set(
    (
      await tx.pageSection.findMany({
        where: { pageId },
        select: { id: true },
      })
    ).map((s) => s.id)
  )

  const incomingRealIds = new Set<string>()

  for (const section of sections) {
    // A temp id is a block made since the last save. A real id this page no
    // longer has is a block an earlier save deleted and Undo brought back —
    // the merchant deleted a block, or an AI rewrite replaced it, the
    // autosave removed the row, and then they changed their mind. Skipping it
    // showed the block on the canvas, said "Draft saved", and kept it nowhere.
    // Both get a new row, under an id of the database's choosing rather than
    // the one sent, which might be another page's; the client swaps the id
    // through `idMapping`, history included.
    if (section.id.startsWith('temp-') || !existingIds.has(section.id)) {
      const created = await tx.pageSection.create({
        data: {
          pageId,
          type: section.type,
          order: section.order,
          content: section.content,
          config: section.config,
          isVisible: section.isVisible,
        },
      })
      idMapping[section.id] = created.id
      incomingRealIds.add(created.id)
    } else {
      await tx.pageSection.update({
        where: { id: section.id },
        data: {
          order: section.order,
          content: section.content,
          config: section.config,
          isVisible: section.isVisible,
        },
      })
      incomingRealIds.add(section.id)
    }
  }

  const idsToDelete = [...existingIds].filter((id) => !incomingRealIds.has(id))
  if (idsToDelete.length > 0) {
    await tx.pageSection.deleteMany({ where: { id: { in: idsToDelete } } })
  }

  return idMapping
}

export async function deletePage(
  organizationId: string,
  storeId: string,
  pageId: string
) {
  await requireOrgAccess(organizationId, 'EDITOR')
  await assertStoreInOrg(organizationId, storeId)

  const page = await prisma.page.findFirst({
    where: { id: pageId, storeId },
    select: { id: true },
  })
  if (!page) throw new Error('Page not found')

  await prisma.page.delete({ where: { id: page.id } })
}
