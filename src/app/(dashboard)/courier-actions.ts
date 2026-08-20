'use server'

/**
 * Courier automation, from the dashboard.
 *
 * Kept apart from commerce-actions because these govern *shipping decisions* —
 * who gets a parcel, on whose judgement, and under which courier account —
 * rather than the catalogue. Everything that changes a rule or a credential is
 * admin-only; releasing or refusing a single held order is open to editors,
 * because that is a day-to-day operations job and queueing it behind an admin
 * means parcels sit unshipped overnight.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  deleteCourierConfig,
  rotateCourierWebhookToken,
  saveCourierConfig,
  setCourierWebhookSecret,
  suggestWebhookSecret,
  testCourierConnection,
} from '@/server/services/courierConfigService'
import {
  checkPhoneForMerchant,
  updateCourierSettings,
} from '@/server/services/fraudCheckService'
import {
  approveOrderForDispatch,
  dispatchOrder,
  rejectHeldOrder,
  rescreenOrder,
  setOrderWorkflowState,
} from '@/server/services/courierService'
import {
  addFraudAccount,
  removeFraudAccount,
  setFraudAccountActive,
  testFraudAccounts,
} from '@/server/services/fraudAccountService'
import {
  courierAutomationSchema,
  courierProviderSchema,
  fraudAccountSchema,
  percentToBasisPoints,
  phoneLookupSchema,
} from '@/lib/validation/courier'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { minorUnitsPerMajor } from '@/lib/money'
import type { CourierProvider } from '@/generated/prisma/enums'
import type { ManualWorkflowState } from '@/server/courier/statusMap'

export type CourierActionState =
  { error?: string; success?: string } | undefined

async function org() {
  const { organization } = await getActiveOrganization()
  return organization.id
}

function fail(cause: unknown): CourierActionState {
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

// ── Courier accounts ─────────────────────────────────────────────────────

/**
 * Saves one courier's credentials.
 *
 * Blank secret fields are dropped rather than written, so submitting the form
 * without retyping a password keeps the stored one — the browser was never sent
 * it and cannot echo it back.
 */
export async function saveCourierAction(
  _prev: CourierActionState,
  formData: FormData
): Promise<CourierActionState> {
  const credentials: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (
      key.startsWith('credential.') &&
      typeof value === 'string' &&
      value.trim()
    ) {
      credentials[key.slice('credential.'.length)] = value.trim()
    }
  }

  const settings: Record<string, unknown> = {}
  const storeId = formData.get('setting.storeId')
  if (typeof storeId === 'string' && storeId.trim()) {
    settings.storeId = storeId.trim()
  }
  const defaultWeight = formData.get('setting.defaultWeightKg')
  if (typeof defaultWeight === 'string' && defaultWeight.trim()) {
    const weight = Number(defaultWeight)
    if (Number.isFinite(weight)) settings.defaultWeightKg = weight
  }

  const provider = courierProviderSchema.safeParse(formData.get('provider'))
  if (!provider.success) return { error: 'Unknown courier' }

  try {
    await saveCourierConfig(await org(), {
      provider: provider.data,
      displayName: String(formData.get('displayName') ?? '') || undefined,
      isEnabled: formData.get('isEnabled') === 'on',
      testMode: formData.get('testMode') === 'on',
      isDefault: formData.get('isDefault') === 'on',
      credentials,
      settings,
    })
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/settings/courier')
  return {
    success: 'Courier saved. Run the connection test to confirm it works.',
  }
}

/**
 * Runs the connection test and reports what the courier said.
 *
 * Returns the detail rather than a bare boolean because "it failed" is not
 * actionable and "recipient_phone must be 11 characters" is.
 */
export async function testCourierAction(provider: CourierProvider) {
  try {
    const result = await testCourierConnection(await org(), provider)
    revalidatePath('/settings/courier')
    return {
      ok: result.ok,
      detail: result.detail,
      stores: result.stores ?? null,
    }
  } catch (cause) {
    return {
      ok: false,
      detail: cause instanceof Error ? cause.message : 'The test failed',
      stores: null,
    }
  }
}

// ── Fraud screening accounts ─────────────────────────────────────────────
//
// Separate from the courier credentials above: these are merchant portal
// logins that read other merchants' delivery outcomes, and a store keeps
// several because the portal locks and rate-limits them.

export async function addFraudAccountAction(
  _prev: CourierActionState,
  formData: FormData
): Promise<CourierActionState> {
  const parsed = fraudAccountSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    label: formData.get('label') || undefined,
  })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  try {
    await addFraudAccount(await org(), parsed.data)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/settings/courier')
  return { success: 'Account added. Test it to confirm the login works.' }
}

export async function removeFraudAccountAction(accountId: string) {
  try {
    await removeFraudAccount(await org(), accountId)
    revalidatePath('/settings/courier')
    return { ok: true as const }
  } catch (cause) {
    return { ok: false as const, error: fail(cause)?.error }
  }
}

export async function toggleFraudAccountAction(
  accountId: string,
  isActive: boolean
) {
  try {
    await setFraudAccountActive(await org(), accountId, isActive)
    revalidatePath('/settings/courier')
    return { ok: true as const }
  } catch (cause) {
    return { ok: false as const, error: fail(cause)?.error }
  }
}

/**
 * Signs in to every account and reports each one separately.
 *
 * Per-account rather than "does screening work": one healthy login otherwise
 * masks three dead ones, and the merchant finds out when the last one locks.
 */
export async function testFraudAccountsAction() {
  try {
    const result = await testFraudAccounts(await org())
    revalidatePath('/settings/courier')
    return { ok: true as const, ...result }
  } catch (cause) {
    return { ok: false as const, error: fail(cause)?.error }
  }
}

export async function deleteCourierAction(provider: CourierProvider) {
  try {
    await deleteCourierConfig(await org(), provider)
    revalidatePath('/settings/courier')
    return { ok: true as const }
  } catch (cause) {
    return { ok: false as const, error: fail(cause)?.error }
  }
}

/** Issues a fresh callback URL. The old one stops working immediately. */
export async function rotateCourierWebhookAction(provider: CourierProvider) {
  try {
    const token = await rotateCourierWebhookToken(await org(), provider)
    revalidatePath('/settings/courier')
    return { ok: true as const, token }
  } catch (cause) {
    return { ok: false as const, error: fail(cause)?.error }
  }
}

/**
 * Stores the shared secret the courier will present on inbound calls.
 *
 * Returns a generated one when the merchant did not supply their own, so the
 * common path is "click, copy, paste into the courier panel" rather than
 * "invent a random string yourself", which people do badly.
 */
export async function setCourierWebhookSecretAction(
  provider: CourierProvider,
  secret: string | null
) {
  try {
    const value = secret?.trim() ? secret.trim() : suggestWebhookSecret()
    await setCourierWebhookSecret(await org(), provider, value)
    revalidatePath('/settings/courier')
    return { ok: true as const, secret: value }
  } catch (cause) {
    return { ok: false as const, error: fail(cause)?.error }
  }
}

// ── Automation rules ─────────────────────────────────────────────────────

export async function saveCourierAutomationAction(
  _prev: CourierActionState,
  formData: FormData
): Promise<CourierActionState> {
  const rawCancelled = String(formData.get('maxCancelledOrders') ?? '').trim()
  const rawReviewAbove = String(formData.get('manualReviewAbove') ?? '').trim()

  const parsed = courierAutomationSchema.safeParse({
    autoDispatchEnabled: formData.get('autoDispatchEnabled') === 'on',
    fraudCheckEnabled: formData.get('fraudCheckEnabled') === 'on',
    minDeliveryRatePercent: formData.get('minDeliveryRatePercent'),
    minTotalParcels: formData.get('minTotalParcels'),
    minDeliveredOrders: formData.get('minDeliveredOrders'),
    maxFraudReports: formData.get('maxFraudReports'),
    // Empty is meaningful — it switches the rule off — so it is mapped to null
    // rather than being coerced to zero, which would refuse every customer who
    // ever cancelled once.
    maxCancelledOrders: rawCancelled === '' ? null : rawCancelled,
    allowUnknownCustomers: formData.get('allowUnknownCustomers') === 'on',
    manualReviewAbove: rawReviewAbove === '' ? null : rawReviewAbove,
    dispatchDelayMinutes: formData.get('dispatchDelayMinutes'),
    requirePaidOrders: formData.get('requirePaidOrders') === 'on',
    fraudCacheHours: formData.get('fraudCacheHours'),
    autoCancelOnFail: formData.get('autoCancelOnFail') === 'on',
  })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  try {
    const organizationId = await org()

    // The value threshold is typed in taka but stored in paisa, and the
    // exponent depends on the store's currency — so it is read rather than
    // assumed to be 100.
    const settings = await getOrganizationSettings(organizationId)
    const perMajor = minorUnitsPerMajor(settings?.currencyCode ?? 'BDT')

    await updateCourierSettings(organizationId, {
      autoDispatchEnabled: parsed.data.autoDispatchEnabled,
      fraudCheckEnabled: parsed.data.fraudCheckEnabled,
      minDeliveryRateBps: percentToBasisPoints(
        parsed.data.minDeliveryRatePercent
      ),
      minTotalParcels: parsed.data.minTotalParcels,
      minDeliveredOrders: parsed.data.minDeliveredOrders,
      maxFraudReports: parsed.data.maxFraudReports,
      maxCancelledOrders: parsed.data.maxCancelledOrders,
      allowUnknownCustomers: parsed.data.allowUnknownCustomers,
      manualReviewAboveCents:
        parsed.data.manualReviewAbove == null
          ? null
          : Math.round(parsed.data.manualReviewAbove * perMajor),
      dispatchDelayMinutes: parsed.data.dispatchDelayMinutes,
      requirePaidOrders: parsed.data.requirePaidOrders,
      fraudCacheHours: parsed.data.fraudCacheHours,
      autoCancelOnFail: parsed.data.autoCancelOnFail,
    })
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/settings/courier')
  return { success: 'Automation rules saved.' }
}

// ── Screening ────────────────────────────────────────────────────────────

/**
 * Re-runs the screen for one order, ignoring the cache.
 *
 * The numbers behind a verdict keep moving as the customer orders elsewhere, so
 * a merchant looking at a held order from this morning wants today's history
 * before they decide — not the copy taken when the order arrived.
 */
export async function recheckOrderFraudAction(orderId: string) {
  try {
    const result = await rescreenOrder(await org(), orderId)
    revalidatePath(`/orders/${orderId}`)
    revalidatePath('/orders')
    return { ok: true as const, ...result }
  } catch (cause) {
    return { ok: false as const, error: fail(cause)?.error }
  }
}

/** Manual phone lookup, for a merchant vetting a number by hand. */
export async function checkPhoneAction(phone: string) {
  const parsed = phoneLookupSchema.safeParse({ phone })
  if (!parsed.success) {
    return { ok: false as const, error: 'Enter a mobile number' }
  }

  try {
    const assessment = await checkPhoneForMerchant(
      await org(),
      parsed.data.phone
    )
    return { ok: true as const, assessment }
  } catch (cause) {
    return { ok: false as const, error: fail(cause)?.error }
  }
}

// ── Per-order decisions ──────────────────────────────────────────────────

export async function approveOrderAction(
  orderId: string,
  provider?: CourierProvider | null,
  note?: string
) {
  try {
    const result = await approveOrderForDispatch(await org(), orderId, {
      provider: provider ?? null,
      note,
    })

    revalidatePath(`/orders/${orderId}`)
    revalidatePath('/orders')

    // Approval and dispatch are separate outcomes: the order is released even
    // if the courier call fails, and saying "approved" while hiding a failed
    // dispatch would leave the merchant thinking a parcel exists.
    return result.ok
      ? { ok: true as const, message: 'Approved and sent to the courier.' }
      : {
          ok: false as const,
          error: `Approved, but the courier call failed: ${result.error ?? 'unknown error'}`,
        }
  } catch (cause) {
    return { ok: false as const, error: fail(cause)?.error }
  }
}

export async function rejectOrderAction(orderId: string, note?: string) {
  try {
    await rejectHeldOrder(await org(), orderId, note)
    revalidatePath(`/orders/${orderId}`)
    revalidatePath('/orders')
    return { ok: true as const }
  } catch (cause) {
    return { ok: false as const, error: fail(cause)?.error }
  }
}

/** Sends an order to a courier by hand, outside the automated path. */
export async function dispatchOrderAction(
  orderId: string,
  provider?: CourierProvider | null
) {
  try {
    const result = await dispatchOrder(await org(), orderId, provider ?? null)

    revalidatePath(`/orders/${orderId}`)

    return result.ok
      ? { ok: true as const }
      : { ok: false as const, error: result.error ?? 'Dispatch failed' }
  } catch (cause) {
    return { ok: false as const, error: fail(cause)?.error }
  }
}

/**
 * Moves an order's delivery status by hand.
 *
 * The escape hatch for every order a courier integration never sees: a shop's
 * own rider, a counter pickup, a local service that phones rather than posts a
 * webhook. Editor-level for the same reason approving a held order is — this is
 * the job of whoever is packing parcels this morning, and putting it behind an
 * admin means the order list is wrong until someone senior logs in.
 */
export async function setOrderStatusAction(
  orderId: string,
  state: ManualWorkflowState,
  options: { note?: string; recordPayment?: boolean } = {}
) {
  try {
    await setOrderWorkflowState(await org(), orderId, {
      state,
      note: options.note,
      recordPayment: options.recordPayment,
    })

    revalidatePath(`/orders/${orderId}`)
    revalidatePath('/orders')
    return { ok: true as const }
  } catch (cause) {
    return { ok: false as const, error: fail(cause)?.error }
  }
}
