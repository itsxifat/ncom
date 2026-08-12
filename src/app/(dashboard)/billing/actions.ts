'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getActiveOrganization } from '@/server/services/organizationService'
import { AuthorizationError } from '@/server/auth/rbac'
import {
  CheckoutError,
  cancelSubscription,
  quoteCheckout,
  resumeSubscription,
  startCheckout,
  type CheckoutQuote,
} from '@/server/services/planCheckoutService'
import { getPlatformFlag } from '@/server/services/platformFlagService'
import { sendEmail } from '@/server/services/emailService'
import {
  planActivatedEmail,
  planOrderPendingEmail,
} from '@/server/email/templates'
import { formatMoney } from '@/lib/money'

export type BillingActionState = { error?: string; notice?: string } | undefined

const checkoutInputSchema = z.object({
  planId: z.string().min(1),
  interval: z.enum(['MONTHLY', 'ANNUAL']),
  couponCode: z.string().trim().max(60).optional(),
  addons: z
    .array(
      z.object({
        addonId: z.string().min(1),
        quantity: z.coerce.number().int().min(0),
      })
    )
    .default([]),
})

/** Reads the add-on quantity inputs, which are named `addon:<id>`. */
function addonsFromForm(formData: FormData) {
  const addons: { addonId: string; quantity: number }[] = []
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('addon:')) continue
    const quantity = Number(value)
    if (Number.isFinite(quantity) && quantity > 0) {
      addons.push({ addonId: key.slice('addon:'.length), quantity })
    }
  }
  return addons
}

/**
 * Re-prices the checkout without buying anything.
 *
 * Used by the coupon field and the monthly/annual toggle, so the total the
 * customer sees always comes from the same code that will charge them.
 */
export async function quoteCheckoutAction(
  _prevState: { quote?: CheckoutQuote; error?: string } | undefined,
  formData: FormData
): Promise<{ quote?: CheckoutQuote; error?: string }> {
  const { organization } = await getActiveOrganization()

  const parsed = checkoutInputSchema.safeParse({
    planId: formData.get('planId'),
    interval: formData.get('interval'),
    couponCode: formData.get('couponCode') || undefined,
    addons: addonsFromForm(formData),
  })
  if (!parsed.success) return { error: 'Pick a plan and billing period.' }

  const couponsEnabled = await getPlatformFlag('billing.couponsEnabled')

  try {
    const quote = await quoteCheckout({
      organizationId: organization.id,
      planId: parsed.data.planId,
      interval: parsed.data.interval,
      addons: parsed.data.addons,
      couponCode: couponsEnabled ? parsed.data.couponCode : null,
    })
    return { quote }
  } catch (error) {
    return { error: messageFor(error, 'Could not price that plan.') }
  }
}

export async function checkoutAction(
  _prevState: BillingActionState,
  formData: FormData
): Promise<BillingActionState> {
  const { organization, session } = await getActiveOrganization()

  if (!(await getPlatformFlag('billing.selfServeUpgrades'))) {
    return {
      error:
        'Plan changes are handled by our team at the moment — get in touch and we will set it up.',
    }
  }

  const parsed = checkoutInputSchema.safeParse({
    planId: formData.get('planId'),
    interval: formData.get('interval'),
    couponCode: formData.get('couponCode') || undefined,
    addons: addonsFromForm(formData),
  })
  if (!parsed.success) return { error: 'Pick a plan and billing period.' }

  const couponsEnabled = await getPlatformFlag('billing.couponsEnabled')

  let result
  try {
    result = await startCheckout({
      organizationId: organization.id,
      planId: parsed.data.planId,
      interval: parsed.data.interval,
      addons: parsed.data.addons,
      couponCode: couponsEnabled ? parsed.data.couponCode : null,
    })
  } catch (error) {
    return { error: messageFor(error, 'Could not complete the change.') }
  }

  // Confirmation mail is best effort — the plan is already live (or already
  // recorded), and failing the action over an SMTP problem would tell the
  // customer their upgrade did not happen when it did.
  if (session.user.email) {
    const planName = formData.get('planName')?.toString() ?? 'your new plan'
    const totalLabel = formatMoney(result.totalCents, result.currencyCode)

    const rendered = result.activated
      ? planActivatedEmail({
          workspaceName: organization.name,
          planName,
          totalLabel,
          couponCode: couponsEnabled ? (parsed.data.couponCode ?? null) : null,
        })
      : planOrderPendingEmail({
          workspaceName: organization.name,
          planName,
          totalLabel,
        })

    await sendEmail({
      purpose: 'BILLING',
      to: session.user.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    })
  }

  revalidatePath('/billing')
  revalidatePath('/', 'layout')
  redirect(
    result.activated
      ? '/billing?activated=1'
      : `/billing?pending=${result.orderId}`
  )
}

export async function cancelSubscriptionAction(): Promise<BillingActionState> {
  const { organization } = await getActiveOrganization()

  try {
    await cancelSubscription(organization.id)
  } catch (error) {
    return { error: messageFor(error, 'Could not schedule the cancellation.') }
  }

  revalidatePath('/billing')
  return {
    notice:
      'Your plan will end when the current period does. You keep everything until then.',
  }
}

export async function resumeSubscriptionAction(): Promise<BillingActionState> {
  const { organization } = await getActiveOrganization()

  try {
    await resumeSubscription(organization.id)
  } catch (error) {
    return { error: messageFor(error, 'Could not resume the plan.') }
  }

  revalidatePath('/billing')
  return { notice: 'Cancellation called off — your plan continues.' }
}

/**
 * Turns a thrown error into something worth showing.
 *
 * `CheckoutError` and `AuthorizationError` messages are written for customers;
 * anything else could be a database or provider detail, so it is replaced with
 * the caller's fallback.
 */
function messageFor(error: unknown, fallback: string): string {
  if (error instanceof CheckoutError) return error.message
  if (error instanceof AuthorizationError) {
    return 'Only a workspace owner can change the plan.'
  }
  return fallback
}
