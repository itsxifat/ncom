'use server'

/**
 * The Offers tab of Discounts & offers, server side.
 *
 * Thin by design: every rule about what an offer may contain, which scope it
 * may claim and who may edit it lives in offerAdminService. These resolve the
 * caller's organisation — which the browser must never supply — parse the one
 * JSON payload the editor posts, and hand over.
 *
 * Money arrives as the text a merchant typed on a price tag and is converted to
 * minor units here, on the server, in one place — the same boundary every other
 * form on this platform uses. A browser that posts a number is not trusted with
 * where its decimal point went.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import {
  createOffer,
  deleteOffer,
  reorderOffers,
  setOfferActive,
  updateOffer,
  type OfferInput,
} from '@/server/services/offerAdminService'
import { parseMoneyInput, percentToBps } from '@/lib/money'

export type OfferActionState = { error?: string; success?: string } | undefined

async function org() {
  const { organization } = await getActiveOrganization()
  return organization.id
}

function fail(cause: unknown): OfferActionState {
  return {
    error: cause instanceof Error ? cause.message : 'Could not save the offer',
  }
}

/**
 * What the editor posts.
 *
 * Money and percentages are strings because that is what the merchant typed —
 * a controlled numeric input that reformats mid-keystroke is unusable, so the
 * form keeps the raw text and this is where it stops being text.
 */
const offerPayloadSchema = z.object({
  label: z.string().trim().min(1, 'Give the offer a name').max(120),
  description: z.string().trim().max(500).default(''),
  badge: z.string().trim().max(60).default(''),

  scope: z.enum(['PAGE', 'STORE', 'ORGANIZATION']),
  storeId: z.string().max(40).default(''),
  pageId: z.string().max(40).default(''),

  kind: z.enum(['FIXED', 'COLLECTION', 'ALACARTE']),
  pricingMode: z.enum(['AUTO', 'FIXED', 'PERCENT', 'AMOUNT']),
  price: z.string().max(30).default(''),
  discountPercent: z.string().max(20).default(''),
  compareAt: z.string().max(30).default(''),

  minQuantity: z.string().max(10).default(''),
  maxQuantity: z.string().max(10).default(''),

  tierMode: z.enum(['EXACT', 'THRESHOLD']),
  tiers: z
    .array(
      z.object({
        quantity: z.string().max(10),
        reward: z.enum(['PRICE', 'PERCENT']),
        price: z.string().max(30).default(''),
        discountPercent: z.string().max(20).default(''),
      })
    )
    .max(50)
    .default([]),

  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(40),
        variantId: z.string().max(40).nullable().default(null),
        variantIds: z.array(z.string().max(40)).max(200).default([]),
        quantity: z.number().int().min(1).max(999).default(1),
      })
    )
    .max(100)
    .default([]),

  variantRules: z
    .array(
      z.object({
        variantId: z.string().min(1).max(40),
        excluded: z.boolean().default(false),
        pricingMode: z
          .enum(['AUTO', 'FIXED', 'PERCENT', 'AMOUNT'])
          .nullable()
          .default(null),
        price: z.string().max(30).default(''),
        discountPercent: z.string().max(20).default(''),
      })
    )
    .max(500)
    .default([]),

  giftVariantId: z.string().max(40).default(''),
  giftQuantity: z.string().max(10).default(''),

  startsAt: z.string().max(40).default(''),
  endsAt: z.string().max(40).default(''),

  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

type OfferPayload = z.infer<typeof offerPayloadSchema>

function toInt(value: string): number {
  const parsed = Number(String(value).replace(/[^0-9-]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0
}

/** A `datetime-local` string, or null when the merchant left it blank. */
function toDate(value: string): Date | null {
  if (!value.trim()) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toBps(value: string): number {
  const parsed = Number(String(value).replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? percentToBps(parsed) : 0
}

function toInput(payload: OfferPayload, currencyCode: string): OfferInput {
  const money = (value: string) =>
    value.trim() ? parseMoneyInput(value, currencyCode) : 0

  return {
    label: payload.label,
    description: payload.description || null,
    badge: payload.badge || null,
    scope: payload.scope,
    storeId: payload.storeId || null,
    pageId: payload.pageId || null,
    kind: payload.kind,
    // A ladder prices the whole basket, so the offer-wide mode is not consulted
    // for one and storing anything but AUTO there would leave a stale rule
    // behind for anyone reading the row later.
    pricingMode: payload.kind === 'COLLECTION' ? 'AUTO' : payload.pricingMode,
    priceCents: money(payload.price),
    discountBps: toBps(payload.discountPercent),
    compareAtCents: money(payload.compareAt),
    minQuantity: toInt(payload.minQuantity),
    maxQuantity: toInt(payload.maxQuantity),
    isDefault: payload.isDefault,
    isActive: payload.isActive,
    tierMode: payload.tierMode,
    startsAt: toDate(payload.startsAt),
    endsAt: toDate(payload.endsAt),
    giftVariantId: payload.giftVariantId || null,
    giftQuantity: toInt(payload.giftQuantity) || 1,
    items: payload.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId || null,
      variantIds: item.variantIds,
      quantity: item.quantity,
    })),
    tiers: payload.tiers
      .filter((tier) => toInt(tier.quantity) > 0)
      .map((tier) => ({
        quantity: toInt(tier.quantity),
        reward: tier.reward,
        priceCents: tier.reward === 'PRICE' ? money(tier.price) : 0,
        discountBps:
          tier.reward === 'PERCENT' ? toBps(tier.discountPercent) : 0,
      })),
    variantRules: payload.variantRules.map((rule) => ({
      variantId: rule.variantId,
      excluded: rule.excluded,
      pricingMode: rule.pricingMode,
      priceCents: money(rule.price),
      discountBps: toBps(rule.discountPercent),
    })),
  }
}

/**
 * Refuses the shapes that would save cleanly and then sell nothing.
 *
 * Every one of these was reachable before: an offer with no products, a ladder
 * with no rungs, a percentage of zero. They do not fail — they save, sit in the
 * list looking correct, and quietly never appear on a page, which is the single
 * hardest kind of bug for a merchant to report.
 */
function validate(input: OfferInput): string | null {
  if (input.items.length === 0) return 'Add at least one product'

  if (input.kind === 'COLLECTION') {
    if (input.tiers.length === 0) {
      return 'Add at least one quantity to the price ladder'
    }
    const empty = input.tiers.find(
      (tier) =>
        (tier.reward === 'PRICE' && tier.priceCents <= 0) ||
        (tier.reward === 'PERCENT' && tier.discountBps <= 0)
    )
    if (empty) return `Set a price for the ${empty.quantity}-item rung`
  } else {
    if (input.pricingMode === 'PERCENT' && input.discountBps <= 0) {
      return 'Enter a discount percentage above zero'
    }
    if (
      (input.pricingMode === 'FIXED' || input.pricingMode === 'AMOUNT') &&
      input.priceCents <= 0
    ) {
      return 'Enter an amount above zero'
    }
  }

  if (
    input.maxQuantity > 0 &&
    input.minQuantity > 0 &&
    input.maxQuantity < input.minQuantity
  ) {
    return 'The maximum cannot be below the minimum'
  }

  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
    return 'The end date must be after the start date'
  }

  return null
}

export async function saveOfferAction(
  offerId: string | null,
  _prev: OfferActionState,
  formData: FormData
): Promise<OfferActionState> {
  let raw: unknown
  try {
    raw = JSON.parse(String(formData.get('payload') ?? '{}'))
  } catch {
    return { error: 'Could not read the form' }
  }

  const parsed = offerPayloadSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      error: issue
        ? `${issue.path.join('.') || 'Form'}: ${issue.message}`
        : 'Invalid input',
    }
  }

  // Set only when this save *created* something, so the redirect below can tell
  // a create from an edit.
  let newId: string | null = null

  try {
    const organizationId = await org()
    const settings = await getOrganizationSettings(organizationId)
    const input = toInput(parsed.data, settings?.currencyCode ?? 'USD')

    const problem = validate(input)
    if (problem) return { error: problem }

    if (offerId) {
      await updateOffer(organizationId, offerId, input)
    } else {
      const created = await createOffer(organizationId, input)
      newId = created.id
    }
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/discounts/offers')
  if (offerId) revalidatePath(`/discounts/offers/${offerId}`)

  // Leave the New screen the moment it has created something. The offer id is
  // bound into this action when the form renders, so a form that stays on /new
  // after a successful save is still bound to `null` and every later save
  // creates *another* offer — the merchant edits one bundle, saves twice, and
  // ends up with "family-pack" and "family-pack-2" selling side by side.
  // Outside the try because redirect() signals by throwing, and fail() would
  // otherwise report the redirect as a failed save.
  if (newId) redirect(`/discounts/offers/${newId}`)
  return { success: 'Offer saved.' }
}

export async function deleteOfferAction(
  offerId: string
): Promise<OfferActionState> {
  try {
    await deleteOffer(await org(), offerId)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/discounts/offers')
  return { success: 'Offer deleted.' }
}

export async function setOfferActiveAction(
  offerId: string,
  isActive: boolean
): Promise<OfferActionState> {
  try {
    await setOfferActive(await org(), offerId, isActive)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/discounts/offers')
  return { success: isActive ? 'Offer resumed.' : 'Offer paused.' }
}

/**
 * Persists the order the merchant dragged the offers into.
 *
 * The buyer sees them in this order and the first one is what the form
 * preselects when no offer is marked as the default, so this is a merchandising
 * decision, not a cosmetic one.
 */
export async function reorderOffersAction(
  orderedIds: string[]
): Promise<OfferActionState> {
  try {
    await reorderOffers(await org(), orderedIds)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/discounts/offers')
  return { success: 'Order saved.' }
}
