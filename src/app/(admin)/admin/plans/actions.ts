'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { planFormSchema } from '@/lib/validation/plan'
import {
  createPlan,
  deletePlan,
  updatePlan,
} from '@/server/services/planAdminService'

export type PlanFormState =
  { error?: string; fieldErrors?: Record<string, string> } | undefined

/**
 * Turns FormData into the shape the schema expects.
 *
 * Every value arrives as a string, and unticked checkboxes do not arrive at all,
 * which `checkbox` in the schema already handles. Numeric and quota fields are
 * left as strings here on purpose — the schema owns coercion, so there is one
 * place where "" means unlimited.
 */
function toObject(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(formData.entries())
}

function fieldErrorsFrom(
  issues: { path: (string | number | symbol)[]; message: string }[]
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !errors[key]) errors[key] = issue.message
  }
  return errors
}

export async function savePlanAction(
  planId: string | null,
  _prevState: PlanFormState,
  formData: FormData
): Promise<PlanFormState> {
  const parsed = planFormSchema.safeParse(toObject(formData))

  if (!parsed.success) {
    return {
      error: 'Check the highlighted fields.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    }
  }

  try {
    if (planId) {
      await updatePlan(planId, parsed.data)
    } else {
      await createPlan(parsed.data)
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? // A duplicate `code` is the realistic failure and Prisma's own
            // message is unreadable, so it is translated.
            error.message.includes('Unique constraint')
            ? 'A plan with that code already exists.'
            : error.message
          : 'Could not save the plan.',
    }
  }

  revalidatePath('/admin/plans')
  redirect('/admin/plans')
}

export async function deletePlanAction(
  planId: string
): Promise<{ error?: string }> {
  try {
    await deletePlan(planId)
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Could not delete the plan.',
    }
  }

  revalidatePath('/admin/plans')
  return {}
}
