/**
 * Puts the picture back on order lines that were written without one.
 *
 * Checkout snapshots the goods onto the order — title, size, SKU, price — so an
 * order stays readable after the product it names is renamed, repriced or
 * deleted. When the catalogue moved onto the merchant's own website the
 * snapshot was rewritten to read from the live entry, and the image was the one
 * field that did not make it across: `OrderLine.imageUrl` was never assigned,
 * so every order placed after that deploy carries a null there. Nothing errors.
 * The order screen, the packing label and the buyer's tracking page each render
 * an empty grey box, which is exactly what a product with no photo looks like.
 *
 * Checkout is fixed. This is for the orders placed while it was not, and it
 * only ever fills nulls — a line that already has a picture is never touched,
 * so a re-run is free and this cannot rewrite what an order was sold with.
 *
 *   pnpm backfill:order-images
 *   pnpm backfill:order-images -- --org elysium --apply
 *
 * Two sources, in the order the checkout itself would have used them:
 *
 *   1. the catalogue as it is now — the variant's own image, else the
 *      product's first, which is what the line would have been given;
 *   2. the cart the order was placed from, whose lines carry their own
 *      snapshot taken when the shopper added the item.
 *
 * The cart is the fallback rather than the first answer because it records what
 * the shopper was shown, which can be a photo the merchant has since replaced.
 * It is what rescues a line whose product has since been deleted from the
 * merchant's site — the catalogue has no answer for those at all, and the cart
 * is the last place the picture exists.
 *
 * Lines that neither source can answer are listed at the end. They are orders
 * for something that is gone from both, and there is nothing to put back.
 */

import { prisma } from '@/server/db/client'
// Straight from `source`, not the barrel: `@/server/catalog` re-exports
// modules that reach `next/navigation`, which cannot load outside a request.
import { resolveVariants } from '@/server/catalog/source'

// ── Arguments ────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

function flag(name: string): string | undefined {
  const index = args.indexOf(`--${name}`)
  if (index === -1) return undefined
  return args[index + 1]
}

const APPLY = args.includes('--apply')
const ORG = flag('org')
/** A ceiling on how many lines one run will touch, per workspace. */
const LIMIT = Math.max(1, Number(flag('limit') ?? 5000))

const bold = (text: string) => `\x1b[1m${text}\x1b[0m`
const dim = (text: string) => `\x1b[2m${text}\x1b[0m`
const green = (text: string) => `\x1b[32m${text}\x1b[0m`
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`

/**
 * The catalogue is read in batches rather than all at once.
 *
 * A remote read is an HTTP call to the merchant's own website, sitting inside
 * their request budget. `resolveVariants` already batches the ids it is given,
 * but handing it every unresolved line in one workspace at once is how a
 * backfill over a year of orders turns into a request their server refuses.
 */
const BATCH = 100

async function main() {
  const organizations = await prisma.organization.findMany({
    where: ORG ? { OR: [{ id: ORG }, { slug: ORG }] } : {},
    select: { id: true, name: true, slug: true },
    orderBy: { createdAt: 'asc' },
  })

  if (organizations.length === 0) {
    console.error(
      ORG ? `No workspace with id or slug “${ORG}”.` : 'No workspaces.'
    )
    process.exit(1)
  }

  let filled = 0
  let unresolved = 0

  for (const organization of organizations) {
    const lines = await prisma.orderLine.findMany({
      where: { imageUrl: null, order: { organizationId: organization.id } },
      select: {
        id: true,
        title: true,
        variantId: true,
        productId: true,
        order: { select: { orderNumber: true, cartId: true } },
      },
      orderBy: { id: 'asc' },
      take: LIMIT,
    })

    if (lines.length === 0) continue

    console.log(
      bold(`\n${organization.name}`) +
        dim(` (${organization.slug}) — ${lines.length} line(s) with no picture`)
    )

    // What the shopper put in the basket. One query for the whole workspace,
    // keyed by (cart, variant) because a cart holds one line per variant.
    const cartIds = [
      ...new Set(
        lines
          .map((line) => line.order.cartId)
          .filter((id): id is string => typeof id === 'string')
      ),
    ]
    const cartLines = cartIds.length
      ? await prisma.cartLine.findMany({
          where: { cartId: { in: cartIds }, imageUrl: { not: null } },
          select: { cartId: true, variantId: true, imageUrl: true },
        })
      : []
    const fromCart = new Map(
      cartLines.map((line) => [
        `${line.cartId}:${line.variantId}`,
        line.imageUrl,
      ])
    )

    // The catalogue, in batches. A variant id is asked about once however many
    // lines across however many orders happen to name it.
    const refs = [
      ...new Map(
        lines
          .filter((line) => line.variantId)
          .map((line) => [
            line.variantId as string,
            { variantId: line.variantId as string, productId: line.productId },
          ])
      ).values(),
    ]

    const fromCatalog = new Map<string, string>()
    for (let index = 0; index < refs.length; index += BATCH) {
      const slice = refs.slice(index, index + BATCH)
      let resolved
      try {
        resolved = await resolveVariants(organization.id, slice)
      } catch (error) {
        // A website that cannot be read is not a reason to abandon the rest:
        // the cart snapshot below still answers for most lines, and the next
        // run picks up whatever this one could not.
        console.log(
          yellow(
            `  catalogue unreadable for ${slice.length} reference(s): ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        )
        continue
      }
      for (const [variantId, entry] of resolved) {
        const url = entry.variant.imageUrl ?? entry.product.images[0]?.url
        if (url) fromCatalog.set(variantId, url)
      }
    }

    const missing: typeof lines = []

    for (const line of lines) {
      const url =
        (line.variantId ? fromCatalog.get(line.variantId) : undefined) ??
        (line.order.cartId && line.variantId
          ? (fromCart.get(`${line.order.cartId}:${line.variantId}`) ??
            undefined)
          : undefined)

      if (!url) {
        missing.push(line)
        continue
      }

      if (APPLY) {
        await prisma.orderLine.update({
          where: { id: line.id },
          data: { imageUrl: url },
        })
      }
      filled += 1
      console.log(
        `  ${green(APPLY ? 'filled' : 'would fill')} ${line.order.orderNumber} ` +
          dim(`${line.title} → ${url.slice(0, 72)}`)
      )
    }

    for (const line of missing) {
      unresolved += 1
      console.log(
        `  ${yellow('no picture anywhere')} ${line.order.orderNumber} ` +
          dim(`${line.title} (variant ${line.variantId ?? 'none'})`)
      )
    }
  }

  console.log(
    bold(
      `\n${APPLY ? 'Filled' : 'Would fill'} ${filled} line(s); ${unresolved} could not be answered.`
    )
  )
  if (!APPLY && filled > 0) {
    console.log(dim('Nothing was written. Re-run with --apply to do it.\n'))
  } else {
    console.log('')
  }
}

main()
  .catch(async (error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
