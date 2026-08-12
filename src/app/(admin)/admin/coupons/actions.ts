'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { couponFormSchema } from '@/lib/validation/plan'
import {
  deleteOrRetireCoupon,
  upsertCoupon,
} from '@/server/services/planAdminService'

export type CouponFormState =
  { error?: string; fieldErrors?: Record<string, string> } | undefined

export async function saveCouponAction(
  couponId: string | null,
  _prevState: CouponFormState,
  formData: FormData
): Promise<CouponFormState> {
  const parsed = couponFormSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    // Checkbox groups need getAll — see the note in the add-on action.
    planIds: formData.getAll('planIds').map(String),
    allowedIntervals: formData.getAll('allowedIntervals').map(String),
  })

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { error: 'Check the highlighted fields.', fieldErrors }
  }

  try {
    await upsertCoupon(couponId, parsed.data)
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message.includes('Unique constraint')
          ? 'That code is already in use.'
          : error instanceof Error
            ? error.message
            : 'Could not save the coupon.',
    }
  }

  revalidatePath('/admin/coupons')
  redirect('/admin/coupons')
}

export async function deleteCouponAction(
  couponId: string
): Promise<{ error?: string; outcome?: 'deleted' | 'deactivated' }> {
  try {
    const outcome = await deleteOrRetireCoupon(couponId)
    revalidatePath('/admin/coupons')
    return { outcome }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Could not remove the coupon.',
    }
  }
}
