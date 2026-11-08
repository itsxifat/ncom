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
import { CreditError, orderCreditPack } from '@/server/services/aiCreditService'
import {
  BillingPaymentError,
  startPayment,
} from '@/server/services/billingPaymentService'
import { onlinePaymentAvailable } from '@/server/services/enfinitoPaySettingsService'
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

  // Something to pay: straight on to Enfinito Pay. The plan switches on when
  // the payment is confirmed, and that sends its own email. A payment page
  // that will not open leaves the order waiting, with a Pay button on Billing.
  if (!result.activated && (await onlinePaymentAvailable())) {
    let payUrl: string
    try {
      payUrl = (await startPayment(organization.id, 'plan', result.orderId)).url
    } catch (error) {
      console.error('[billing] could not open the payment page', error)
      redirect(`/billing?pending=${result.orderId}&payment=unavailable`)
    }
    redirect(payUrl)
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

/**
 * Orders an AI credit pack. A paid pack comes back with the Enfinito Pay page
 * to send the owner to, and its credits are added once the payment is
 * confirmed; a free pack is added at once. Without online payment, the order
 * waits for the platform team, as it always did.
 */
export async function orderCreditPackAction(
  packId: string
): Promise<
  { ok: true; paid: boolean; payUrl?: string } | { ok: false; error: string }
> {
  const { organization } = await getActiveOrganization()
  try {
    const result = await orderCreditPack(organization.id, packId)
    revalidatePath('/billing')
    if (result.paid || !(await onlinePaymentAvailable())) {
      return { ok: true, paid: result.paid }
    }
    const { url } = await startPayment(
      organization.id,
      'credits',
      result.orderId
    )
    return { ok: true, paid: false, payUrl: url }
  } catch (cause) {
    if (cause instanceof CreditError || cause instanceof BillingPaymentError)
      return { ok: false, error: cause.message }
    if (cause instanceof AuthorizationError) {
      return { ok: false, error: 'Only the workspace owner can buy credits.' }
    }
    throw cause
  }
}

/**
 * Pays an order still waiting for payment — one whose payment page was
 * closed, or that expired. Goes to Enfinito Pay, back to the open checkout if
 * there is one.
 */
export async function payOrderAction(
  kind: 'plan' | 'credits',
  orderId: string
): Promise<{ url: string } | { error: string }> {
  const { organization } = await getActiveOrganization()
  try {
    return await startPayment(organization.id, kind, orderId)
  } catch (cause) {
    if (cause instanceof BillingPaymentError) return { error: cause.message }
    if (cause instanceof AuthorizationError) {
      return { error: 'Only the workspace owner can pay for the workspace.' }
    }
    throw cause
  }
}
