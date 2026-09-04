import { z } from 'zod'
import { apiOk, readJson, readPaging, withApiKey } from '@/server/api/context'
import {
  adjustInventory,
  ensureDefaultLocation,
  listInventory,
  setVariantStock,
} from '@/server/services/inventoryService'
import { prisma } from '@/server/db/client'

/**
 * `GET  /api/v1/inventory` — current stock, per variant, from both catalogues.
 * `POST /api/v1/inventory` — write back the counts NCOM keeps.
 *
 * **Scope.** The read covers everything a workspace sells and marks each row
 * with its `source`. The write reaches only products NCOM stores: a count on
 * the merchant's own website belongs to that website, is read live on every
 * request, and is changed in their own admin. Pushing one here would write to
 * nothing, so those lines are refused with a sentence saying why rather than
 * accepted and dropped. See docs/product-source.md.
 *
 * For the products it does own, this accepts both ways of expressing a change,
 * because the two mean different things and using the wrong one loses sales:
 *
 *   `available` is an absolute count — "there are 42". Right when the caller
 *   is the authority on stock and is telling us the answer, as a warehouse
 *   system does.
 *
 *   `delta` is a signed change — "12 more arrived", "2 damaged". Right when
 *   several systems move the same stock, because two concurrent absolute
 *   writes silently discard one of them while two deltas both apply.
 *
 * Variants can be addressed by our id, by SKU, or by the merchant's own
 * `externalId` on the product, so a caller does not have to store our ids to
 * use this at all.
 */

const lineSchema = z
  .object({
    variantId: z.string().min(1).optional(),
    sku: z.string().trim().min(1).optional(),
    locationId: z.string().min(1).optional(),
    available: z.number().int().min(0).optional(),
    delta: z.number().int().optional(),
    reason: z
      .enum(['MANUAL', 'RECEIVED', 'DAMAGED', 'CORRECTION', 'RESTOCK'])
      .default('MANUAL'),
    note: z.string().trim().max(500).optional(),
  })
  .refine((line) => line.variantId || line.sku, {
    message: 'Give either variantId or sku',
  })
  .refine(
    (line) => (line.available === undefined) !== (line.delta === undefined),
    {
      // Both at once has no sensible meaning and neither does neither, and
      // silently preferring one would make a caller's bug look like ours.
      message: 'Give exactly one of `available` or `delta`',
    }
  )

const writeSchema = z.object({
  updates: z.array(lineSchema).min(1).max(250),
})

export async function GET(request: Request) {
  return withApiKey('INVENTORY_READ', async ({ organizationId }) => {
    const url = new URL(request.url)
    const { limit, page, skip } = readPaging(request)

    const stock = url.searchParams.get('stock')

    const { items, total } = await listInventory(organizationId, {
      search: url.searchParams.get('search') ?? undefined,
      stock:
        stock === 'low' || stock === 'out' || stock === 'in' ? stock : 'all',
      take: limit,
      skip,
    })

    return apiOk({
      data: items.map((row) => ({
        variantId: row.id,
        productId: row.productId,
        productTitle: row.productTitle,
        variantTitle: row.title,
        sku: row.sku,
        barcode: row.barcode,
        // Null means nothing counts this line: an untracked local variant, or a
        // connected website that does not report a number. It is not zero, and
        // a client that renders it as zero will show a shop as sold out.
        available: row.available,
        inventoryPolicy: row.policy.toLowerCase(),
        // Which catalogue owns the number. Only `local` rows can be written
        // through the POST below; the rest are read from the merchant's site.
        source: row.source.toLowerCase(),
      })),
      pagination: { page, limit, total, hasMore: skip + items.length < total },
    })
  })
}

export async function POST(request: Request) {
  return withApiKey('INVENTORY_WRITE', async ({ organizationId, key }) => {
    const body = await readJson(request, writeSchema)
    if (!body.ok) return body.response

    // Resolved in one query rather than one per line: a sync pushing 250 SKUs
    // would otherwise open with 250 lookups before doing any work.
    const skus = body.data.updates
      .map((line) => line.sku)
      .filter((sku): sku is string => Boolean(sku))

    const skuMatches =
      skus.length === 0
        ? []
        : await prisma.productVariant.findMany({
            where: { sku: { in: skus }, product: { organizationId } },
            select: { id: true, sku: true },
          })

    /**
     * SKU → variant, plus the SKUs that name more than one of them.
     *
     * `sku` is indexed but not unique, and a catalogue imported from a system
     * that holds duplicate records of its own products routinely puts the same
     * SKU on several variants. Building a plain Map here kept whichever row the
     * database happened to return last and dropped the rest in silence, so a
     * sync updated one variant and left its twins holding whatever they already
     * had — permanently, because nothing ever reported the miss, and a stale
     * count reads as sellable stock. Which of several candidates a bare SKU
     * meant is not knowable from what the caller sent, so the row fails and says
     * so rather than being applied to an arbitrary one of them.
     */
    const bySku = new Map<string, string>()
    const ambiguousSku = new Map<string, number>()

    for (const variant of skuMatches) {
      const sku = variant.sku!
      if (bySku.has(sku)) {
        ambiguousSku.set(sku, (ambiguousSku.get(sku) ?? 1) + 1)
        continue
      }
      bySku.set(sku, variant.id)
    }

    const defaultLocation = await ensureDefaultLocation(organizationId)

    const targetKey = (variantId: string, locationId?: string) =>
      `${variantId}@${locationId ?? defaultLocation.id}`

    /**
     * Absolute writes aimed at the same shelf more than once in one batch.
     *
     * `available` states a fact about one (variant, location); two of them in a
     * batch are two contradictory facts, and applying both in order means the
     * last row silently wins while every earlier count is lost. That is how a
     * single variant took thirty-two absolute writes in one second and settled
     * on an arbitrary one of thirty-two figures, which the storefront then sold
     * against. A repeated `delta` is not a conflict — two receipts of five
     * legitimately make ten — so only absolute rows are counted here.
     *
     * Counted in a pass of its own so every row in a conflicting group fails
     * rather than only the later ones: the first row is no more trustworthy
     * than the rest, and applying it would keep the guess this exists to stop.
     */
    const absoluteTargets = new Map<string, number>()

    for (const line of body.data.updates) {
      if (line.available === undefined) continue

      const variantId =
        line.variantId ?? (line.sku ? bySku.get(line.sku) : undefined)
      if (!variantId) continue

      const key = targetKey(variantId, line.locationId)
      absoluteTargets.set(key, (absoluteTargets.get(key) ?? 0) + 1)
    }

    const applied: {
      variantId: string
      sku?: string
      available: number
    }[] = []
    const failed: { variantId?: string; sku?: string; error: string }[] = []

    /**
     * Rows where the stock we could move was less than the stock asked for.
     *
     * The docs promised a clamped delta was "reported", and it was not: a
     * request to remove 100 units from a shelf holding 2 returned exactly the
     * same body as a clean application, so a caller had no way to learn that 98
     * units it believed it had removed were never there. That is the difference
     * between two systems agreeing and two systems silently diverging.
     */
    const clamped: {
      variantId: string
      sku?: string
      requested: number
      applied: number
      available: number
    }[] = []

    for (const line of body.data.updates) {
      const variantId =
        line.variantId ?? (line.sku ? bySku.get(line.sku) : undefined)

      if (!variantId) {
        failed.push({
          sku: line.sku,
          variantId: line.variantId,
          error: line.sku
            ? 'No variant with that SKU'
            : 'No variant with that id',
        })
        continue
      }

      // Only when the SKU is what resolved the row. An explicit variantId is
      // unambiguous however many variants happen to share its SKU.
      if (!line.variantId && line.sku && ambiguousSku.has(line.sku)) {
        failed.push({
          sku: line.sku,
          error:
            `SKU “${line.sku}” is on ${ambiguousSku.get(line.sku)} variants in this ` +
            `workspace — address them by variantId, or make the SKU unique`,
        })
        continue
      }

      if (
        line.available !== undefined &&
        (absoluteTargets.get(targetKey(variantId, line.locationId)) ?? 0) > 1
      ) {
        failed.push({
          variantId,
          sku: line.sku,
          error:
            'This batch sets an absolute count for this variant and location more ' +
            'than once. Send one count per variant per location, or use `delta` ' +
            'if the changes are meant to add up',
        })
        continue
      }

      try {
        const note = line.note ?? `Synced by API key “${key.name}”`

        if (line.delta !== undefined) {
          const result = await adjustInventory(
            organizationId,
            {
              variantId,
              locationId: line.locationId ?? defaultLocation.id,
              delta: line.delta,
              reason: line.reason,
              note,
            },
            // Null actor: a key is not a person. Which key it was is in the note.
            null
          )

          applied.push({
            variantId,
            sku: line.sku,
            available: result.availableAfter,
          })

          if (result.appliedDelta !== result.requestedDelta) {
            clamped.push({
              variantId,
              sku: line.sku,
              requested: result.requestedDelta,
              applied: result.appliedDelta,
              available: result.availableAfter,
            })
          }
        } else {
          const result = await setVariantStock(
            organizationId,
            variantId,
            line.available!,
            null,
            { locationId: line.locationId, note }
          )

          // Null means the variant does not track stock — it is infinitely
          // available and has no count to set. Reported rather than counted as
          // applied, because a sync that believes it wrote 40 units to a
          // variant that ignores stock is wrong in a way it needs to see.
          if (!result) {
            failed.push({
              variantId,
              sku: line.sku,
              error:
                'This variant does not track inventory — switch tracking on before setting a count',
            })
            continue
          }

          applied.push({
            variantId,
            sku: line.sku,
            available: result.available,
          })

          if (result.clamped) {
            clamped.push({
              variantId,
              sku: line.sku,
              requested: result.requested,
              applied: result.available - result.availableBefore,
              available: result.available,
            })
          }
        }
      } catch (cause) {
        failed.push({
          variantId,
          sku: line.sku,
          error: cause instanceof Error ? cause.message : 'Update failed',
        })
      }
    }

    // Always 200, always one place for the per-row outcome.
    //
    // This used to move the failures to `error.errors` under a 422 when nothing
    // applied, so a client needed two code paths to read one concept and had to
    // know which shape it was about to get from a count it did not yet have.
    // The batch was accepted and processed either way; whether any row inside it
    // succeeded is what `applied` reports.
    return apiOk({
      data: {
        applied: applied.length,
        failed: failed.length,
        clamped: clamped.length,
        results: applied,
        errors: failed,
        clamps: clamped,
      },
    })
  })
}

export const runtime = 'nodejs'
