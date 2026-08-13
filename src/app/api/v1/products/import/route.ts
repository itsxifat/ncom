import { z } from 'zod'
import { apiOk, readJson, withApiKey } from '@/server/api/context'
import { upsertProductByExternalId } from '@/server/services/productService'
import { createProductSchema } from '@/lib/validation/product'

/**
 * `POST /api/v1/products/import` — bring a catalogue over from another system.
 *
 * Three things make this usable against a real store rather than a demo:
 *
 *   It is keyed on `externalId`, the id the product already has upstream, so
 *   running the import twice updates rather than duplicates. Imports get run
 *   twice constantly — a timeout, a retried page, someone testing.
 *
 *   It is partial-failure tolerant. One product with a bad price does not
 *   abort the batch and roll back the ninety-nine that were fine; the response
 *   says which rows failed and why, so the caller can fix and re-send just
 *   those. An all-or-nothing import of 5,000 products fails forever on row
 *   4,999.
 *
 *   It is bounded per request, so the caller paginates. That keeps each call
 *   inside a sane request timeout and keeps one tenant's import from monopolising
 *   a connection for minutes.
 */

/**
 * Products per request.
 *
 * Each one can create options, images and a variant matrix, so a hundred is
 * already several hundred writes — enough that a catalogue moves in a
 * reasonable number of calls, small enough to finish well inside a request.
 */
const MAX_BATCH = 100

const productSchema = createProductSchema.extend({
  externalId: z
    .string()
    .trim()
    .min(1, 'externalId is required for imported products')
    .max(200),
})

/**
 * The envelope only.
 *
 * Individual products are deliberately *not* validated here. Validating the
 * whole array up front means one malformed row rejects the entire request —
 * which is exactly the all-or-nothing behaviour this endpoint exists to avoid,
 * and it is invisible in testing until a real catalogue contains one product
 * with no price. Each row is parsed inside the loop instead, so a bad one lands
 * in `errors` beside the ninety-nine that imported.
 */
const importSchema = z.object({
  products: z
    .array(z.unknown())
    .min(1, 'Send at least one product')
    .max(MAX_BATCH, `Send at most ${MAX_BATCH} products per request`),
  /** Recorded on each row, so a merchant can see where a product came from. */
  source: z.string().trim().max(80).optional(),
})

export async function POST(request: Request) {
  return withApiKey('PRODUCTS_WRITE', async ({ organizationId }) => {
    const body = await readJson(request, importSchema)
    if (!body.ok) return body.response

    const created: string[] = []
    const updated: string[] = []
    const failed: { externalId: string; error: string }[] = []

    // Sequential rather than Promise.all: each product is several writes, and
    // a hundred of those in parallel would exhaust the connection pool that
    // every other tenant on this instance is sharing.
    for (const [index, raw] of body.data.products.entries()) {
      // Read before validating, so a row that fails validation can still be
      // reported under the id the caller knows it by rather than as "row 37".
      const externalId =
        typeof raw === 'object' &&
        raw !== null &&
        'externalId' in raw &&
        typeof raw.externalId === 'string'
          ? raw.externalId
          : `#${index}`

      const parsed = productSchema.safeParse(raw)
      if (!parsed.success) {
        failed.push({
          externalId,
          error: parsed.error.issues
            .map(
              (issue) =>
                `${issue.path.join('.') || 'product'}: ${issue.message}`
            )
            .join('; '),
        })
        continue
      }

      try {
        const result = await upsertProductByExternalId(organizationId, {
          ...parsed.data,
          externalSource:
            body.data.source ?? parsed.data.externalSource ?? null,
        })

        if (result.created) created.push(result.product.id)
        else updated.push(result.product.id)
      } catch (cause) {
        failed.push({
          externalId,
          error: cause instanceof Error ? cause.message : 'Import failed',
        })
      }
    }

    // 200 even with failures, because the batch itself was processed and the
    // per-row outcome is in the body. A 4xx here would tell a caller to retry
    // the whole batch, re-importing everything that already succeeded.
    return apiOk({
      data: {
        created: created.length,
        updated: updated.length,
        failed: failed.length,
        createdIds: created,
        updatedIds: updated,
        errors: failed,
      },
    })
  })
}

export const runtime = 'nodejs'
