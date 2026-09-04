'use server'

/**
 * Category server actions.
 *
 * The tree is edited from three places — the tree page, the category form and
 * the product editor's quick-create — so the actions live in one module rather
 * than beside any one of them.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  assignProductsToCategory,
  createCategory,
  deleteCategory,
  reorderCategories,
  updateCategory,
} from '@/server/services/categoryService'
import { categorySchema } from '@/lib/validation/category'
import type { StoreActionState } from '@/app/(dashboard)/commerce-actions'

async function org() {
  const { organization } = await getActiveOrganization()
  return organization.id
}

function fail(cause: unknown): StoreActionState {
  return {
    error: cause instanceof Error ? cause.message : 'Something went wrong',
  }
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  return issue
    ? `${issue.path.join('.') || 'Form'}: ${issue.message}`
    : 'Invalid input'
}

/**
 * Creates or updates a category from the full form.
 *
 * Posts as one JSON field for the same reason the product editor does: the form
 * carries booleans and a nullable parent, and FormData's "absent means false,
 * empty string means null, sometimes" conventions are where those quietly go
 * wrong.
 */
export async function saveCategoryAction(
  categoryId: string | null,
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  let payload: unknown
  try {
    payload = JSON.parse(String(formData.get('payload') ?? '{}'))
  } catch {
    return { error: 'Could not read the form.' }
  }

  const parsed = categorySchema.safeParse(payload)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  let destination: string
  try {
    const organizationId = await org()

    if (categoryId) {
      await updateCategory(organizationId, categoryId, {
        ...parsed.data,
        // `parentId` is meaningful when null (move to the top level), so it is
        // always sent rather than omitted when empty.
        parentId: parsed.data.parentId ?? null,
      })
      destination = `/categories/${categoryId}`
    } else {
      const created = await createCategory(organizationId, parsed.data)
      destination = `/categories/${created.id}`
    }
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/categories')
  revalidatePath('/products')
  redirect(destination)
}

/** Quick-create from a picker, returning the new row rather than redirecting. */
export async function createCategoryInlineAction(
  name: string,
  parentId: string | null
): Promise<
  | { ok: true; category: { id: string; name: string; level: number } }
  | { ok: false; error: string }
> {
  try {
    const organizationId = await org()
    const category = await createCategory(organizationId, {
      name,
      parentId,
      isActive: true,
      isFeatured: false,
      position: 0,
    })

    revalidatePath('/categories')
    return {
      ok: true,
      category: {
        id: category.id,
        name: category.name,
        level: category.level,
      },
    }
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : 'Could not create it',
    }
  }
}

export async function deleteCategoryAction(
  categoryId: string,
  mode: 'reparent' | 'cascade'
): Promise<StoreActionState> {
  try {
    await deleteCategory(await org(), categoryId, mode)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/categories')
  revalidatePath('/products')
  return { success: 'Category deleted.' }
}

export async function reorderCategoriesAction(
  orderedIds: string[]
): Promise<StoreActionState> {
  try {
    await reorderCategories(await org(), orderedIds)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/categories')
  return { success: 'Order saved.' }
}

export async function setCategoryActiveAction(
  categoryId: string,
  isActive: boolean
): Promise<StoreActionState> {
  try {
    await updateCategory(await org(), categoryId, { isActive })
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/categories')
  return { success: isActive ? 'Category shown.' : 'Category hidden.' }
}

/** Files several products at once, from the products list's bulk bar. */
export async function assignProductsToCategoryAction(
  productIds: string[],
  categoryId: string | null
): Promise<StoreActionState> {
  try {
    const { count } = await assignProductsToCategory(
      await org(),
      productIds,
      categoryId
    )

    revalidatePath('/products')
    revalidatePath('/categories')
    return {
      success: categoryId
        ? `Filed ${count} ${count === 1 ? 'product' : 'products'}.`
        : `Removed ${count} ${count === 1 ? 'product' : 'products'} from their category.`,
    }
  } catch (cause) {
    return fail(cause)
  }
}
