import { apiOk, readJson, readPaging, withApiKey } from '@/server/api/context'
import {
  createProduct,
  listProducts,
  productPayload,
} from '@/server/services/productService'
import { descendantIds } from '@/server/services/categoryService'
import { createProductSchema } from '@/lib/validation/product'

/**
 * `GET /api/v1/products` — the catalogue, paged.
 * `POST /api/v1/products` — create one.
 *
 * Both speak the shape `productPayload` produces, which is the same object a
 * `product.created` webhook carries. An integration written against one is
 * therefore already written against the other.
 */

export async function GET(request: Request) {
  return withApiKey('PRODUCTS_READ', async ({ organizationId }) => {
    const url = new URL(request.url)
    const { limit, page, skip } = readPaging(request)

    const status = url.searchParams.get('status')?.toUpperCase()
    const categoryId = url.searchParams.get('categoryId')

    const { items, total } = await listProducts(organizationId, {
      search: url.searchParams.get('search') ?? undefined,
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
      sort: 'updated',
      take: limit,
      skip,
    })

    return apiOk({
      data: items.map(productPayload),
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

// Node rather than edge: the service layer reaches Postgres through the pg
// driver adapter, and webhook signing uses node:crypto.
export const runtime = 'nodejs'
