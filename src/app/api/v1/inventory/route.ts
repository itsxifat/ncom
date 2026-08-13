import { z } from 'zod'
import {
  apiError,
  apiOk,
  readJson,
  readPaging,
  withApiKey,
} from '@/server/api/context'
import {
  adjustInventory,
  ensureDefaultLocation,
  listInventory,
  setVariantStock,
} from '@/server/services/inventoryService'
import { prisma } from '@/server/db/client'

/**
 * `GET  /api/v1/inventory` — current stock, per variant.
 * `POST /api/v1/inventory` — write stock back.
 *
 * This is the endpoint a two-way stock sync lives on. It accepts both ways of
 * expressing a change, because the two mean different things and using the
 * wrong one loses sales:
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
      locationId: url.searchParams.get('locationId') ?? undefined,
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
        available: row.totalAvailable,
        committed: row.totalCommitted,
        inventoryPolicy: row.inventoryPolicy.toLowerCase(),
        locations: row.levels.map((level) => ({
          id: level.locationId,
          name: level.locationName,
          available: level.available,
          committed: level.committed,
        })),
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

    const bySku = new Map(
      skus.length === 0
        ? []
        : (
            await prisma.productVariant.findMany({
              where: { sku: { in: skus }, product: { organizationId } },
              select: { id: true, sku: true },
            })
          ).map((variant) => [variant.sku!, variant.id])
    )

    const defaultLocation = await ensureDefaultLocation(organizationId)

    const applied: { variantId: string; available?: number; delta?: number }[] =
      []
    const failed: { variantId?: string; sku?: string; error: string }[] = []

    for (const line of body.data.updates) {
      const variantId =
        line.variantId ?? (line.sku ? bySku.get(line.sku) : undefined)

      if (!variantId) {
        failed.push({ sku: line.sku, error: 'No variant with that SKU' })
        continue
      }

      try {
        const note = line.note ?? `Synced by API key “${key.name}”`

        if (line.delta !== undefined) {
          await adjustInventory(
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
          applied.push({ variantId, delta: line.delta })
        } else {
          await setVariantStock(
            organizationId,
            variantId,
            line.available!,
            null,
            { locationId: line.locationId, note }
          )
          applied.push({ variantId, available: line.available })
        }
      } catch (cause) {
        failed.push({
          variantId,
          sku: line.sku,
          error: cause instanceof Error ? cause.message : 'Update failed',
        })
      }
    }

    if (applied.length === 0 && failed.length > 0) {
      return apiError('invalid_request', 'No stock updates could be applied.', {
        errors: failed,
      })
    }

    return apiOk({
      data: { applied: applied.length, failed: failed.length, errors: failed },
    })
  })
}

export const runtime = 'nodejs'
