import { minorUnitsPerMajor } from '@/lib/money'
import type { CheckoutDraft } from './DeliveryPanel'

/**
 * Database rows → the strings the Delivery form edits.
 *
 * The panel keeps money as the text the merchant typed rather than as a number,
 * because a controlled numeric input that reformats mid-keystroke is unusable —
 * type "1", get "1.00", and the cursor jumps. Conversion to minor units happens
 * once, on save. This module is the other half of that boundary.
 *
 * A trailing ".00" is trimmed on the way in, so a merchant who typed 1800 sees
 * 1800 again rather than 1800.00.
 */

function toMajor(cents: number, currencyCode: string): string {
  if (!cents) return ''
  const major = cents / minorUnitsPerMajor(currencyCode)
  return Number.isInteger(major) ? String(major) : major.toFixed(2)
}

interface CheckoutRow {
  shippingMode: string
  flatRateCents: number
  askZone: boolean
  freeShippingEnabled: boolean
  freeShippingMinSubtotalCents: number
  freeShippingMinQuantity: number
  rates: { label: string; priceCents: number }[]
  discountRules: {
    basis: string
    thresholdCents: number
    thresholdQuantity: number
    reward: string
    valueCents: number
    valueBps: number
    maxDiscountCents: number
    label: string | null
  }[]
}

/**
 * A page with no checkout row yet gets Bangladeshi defaults.
 *
 * Not because the schema demands them — the rates are free-form labels — but
 * because a merchant here should find their three usual areas already filled in
 * rather than an empty list, and Inside Dhaka / Suburbs / Outside Dhaka at
 * 60/100/130 is what almost every one of them charges.
 */
const DEFAULT_RATES = [
  { label: 'ঢাকার ভিতরে', price: '60' },
  { label: 'ঢাকার আশেপাশে', price: '100' },
  { label: 'ঢাকার বাইরে', price: '130' },
]

export function toCheckoutDraft(
  row: CheckoutRow | null,
  currencyCode: string
): CheckoutDraft {
  if (!row) {
    return {
      shippingMode: 'INHERIT',
      flatRate: '',
      askZone: true,
      rates: DEFAULT_RATES,
      freeShippingEnabled: false,
      freeShippingMinSubtotal: '',
      freeShippingMinQuantity: '',
      discountRules: [],
    }
  }

  return {
    shippingMode: row.shippingMode as CheckoutDraft['shippingMode'],
    flatRate: toMajor(row.flatRateCents, currencyCode),
    askZone: row.askZone,
    rates:
      row.rates.length > 0
        ? row.rates.map((rate) => ({
            label: rate.label,
            price: toMajor(rate.priceCents, currencyCode),
          }))
        : DEFAULT_RATES,
    freeShippingEnabled: row.freeShippingEnabled,
    freeShippingMinSubtotal: toMajor(
      row.freeShippingMinSubtotalCents,
      currencyCode
    ),
    freeShippingMinQuantity: row.freeShippingMinQuantity
      ? String(row.freeShippingMinQuantity)
      : '',
    discountRules: row.discountRules.map((rule) => ({
      basis: rule.basis as 'SUBTOTAL' | 'QUANTITY',
      threshold:
        rule.basis === 'QUANTITY'
          ? String(rule.thresholdQuantity)
          : toMajor(rule.thresholdCents, currencyCode),
      reward: rule.reward as 'AMOUNT' | 'PERCENT',
      value:
        rule.reward === 'PERCENT'
          ? String(rule.valueBps / 100)
          : toMajor(rule.valueCents, currencyCode),
      maxDiscount: toMajor(rule.maxDiscountCents, currencyCode),
      label: rule.label ?? '',
    })),
  }
}
