import {
  apiError,
  apiOk,
  readJson,
  readPaging,
  withApiKey,
} from '@/server/api/context'
import {
  createProduct,
  listOwnProducts,
  productPayload,
} from '@/server/services/productService'
import { descendantIds } from '@/server/services/categoryService'
import { createProductSchema } from '@/lib/validation/product'

/**
 * `GET /api/v1/products` — the products NCOM stores, paged.
 * `POST /api/v1/products` — create one.
 *
 * Both speak the shape `productPayload` produces, which is the same object a
 * `product.created` webhook carries. An integration written against one is
 * therefore already written against the other.
 *
 * **Scope.** These endpoints are about the catalogue NCOM *keeps* — the
 * products a merchant adds here for things their own shop does not carry. They
 * deliberately do not return, create or edit products read from a connected
 * website: those live on that website, are read live on every request, and the
 * way to change one is to change it there. See docs/product-source.md.
 *
 * That is the correction to an earlier design in which this endpoint was how a
 * merchant pushed their whole catalogue in and kept it in step with a nightly
 * sync. The sync is gone; this is not it coming back.
 */

export async function GET(request: Request) {
  return withApiKey('PRODUCTS_READ', async ({ organizationId }) => {
    const url = new URL(request.url)
    const { limit, page, skip } = readPaging(request)

    const status = url.searchParams.get('status')?.toUpperCase()
    const categoryId = url.searchParams.get('categoryId')

    const updatedSince = parseSince(url.searchParams.get('updatedSince'))
    if (updatedSince === 'invalid') {
      return apiError(
        'invalid_request',
        'updatedSince must be an ISO 8601 timestamp, e.g. 2026-08-14T09:00:00Z'
      )
    }

    const createdSince = parseSince(url.searchParams.get('createdSince'))
    if (createdSince === 'invalid') {
      return apiError(
        'invalid_request',
        'createdSince must be an ISO 8601 timestamp, e.g. 2026-08-14T09:00:00Z'
      )
    }

    const { items, total } = await listOwnProducts(organizationId, {
      search: url.searchParams.get('search') ?? undefined,
      updatedSince,
      createdSince,
      status:
        status === 'DRAFT' || status === 'ACTIVE' || status === 'ARCHIVED'
          ? status
          : undefined,
      // Filtering by a category means everything beneath it — asking for
      // "Womenswear" and getting only the products filed directly against the
      // department, rather than the dresses inside it, is never what a caller
      // means.
      categoryIds: categoryId
        ? await descendantIds(organizationId, categoryId)
        : undefined,
      take: limit,
      skip,
    })

    return apiOk({
      data: items.filter((item) => item !== null).map(productPayload),
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + items.length < total,
      },
    })
  })
}

export async function POST(request: Request) {
  return withApiKey('PRODUCTS_WRITE', async ({ organizationId }) => {
    const body = await readJson(request, createProductSchema)
    if (!body.ok) return body.response

    const product = await createProduct(organizationId, body.data)
    return apiOk({ data: productPayload(product) }, 201)
  })
}

/**
 * An ISO timestamp, or a clear refusal.
 *
 * Silently ignoring an unparseable `updatedSince` would be the worst outcome
 * available: the caller gets a 200 and the whole catalogue, concludes nothing
 * changed since their cursor, and quietly stops syncing.
 */
function parseSince(raw: string | null): Date | undefined | 'invalid' {
  if (raw === null || raw.trim() === '') return undefined

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? 'invalid' : parsed
}

// Node rather than edge: the service layer reaches Postgres through the pg
// driver adapter, and webhook signing uses node:crypto.
export const runtime = 'nodejs'
