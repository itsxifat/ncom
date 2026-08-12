'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin } from '@/server/auth/rbac'
import { subscriptionAdminSchema } from '@/lib/validation/plan'
import {
  setSubscriptionAddonAsAdmin,
  updateSubscriptionAsAdmin,
} from '@/server/services/planAdminService'
import {
  activateOrder,
  cancelOrder,
} from '@/server/services/planCheckoutService'
import { resetMonthlyUsage } from '@/server/services/usageService'

export type SubscriptionFormState =
  { error?: string; notice?: string } | undefined

export async function saveSubscriptionAction(
  _prevState: SubscriptionFormState,
  formData: FormData
): Promise<SubscriptionFormState> {
  const parsed = subscriptionAdminSchema.safeParse(
    Object.fromEntries(formData.entries())
  )

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the fields.' }
  }

  try {
    await updateSubscriptionAsAdmin(parsed.data)
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Could not save the subscription.',
    }
  }

  revalidatePath('/admin/subscriptions')
  revalidatePath(`/admin/subscriptions/${parsed.data.organizationId}`)
  return { notice: 'Saved. New limits apply on the next request.' }
}

export async function setAddonQuantityAction(input: {
  organizationId: string
  addonId: string
  quantity: number
}): Promise<{ error?: string }> {
  try {
    await setSubscriptionAddonAsAdmin(input)
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Could not update the add-on.',
    }
  }

  revalidatePath(`/admin/subscriptions/${input.organizationId}`)
  return {}
}

/**
 * Marks an order paid and switches the plan on.
 *
 * The manual half of the payment seam: with no gateway, this is how an order that
 * was settled by bank transfer (or waived) becomes real access. Authorisation is
 * done here because `activateOrder` is written to also be callable by a future
 * webhook, which has no session to check.
 */
export async function activateOrderAction(
  orderId: string,
  organizationId: string
): Promise<{ error?: string }> {
  const session = await requirePlatformAdmin()

  try {
    await activateOrder(orderId, {
      actorUserId: session.user.id,
      provider: 'manual',
      markPaid: true,
    })
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Could not activate the order.',
    }
  }

  revalidatePath(`/admin/subscriptions/${organizationId}`)
  revalidatePath('/admin/subscriptions')
  return {}
}

export async function cancelOrderAction(
  orderId: string,
  organizationId: string
): Promise<{ error?: string }> {
  const session = await requirePlatformAdmin()

  try {
    await cancelOrder(orderId, {
      actorUserId: session.user.id,
      reason: 'Cancelled by platform admin',
    })
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Could not cancel the order.',
    }
  }

  revalidatePath(`/admin/subscriptions/${organizationId}`)
  return {}
}

/** Clears this month's traffic/visitor counters for a workspace. */
export async function resetUsageAction(
  organizationId: string
): Promise<{ error?: string }> {
  await requirePlatformAdmin()

  try {
    await resetMonthlyUsage(organizationId)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not reset usage.',
    }
  }

  revalidatePath('/admin/usage')
  revalidatePath(`/admin/subscriptions/${organizationId}`)
  return {}
}
