/**
 * Retires a workspace's own copies of products that already live on its
 * connected website, without breaking anything pointing at them.
 *
 * The situation this exists for: a workspace was set up by importing a
 * merchant's catalogue into NCOM, and later connected that same website as a
 * live product source. Now every shirt exists twice — once as a row here, once
 * on their site — and the NCOM copy is the stale one. Deleting it is the
 * obvious move and it is refused, correctly: orders, offers, discounts and open
 * carts all name that row, and `deleteProduct` will not orphan them.
 *
 * So the copies are not deleted. They are *adopted*: every reference is moved
 * onto the twin on the merchant's site first, and only then does the local row
 * go. An order that sold "Hawaiian Shirt / L" still points at a Hawaiian Shirt
 * in L — the merchant's own, the one their warehouse actually counts.
 *
 * Nothing is written without `--apply`. The default run reads both catalogues,
 * matches them, and prints exactly what it would do, including everything it
 * could *not* match — which is the part worth reading, because an unmatched
 * product with orders against it is one this tool will refuse to touch.
 *
 *   pnpm adopt:remote -- --org <organizationId|slug>
 *   pnpm adopt:remote -- --org elysium --apply
 *
 * Matching is deliberately conservative. A wrong match silently reassigns a
 * customer's order to a different product, which is worse than any number of
 * unmatched rows, so every rule below requires the match to be unique on both
 * sides and the first rule that produces one wins:
 *
 *   1. SKU — the identifier a merchant already treats as the product's name.
 *   2. The local product's `externalId`, which is the merchant's own id from
 *      whatever import created these rows in the first place.
 *   3. Handle.
 *   4. Normalised title.
 *
 * Variants are matched inside a matched product by SKU, then by option values,
 * then by position — and a single-variant product on both sides matches
 * outright, which covers most of a real catalogue.
 */

import { prisma } from '@/server/db/client'
import { listRemoteProducts } from '@/server/catalog/source'
import { loadConnection } from '@/server/catalog/connection'
import type { CatalogProduct, CatalogVariant } from '@/server/catalog/types'

// ── Arguments ────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

function flag(name: string): string | undefined {
  const index = args.indexOf(`--${name}`)
  if (index === -1) return undefined
  return args[index + 1]
}

const APPLY = args.includes('--apply')
const ORG = flag('org')
const ONLY = flag('only')
  ?.split(',')
  .map((value) => value.trim())
  .filter(Boolean)

if (!ORG) {
  console.error(
    'Usage: pnpm adopt:remote -- --org <organizationId|slug> [--apply] [--only <productId,…>]'
  )
  process.exit(1)
}

const bold = (text: string) => `\x1b[1m${text}\x1b[0m`
const dim = (text: string) => `\x1b[2m${text}\x1b[0m`
const green = (text: string) => `\x1b[32m${text}\x1b[0m`
const red = (text: string) => `\x1b[31m${text}\x1b[0m`
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`

// ── Normalisation ────────────────────────────────────────────────────────

/**
 * Two spellings of the same product name, made comparable.
 *
 * Case, punctuation and runs of whitespace are noise here: "Men's Hawaiian
 * Shirt" and "Mens Hawaiian Shirt" are the same shirt entered twice, and a
 * catalogue that was imported once and edited by hand since is full of exactly
 * that. What is *not* stripped is any word or digit, so "Shirt XL" never
 * collapses into "Shirt".
 */
function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[‘’'`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Builds a lookup that only answers when exactly one row claims a key. */
function uniqueIndex<T>(
  rows: T[],
  key: (row: T) => string | null | undefined
): Map<string, T> {
  const counts = new Map<string, number>()
  const index = new Map<string, T>()

  for (const row of rows) {
    const value = normalize(key(row))
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
    index.set(value, row)
  }

  // Ambiguous keys are removed rather than resolved. The production catalogue
  // this was written for holds 56 rows called "Men's Hawaiian Shirt"; guessing
  // which of them an order meant is not something a script gets to do.
  for (const [value, count] of counts) {
    if (count > 1) index.delete(value)
  }

  return index
}

// ── Loading both catalogues ──────────────────────────────────────────────

type LocalProduct = {
  id: string
  title: string
  handle: string
  externalId: string | null
  status: string
  variants: {
    id: string
    sku: string | null
    title: string
    option1: string | null
    option2: string | null
    option3: string | null
    position: number | null
  }[]
}

async function loadLocal(organizationId: string): Promise<LocalProduct[]> {
  return prisma.product.findMany({
    where: {
      organizationId,
      ...(ONLY && ONLY.length > 0 ? { id: { in: ONLY } } : {}),
    },
    select: {
      id: true,
      title: true,
      handle: true,
      externalId: true,
      status: true,
      variants: {
        select: {
          id: true,
          sku: true,
          title: true,
          option1: true,
          option2: true,
          option3: true,
          position: true,
        },
        orderBy: { position: 'asc' },
      },
    },
    orderBy: { title: 'asc' },
  })
}

/**
 * The merchant's whole catalogue, paged to exhaustion.
 *
 * Drafts included: a product that is unpublished on their site is still the
 * product an old order sold, and refusing to match it would strand that order
 * on a row about to be deleted.
 */
async function loadRemote(organizationId: string): Promise<CatalogProduct[]> {
  const products: CatalogProduct[] = []
  let cursor: string | null = null
  let pages = 0

  do {
    const page = await listRemoteProducts(organizationId, {
      limit: 250,
      cursor,
      includeDrafts: true,
    })
    products.push(...page.products)
    cursor = page.nextCursor
    pages += 1

    process.stdout.write(
      `\r  reading their catalogue… ${products.length} products`
    )

    // A connector whose cursor never advances would otherwise loop forever.
    if (pages > 400) {
      console.log(
        `\n  ${yellow('!')} stopped after 400 pages — the connector may be returning a cursor that does not advance`
      )
      break
    }
  } while (cursor)

  process.stdout.write('\r\x1b[K')
  return products
}

// ── Matching ─────────────────────────────────────────────────────────────

interface VariantMatch {
  localVariantId: string
  remoteVariantId: string
  label: string
  rule: string
}

interface ProductMatch {
  local: LocalProduct
  remote: CatalogProduct
  rule: string
  variants: VariantMatch[]
  unmatchedVariants: LocalProduct['variants']
}

function optionKey(values: (string | null)[]): string {
  return values
    .filter((value): value is string => Boolean(value))
    .map(normalize)
    .join(' / ')
}

/**
 * Whether the rule that paired these two products is worth trusting on its own.
 *
 * A SKU or the merchant's own id names one product and no other. A title does
 * not: this was written against a catalogue holding 104 products called some
 * spelling of "Hawaiian Shirt", where 35 of them no longer exist on the
 * merchant's site at all — and every one of those 35 matched the one remaining
 * "Hawaiian Shirt" by title, then matched its "S" to that shirt's "S", and 32
 * products lined up to inherit the same variant.
 */
function isStrong(rule: string): boolean {
  return rule === 'sku' || rule === 'externalId'
}

function matchVariants(
  local: LocalProduct,
  remote: CatalogProduct,
  /**
   * Weak product matches get only the strong variant rules. Option values,
   * variant titles and positions are all ways of saying "the small one", which
   * is a true statement about every shirt in the catalogue — useful for
   * splitting a product we are already sure of, useless for deciding which
   * product we are looking at.
   *
   * The one exception, applied below, is a product with a single variant on
   * both sides: there is nothing to choose between, and a title that is unique
   * in both catalogues is then the whole of the evidence and enough of it.
   */
  strong: boolean
): { matched: VariantMatch[]; unmatched: LocalProduct['variants'] } {
  const matched: VariantMatch[] = []
  const unmatched: LocalProduct['variants'] = []
  const taken = new Set<string>()

  const bySku = uniqueIndex(remote.variants, (variant) => variant.sku)
  const byOptions = uniqueIndex(remote.variants, (variant) =>
    optionKey(variant.options)
  )
  const byTitle = uniqueIndex(remote.variants, (variant) => variant.title)

  const claim = (variant: CatalogVariant | undefined) =>
    variant && !taken.has(variant.id) ? variant : undefined

  for (const [index, variant] of local.variants.entries()) {
    const options = optionKey([
      variant.option1,
      variant.option2,
      variant.option3,
    ])

    // A product with one option set on each side is the common case and needs
    // no cleverness: there is only one thing it can mean.
    const single =
      local.variants.length === 1 && remote.variants.length === 1
        ? remote.variants[0]
        : undefined

    const bySkuHit = claim(
      variant.sku ? bySku.get(normalize(variant.sku)) : undefined
    )

    const candidate = !strong
      ? (bySkuHit ??
        (local.variants.length === 1 && remote.variants.length === 1
          ? claim(remote.variants[0])
          : undefined))
      : (bySkuHit ??
        claim(options ? byOptions.get(options) : undefined) ??
        claim(byTitle.get(normalize(variant.title))) ??
        claim(single) ??
        // Position last, and only when the shapes agree. Two catalogues that
        // happen to have three variants each are not thereby the same three.
        (local.variants.length === remote.variants.length
          ? claim(remote.variants[index])
          : undefined))

    if (!candidate) {
      unmatched.push(variant)
      continue
    }

    taken.add(candidate.id)
    matched.push({
      localVariantId: variant.id,
      remoteVariantId: candidate.id,
      label: variant.title === 'Default Title' ? local.title : variant.title,
      rule:
        variant.sku && bySku.get(normalize(variant.sku))?.id === candidate.id
          ? 'sku'
          : options && byOptions.get(options)?.id === candidate.id
            ? 'options'
            : byTitle.get(normalize(variant.title))?.id === candidate.id
              ? 'title'
              : single
                ? 'only variant'
                : 'position',
    })
  }

  return { matched, unmatched }
}

function match(
  locals: LocalProduct[],
  remotes: CatalogProduct[]
): { matches: ProductMatch[]; unmatched: LocalProduct[] } {
  const remoteById = new Map(remotes.map((product) => [product.id, product]))
  const remoteBySku = uniqueIndex(
    remotes.flatMap((product) =>
      product.variants.map((variant) => ({ product, sku: variant.sku }))
    ),
    (row) => row.sku
  )
  const remoteByHandle = uniqueIndex(remotes, (product) => product.handle)
  const remoteByTitle = uniqueIndex(remotes, (product) => product.title)

  /**
   * The same keys, counted on our side.
   *
   * `uniqueIndex` only ever guaranteed that a handle or title named one product
   * on *their* site. That is half of what the docs promised and half of what is
   * needed: 104 local products spelling some version of "Hawaiian Shirt" all
   * matched the single remote product with that title, each perfectly
   * unambiguously from the remote side's point of view. A key that several of
   * our own rows claim tells us nothing about which of them is which.
   */
  const localHandleCounts = new Map<string, number>()
  const localTitleCounts = new Map<string, number>()
  for (const local of locals) {
    const handle = normalize(local.handle)
    const title = normalize(local.title)
    localHandleCounts.set(handle, (localHandleCounts.get(handle) ?? 0) + 1)
    localTitleCounts.set(title, (localTitleCounts.get(title) ?? 0) + 1)
  }

  const matches: ProductMatch[] = []
  const unmatched: LocalProduct[] = []

  for (const local of locals) {
    // In priority order, and the first that answers wins. Each rule is only
    // consulted through a unique index, so "answers" already means "means
    // exactly one product on their side".
    const skuHit = local.variants
      .map((variant) =>
        variant.sku ? remoteBySku.get(normalize(variant.sku)) : undefined
      )
      .find(Boolean)

    const candidate: { product: CatalogProduct; rule: string } | undefined =
      skuHit
        ? { product: skuHit.product, rule: 'sku' }
        : local.externalId && remoteById.has(local.externalId)
          ? {
              product: remoteById.get(local.externalId)!,
              rule: 'externalId',
            }
          : remoteByHandle.has(normalize(local.handle)) &&
              localHandleCounts.get(normalize(local.handle)) === 1
            ? {
                product: remoteByHandle.get(normalize(local.handle))!,
                rule: 'handle',
              }
            : remoteByTitle.has(normalize(local.title)) &&
                localTitleCounts.get(normalize(local.title)) === 1
              ? {
                  product: remoteByTitle.get(normalize(local.title))!,
                  rule: 'title',
                }
              : undefined

    if (!candidate) {
      unmatched.push(local)
      continue
    }

    const { matched, unmatched: leftover } = matchVariants(
      local,
      candidate.product,
      isStrong(candidate.rule)
    )

    matches.push({
      local,
      remote: candidate.product,
      rule: candidate.rule,
      variants: matched,
      unmatchedVariants: leftover,
    })
  }

  return { matches, unmatched }
}

// ── What still points at the local rows ──────────────────────────────────

interface Usage {
  orderLines: number
  cartLines: number
  offerItems: number
  offerRules: number
  offerGifts: number
  discounts: number
}

async function countUsage(
  organizationId: string,
  productIds: string[],
  variantIds: string[]
): Promise<Usage> {
  if (productIds.length === 0 && variantIds.length === 0) {
    return {
      orderLines: 0,
      cartLines: 0,
      offerItems: 0,
      offerRules: 0,
      offerGifts: 0,
      discounts: 0,
    }
  }

  const [orderLines, cartLines, offerItems, offerRules, offerGifts, discounts] =
    await Promise.all([
      prisma.orderLine.count({
        where: {
          order: { organizationId },
          OR: [
            { variantId: { in: variantIds } },
            { productId: { in: productIds } },
          ],
        },
      }),
      prisma.cartLine.count({
        where: {
          cart: { organizationId },
          OR: [
            { variantId: { in: variantIds } },
            { productId: { in: productIds } },
          ],
        },
      }),
      prisma.offerItem.count({
        where: {
          offer: { organizationId },
          OR: [
            { productId: { in: productIds } },
            { variantId: { in: variantIds } },
            { variantIds: { hasSome: variantIds } },
          ],
        },
      }),
      prisma.offerVariantRule.count({
        where: { offer: { organizationId }, variantId: { in: variantIds } },
      }),
      prisma.offer.count({
        where: { organizationId, giftVariantId: { in: variantIds } },
      }),
      prisma.discount.count({
        where: {
          organizationId,
          OR: [
            { targetProductIds: { hasSome: productIds } },
            { targetVariantIds: { hasSome: variantIds } },
            { excludedProductIds: { hasSome: productIds } },
            { excludedVariantIds: { hasSome: variantIds } },
          ],
        },
      }),
    ])

  return {
    orderLines,
    cartLines,
    offerItems,
    offerRules,
    offerGifts,
    discounts,
  }
}

// ── Rewriting ────────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Moves every reference off one local product and onto its twin.
 *
 * Two shapes of collision have to be handled rather than allowed to throw,
 * because both are ordinary once a catalogue holds duplicates:
 *
 *   A cart holding *both* twins. `CartLine` is unique on (cart, variant), so
 *   repointing one line onto an id the cart already has would violate it. The
 *   two lines are one line about one product, so the quantities are added and
 *   the duplicate is dropped.
 *
 *   An offer with a rule for both twins. Same reasoning, except a rule is a
 *   statement rather than a quantity, so the local one is simply deleted and
 *   the existing rule stands.
 */
async function adopt(
  tx: Tx,
  organizationId: string,
  productMatch: ProductMatch
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  const bump = (key: string, by: number) => {
    if (by > 0) counts[key] = (counts[key] ?? 0) + by
  }

  const localProductId = productMatch.local.id
  const remoteProductId = productMatch.remote.id

  for (const variant of productMatch.variants) {
    const { localVariantId, remoteVariantId } = variant

    // Orders: the id moves, the snapshot does not. Every descriptive field on
    // an order line was copied at sale time precisely so this is safe.
    bump(
      'order lines',
      (
        await tx.orderLine.updateMany({
          where: { order: { organizationId }, variantId: localVariantId },
          data: { variantId: remoteVariantId, productId: remoteProductId },
        })
      ).count
    )

    // Carts: merge on collision.
    const cartLines = await tx.cartLine.findMany({
      where: { cart: { organizationId }, variantId: localVariantId },
      select: { id: true, cartId: true, quantity: true },
    })

    for (const line of cartLines) {
      const twin = await tx.cartLine.findFirst({
        where: { cartId: line.cartId, variantId: remoteVariantId },
        select: { id: true, quantity: true },
      })

      if (twin) {
        await tx.cartLine.update({
          where: { id: twin.id },
          data: { quantity: twin.quantity + line.quantity },
        })
        await tx.cartLine.delete({ where: { id: line.id } })
        bump('cart lines merged', 1)
        continue
      }

      await tx.cartLine.update({
        where: { id: line.id },
        data: { variantId: remoteVariantId, productId: remoteProductId },
      })
      bump('cart lines', 1)
    }

    // Offers: the chosen variant, the ladder rules, and the gift.
    bump(
      'offer items',
      (
        await tx.offerItem.updateMany({
          where: { offer: { organizationId }, variantId: localVariantId },
          data: { variantId: remoteVariantId },
        })
      ).count
    )

    const rules = await tx.offerVariantRule.findMany({
      where: { offer: { organizationId }, variantId: localVariantId },
      select: { id: true, offerId: true },
    })

    for (const rule of rules) {
      const twin = await tx.offerVariantRule.findFirst({
        where: { offerId: rule.offerId, variantId: remoteVariantId },
        select: { id: true },
      })

      if (twin) {
        await tx.offerVariantRule.delete({ where: { id: rule.id } })
        bump('offer rules dropped as duplicates', 1)
        continue
      }

      await tx.offerVariantRule.update({
        where: { id: rule.id },
        data: { variantId: remoteVariantId },
      })
      bump('offer rules', 1)
    }

    bump(
      'offer gifts',
      (
        await tx.offer.updateMany({
          where: { organizationId, giftVariantId: localVariantId },
          data: { giftVariantId: remoteVariantId },
        })
      ).count
    )

    // Array columns cannot be rewritten in place by Prisma, so they are read,
    // mapped and written back. Deduped, because a list that named both twins
    // would otherwise name the survivor twice.
    const items = await tx.offerItem.findMany({
      where: {
        offer: { organizationId },
        variantIds: { has: localVariantId },
      },
      select: { id: true, variantIds: true },
    })

    for (const item of items) {
      await tx.offerItem.update({
        where: { id: item.id },
        data: {
          variantIds: [
            ...new Set(
              item.variantIds.map((id) =>
                id === localVariantId ? remoteVariantId : id
              )
            ),
          ],
        },
      })
      bump('offer variant lists', 1)
    }
  }

  // Product-level references, done once rather than per variant.
  bump(
    'offer items (product)',
    (
      await tx.offerItem.updateMany({
        where: { offer: { organizationId }, productId: localProductId },
        data: { productId: remoteProductId },
      })
    ).count
  )

  bump(
    'order lines (product only)',
    (
      await tx.orderLine.updateMany({
        where: { order: { organizationId }, productId: localProductId },
        data: { productId: remoteProductId },
      })
    ).count
  )

  bump(
    'cart lines (product only)',
    (
      await tx.cartLine.updateMany({
        where: { cart: { organizationId }, productId: localProductId },
        data: { productId: remoteProductId },
      })
    ).count
  )

  // Discount scoping: five string arrays, same treatment.
  const variantIdMap = new Map(
    productMatch.variants.map((variant) => [
      variant.localVariantId,
      variant.remoteVariantId,
    ])
  )

  const discounts = await tx.discount.findMany({
    where: {
      organizationId,
      OR: [
        { targetProductIds: { has: localProductId } },
        { excludedProductIds: { has: localProductId } },
        { targetVariantIds: { hasSome: [...variantIdMap.keys()] } },
        { excludedVariantIds: { hasSome: [...variantIdMap.keys()] } },
      ],
    },
    select: {
      id: true,
      targetProductIds: true,
      excludedProductIds: true,
      targetVariantIds: true,
      excludedVariantIds: true,
    },
  })

  for (const discount of discounts) {
    const swapProducts = (ids: string[]) => [
      ...new Set(
        ids.map((id) => (id === localProductId ? remoteProductId : id))
      ),
    ]
    const swapVariants = (ids: string[]) => [
      ...new Set(ids.map((id) => variantIdMap.get(id) ?? id)),
    ]

    await tx.discount.update({
      where: { id: discount.id },
      data: {
        targetProductIds: swapProducts(discount.targetProductIds),
        excludedProductIds: swapProducts(discount.excludedProductIds),
        targetVariantIds: swapVariants(discount.targetVariantIds),
        excludedVariantIds: swapVariants(discount.excludedVariantIds),
      },
    })
    bump('discounts', 1)
  }

  // The stock ledger for variants that are about to stop existing. Left behind
  // it becomes an orphaned running balance nothing can ever reconcile — this
  // workspace already carries thousands of those from an earlier cascade, and
  // adding to the pile helps nobody. The merchant's site is the authority on
  // these counts now.
  bump(
    'inventory ledger rows',
    (
      await tx.inventoryAdjustment.deleteMany({
        where: {
          variantId: {
            in: productMatch.local.variants.map((variant) => variant.id),
          },
        },
      })
    ).count
  )

  // Cascades the variants, images, options, inventory levels and collection
  // memberships with it.
  await tx.product.delete({ where: { id: localProductId } })

  return counts
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const organization = await prisma.organization.findFirst({
    where: { OR: [{ id: ORG }, { slug: ORG }] },
    select: { id: true, name: true, slug: true },
  })

  if (!organization) {
    console.error(red(`No workspace with id or slug “${ORG}”.`))
    process.exit(1)
  }

  console.log(bold(`\n${organization.name}`) + dim(` (${organization.slug})`))

  const connection = await loadConnection(organization.id)
  if (!connection) {
    console.error(
      red(
        '\nThis workspace has no connected website. There is nothing to adopt these products onto.'
      )
    )
    process.exit(1)
  }
  if (!connection.isActive) {
    console.error(
      red('\nThe connection is switched off. Turn it on before running this.')
    )
    process.exit(1)
  }
  console.log(dim(`connected to ${connection.baseUrl}\n`))

  const [locals, remotes] = await Promise.all([
    loadLocal(organization.id),
    loadRemote(organization.id),
  ])

  console.log(
    `${locals.length} products stored in NCOM · ${remotes.length} on their website\n`
  )

  if (remotes.length === 0) {
    console.error(
      red(
        'Their website returned no products at all. Refusing to go further — every local product would look unmatched, which is exactly the state in which this tool must do nothing.'
      )
    )
    process.exit(1)
  }

  const { matches, unmatched } = match(locals, remotes)

  const fullyMatched = matches.filter(
    (entry) => entry.unmatchedVariants.length === 0
  )
  const partial = matches.filter((entry) => entry.unmatchedVariants.length > 0)

  console.log(bold('Matched'))
  for (const entry of fullyMatched.slice(0, 40)) {
    console.log(
      `  ${green('✓')} ${entry.local.title} ${dim(`→ ${entry.remote.title} (${entry.rule}, ${entry.variants.length} variant${entry.variants.length === 1 ? '' : 's'})`)}`
    )
  }
  if (fullyMatched.length > 40) {
    console.log(dim(`  … and ${fullyMatched.length - 40} more`))
  }
  if (fullyMatched.length === 0) console.log(dim('  none'))

  if (partial.length > 0) {
    console.log(`\n${bold('Matched, but not every option')}`)
    for (const entry of partial.slice(0, 20)) {
      console.log(
        `  ${yellow('~')} ${entry.local.title} ${dim(`→ ${entry.remote.title}`)} — ${entry.unmatchedVariants.length} option${entry.unmatchedVariants.length === 1 ? '' : 's'} with no twin: ${entry.unmatchedVariants.map((variant) => variant.title).join(', ')}`
      )
    }
    if (partial.length > 20) {
      console.log(dim(`  … and ${partial.length - 20} more`))
    }
    console.log(
      dim(
        '  These are skipped. An option with no twin has nowhere for its orders to go.'
      )
    )
  }

  if (unmatched.length > 0) {
    console.log(`\n${bold('No twin on their website')}`)
    for (const entry of unmatched.slice(0, 30)) {
      console.log(
        `  ${red('✗')} ${entry.title} ${dim(`(${entry.handle}${entry.externalId ? `, external ${entry.externalId}` : ''})`)}`
      )
    }
    if (unmatched.length > 30) {
      console.log(dim(`  … and ${unmatched.length - 30} more`))
    }
    console.log(
      dim(
        '  Left exactly as they are. These are the products only NCOM has — which is a legitimate thing to be.'
      )
    )
  }

  // Only fully matched products are ever adopted: a product with one option
  // that has no twin cannot be deleted without stranding whatever bought it.
  //
  // And then the check that matters more than any of the matching rules: is the
  // mapping one-to-one? Each product is matched against their catalogue on its
  // own, and nothing in that stops two local products both landing on the same
  // variant over there — a real catalogue that holds three rows for one shirt
  // is exactly the shape that produces it. Sending two products' orders to one
  // variant would quietly merge two sales histories, so every product involved
  // in a collision is dropped and named instead.
  const claimedBy = new Map<string, ProductMatch[]>()
  for (const entry of fullyMatched) {
    for (const variant of entry.variants) {
      const existing = claimedBy.get(variant.remoteVariantId) ?? []
      existing.push(entry)
      claimedBy.set(variant.remoteVariantId, existing)
    }
  }

  const contested = new Set<ProductMatch>()
  const collisions: { remoteVariantId: string; products: ProductMatch[] }[] = []

  for (const [remoteVariantId, entries] of claimedBy) {
    const distinct = [...new Set(entries)]
    if (distinct.length < 2) continue
    collisions.push({ remoteVariantId, products: distinct })
    for (const entry of distinct) contested.add(entry)
  }

  if (collisions.length > 0) {
    console.log(`\n${bold('Two NCOM products claiming the same option')}`)
    for (const collision of collisions.slice(0, 15)) {
      console.log(
        `  ${red('✗')} ${collision.remoteVariantId} ${dim('claimed by')} ${collision.products.map((entry) => `${entry.local.title} (${entry.local.id})`).join(dim(' and '))}`
      )
    }
    if (collisions.length > 15) {
      console.log(dim(`  … and ${collisions.length - 15} more`))
    }
    console.log(
      dim(
        `  ${contested.size} products skipped. Merging two sales histories onto one variant is not something this can undo.`
      )
    )
  }

  const adoptable = fullyMatched.filter((entry) => !contested.has(entry))

  const usage = await countUsage(
    organization.id,
    adoptable.map((entry) => entry.local.id),
    adoptable.flatMap((entry) =>
      entry.variants.map((variant) => variant.localVariantId)
    )
  )

  console.log(`\n${bold('References that would move')}`)
  console.log(`  order lines      ${usage.orderLines}`)
  console.log(`  cart lines       ${usage.cartLines}`)
  console.log(`  offer items      ${usage.offerItems}`)
  console.log(`  offer rules      ${usage.offerRules}`)
  console.log(`  offer gifts      ${usage.offerGifts}`)
  console.log(`  discounts        ${usage.discounts}`)

  console.log(
    `\n${bold(`${adoptable.length} products`)} would be deleted from NCOM once their references have moved.`
  )

  if (!APPLY) {
    console.log(
      dim(
        '\nNothing was written. Re-run with --apply to do it, and take a database backup first.\n'
      )
    )
    await prisma.$disconnect()
    return
  }

  if (adoptable.length === 0) {
    console.log(dim('\nNothing to do.\n'))
    await prisma.$disconnect()
    return
  }

  console.log(`\n${bold('Applying…')}`)

  const totals: Record<string, number> = {}

  // One transaction for the lot. A half-finished run is the one outcome worse
  // than not running at all: some orders repointed, some products gone, and no
  // way to tell which without reading every table.
  await prisma.$transaction(
    async (tx) => {
      for (const entry of adoptable) {
        const counts = await adopt(tx, organization.id, entry)
        for (const [key, value] of Object.entries(counts)) {
          totals[key] = (totals[key] ?? 0) + value
        }
      }
    },
    { timeout: 15 * 60 * 1000, maxWait: 30_000 }
  )

  for (const [key, value] of Object.entries(totals).sort()) {
    console.log(`  ${green('✓')} ${value} ${key}`)
  }
  console.log(
    `  ${green('✓')} ${adoptable.length} products deleted from NCOM\n`
  )

  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(red('\nFailed — nothing was changed.'))
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
