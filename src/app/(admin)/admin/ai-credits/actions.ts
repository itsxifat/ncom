'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  CreditError,
  adjustAiCreditsAsAdmin,
  cancelCreditOrder,
  deleteCreditPack,
  markCreditOrderPaid,
  saveCreditPack,
} from '@/server/services/aiCreditService'
import { minorUnitsPerMajor } from '@/lib/money'

const packSchema = z.object({
  name: z.string().trim().min(1, 'Give the pack a name.').max(60),
  credits: z.coerce
    .number()
    .int('Credits are a whole number.')
    .min(1, 'A pack has at least 1 credit.')
    .max(1_000_000),
  price: z.coerce.number().min(0).max(10_000_000),
  currencyCode: z.string().trim().length(3).toUpperCase().default('BDT'),
  isActive: z.boolean(),
  position: z.coerce.number().int().min(0).max(999).default(0),
})

export async function saveCreditPackAction(
  packId: string | null,
  input: unknown
): Promise<{ error?: string }> {
  const parsed = packSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the fields.' }
  }
  const { price, ...pack } = parsed.data
  await saveCreditPack(packId, {
    ...pack,
    priceCents: Math.round(price * minorUnitsPerMajor(pack.currencyCode)),
  })
  revalidatePath('/admin/ai-credits')
  return {}
}

export async function deleteCreditPackAction(packId: string): Promise<void> {
  await deleteCreditPack(packId)
  revalidatePath('/admin/ai-credits')
}

/** Paid by bKash, bank transfer or in person — the reference is for the books. */
export async function markCreditOrderPaidAction(
  orderId: string,
  input: { reference?: string } = {}
): Promise<{ error?: string }> {
  try {
    await markCreditOrderPaid(orderId, {
      provider: 'manual',
      providerReference: input.reference?.trim().slice(0, 120) || undefined,
    })
  } catch (cause) {
    if (cause instanceof CreditError) return { error: cause.message }
    throw cause
  }
  revalidatePath('/admin/ai-credits')
  revalidatePath('/admin/subscriptions', 'layout')
  return {}
}

export async function cancelCreditOrderAction(
  orderId: string
): Promise<{ error?: string }> {
  try {
    await cancelCreditOrder(orderId)
  } catch (cause) {
    if (cause instanceof CreditError) return { error: cause.message }
    throw cause
  }
  revalidatePath('/admin/ai-credits')
  revalidatePath('/admin/subscriptions', 'layout')
  return {}
}

const adjustSchema = z.object({
  organizationId: z.string().min(1),
  credits: z.coerce.number().int('Credits are a whole number.'),
  note: z.string().trim().max(200).default(''),
})

export async function adjustAiCreditsAction(
  input: unknown
): Promise<{ error?: string }> {
  const parsed = adjustSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the fields.' }
  }
  try {
    await adjustAiCreditsAsAdmin(parsed.data)
  } catch (cause) {
    if (cause instanceof CreditError) return { error: cause.message }
    throw cause
  }
  revalidatePath(`/admin/subscriptions/${parsed.data.organizationId}`)
  return {}
}
