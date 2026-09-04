import { z } from 'zod'
import { apiError, apiOk, readJson, withApiKey } from '@/server/api/context'
import {
  categoryPayload,
  deleteCategory,
  getEditableCategory,
  updateCategory,
} from '@/server/services/categoryService'
import { updateCategorySchema } from '@/lib/validation/category'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  return withApiKey('CATEGORIES_READ', async ({ organizationId }) => {
    const { categoryId } = await params
    const category = await getEditableCategory(organizationId, categoryId)
    if (!category) {
      return apiError(
        'not_found',
        'No category with that id in this workspace. Categories on your connected website are read from there, not through this endpoint.'
      )
    }

    return apiOk({ data: categoryPayload(category) })
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  return withApiKey('CATEGORIES_WRITE', async ({ organizationId }) => {
    const { categoryId } = await params
    const body = await readJson(request, updateCategorySchema)
    if (!body.ok) return body.response

    const category = await updateCategory(organizationId, categoryId, body.data)
    return apiOk({ data: categoryPayload(category) })
  })
}

const deleteQuerySchema = z.enum(['reparent', 'cascade']).catch('reparent')

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  return withApiKey('CATEGORIES_WRITE', async ({ organizationId }) => {
    const { categoryId } = await params
    const url = new URL(request.url)

    // Defaults to lifting the children rather than deleting the branch: an
    // integration deleting a category by mistake should cost one label, not a
    // department. `?mode=cascade` is the explicit opt-in.
    const mode = deleteQuerySchema.parse(url.searchParams.get('mode'))

    await deleteCategory(organizationId, categoryId, mode)
    return apiOk({ data: { id: categoryId, deleted: true, mode } })
  })
}

export const runtime = 'nodejs'
