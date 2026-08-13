import { apiOk, readJson, withApiKey } from '@/server/api/context'
import {
  categoryPayload,
  createCategory,
  listCategoryTree,
  type CategoryNode,
} from '@/server/services/categoryService'
import { categorySchema } from '@/lib/validation/category'

/**
 * `GET /api/v1/categories` — the whole tree.
 * `POST /api/v1/categories` — create one.
 *
 * Returned nested by default because the shape carries the meaning: a flat list
 * with `parentId`s makes every consumer rebuild the tree, and they will each do
 * it slightly differently. `?flat=true` is there for the callers that genuinely
 * want rows, such as a spreadsheet export.
 */
export async function GET(request: Request) {
  return withApiKey('CATEGORIES_READ', async ({ organizationId }) => {
    const url = new URL(request.url)
    const tree = await listCategoryTree(organizationId)

    if (url.searchParams.get('flat') === 'true') {
      const flat: Record<string, unknown>[] = []
      const walk = (nodes: CategoryNode[]) => {
        for (const node of nodes) {
          flat.push({
            ...categoryPayload(node),
            productCount: node.productCount,
            totalProductCount: node.totalProductCount,
          })
          walk(node.children)
        }
      }
      walk(tree)
      return apiOk({ data: flat })
    }

    const toNested = (node: CategoryNode): Record<string, unknown> => ({
      ...categoryPayload(node),
      productCount: node.productCount,
      totalProductCount: node.totalProductCount,
      children: node.children.map(toNested),
    })

    return apiOk({ data: tree.map(toNested) })
  })
}

export async function POST(request: Request) {
  return withApiKey('CATEGORIES_WRITE', async ({ organizationId }) => {
    const body = await readJson(request, categorySchema)
    if (!body.ok) return body.response

    const category = await createCategory(organizationId, body.data)
    return apiOk({ data: categoryPayload(category) }, 201)
  })
}

export const runtime = 'nodejs'
