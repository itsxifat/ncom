import { apiError, apiOk, readJson, withApiKey } from '@/server/api/context'
import {
  deleteProduct,
  getEditableProduct,
  productPayload,
  updateProduct,
} from '@/server/services/productService'
import { prisma } from '@/server/db/client'
import { updateProductSchema } from '@/lib/validation/product'

/**
 * One of NCOM's own products, by our id or by the caller's own.
 *
 * Products on a connected website are not addressable here — they are read live
 * from that site and edited there, and an endpoint that returned one but could
 * not change it would be a trap. See docs/product-source.md.
 *
 * `externalId:` as a prefix resolves the merchant's own identifier — the id
 * their system already has for this product. Without it, every integration has
 * to keep a mapping table from their ids to ours and consult it before each
 * call, which is a second source of truth that goes stale the first time a
 * product is created on one side only.
 */
async function resolveProductId(
  organizationId: string,
  raw: string
): Promise<string | null> {
  const decoded = decodeURIComponent(raw)

  if (decoded.startsWith('externalId:')) {
    const externalId = decoded.slice('externalId:'.length)
    const product = await prisma.product.findFirst({
      where: { organizationId, externalId },
      select: { id: true },
    })
    return product?.id ?? null
  }

  return decoded
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  return withApiKey('PRODUCTS_READ', async ({ organizationId }) => {
    const { productId } = await params
    const id = await resolveProductId(organizationId, productId)
    if (!id) return apiError('not_found', 'No product with that id.')

    const product = await getEditableProduct(organizationId, id)
    if (!product) {
      return apiError(
        'not_found',
        'No product with that id in this workspace. Products on your connected website are read from there, not through this endpoint.'
      )
    }

    return apiOk({ data: productPayload(product) })
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  return withApiKey('PRODUCTS_WRITE', async ({ organizationId }) => {
    const { productId } = await params
    const id = await resolveProductId(organizationId, productId)
    if (!id) return apiError('not_found', 'No product with that id.')

    const body = await readJson(request, updateProductSchema)
    if (!body.ok) return body.response

    const product = await updateProduct(organizationId, id, body.data)
    return apiOk({ data: productPayload(product) })
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  return withApiKey('PRODUCTS_WRITE', async ({ organizationId }) => {
    const { productId } = await params
    const id = await resolveProductId(organizationId, productId)
    if (!id) return apiError('not_found', 'No product with that id.')

    // Refuses products that appear on an order — see deleteProduct. The caller
    // is told to archive instead, which is the operation they actually want.
    await deleteProduct(organizationId, id)
    return apiOk({ data: { id, deleted: true } })
  })
}

export const runtime = 'nodejs'
