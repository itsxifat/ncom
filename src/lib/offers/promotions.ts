import type { PublicDiscountRule, PublicPromotions } from './types'

/**
 * Page-wide promotions: free-delivery thresholds and spend-and-save ladders.
 *
 * Pure, like pricing.ts, and for the same reason — the browser previews the
 * reward live as the basket changes while the order route stays the only
 * authority on what is actually taken off.
 *
 * These layer on top of whatever offer the buyer chose, which is what makes
 * them useful: a merchant sets "৳1500+ ships free" once and it applies to every
 * bundle on the page rather than being baked into each one.
 *
 * Two families, evaluated independently:
 *
 *   - free delivery, once a subtotal *or* a piece count is reached;
 *   - a discount ladder, of which the single best-for-the-buyer matching rule
 *     applies.
 *
 * The rules deliberately do not stack on each other. Stacking ladders is how a
 * merchant discovers at the end of a campaign that they sold below cost. Free
 * delivery is separate, so a buyer can still get both a discount and free
 * delivery from one order.
 */

const BPS_DIVISOR = 10_000

function positive(value: number | null | undefined): number {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0
}

function meetsThreshold(
  rule: PublicDiscountRule,
  goodsCents: number,
  quantity: number
): boolean {
  if (rule.basis === 'QUANTITY') {
    const threshold = positive(rule.thresholdQuantity)
    return threshold > 0 && quantity >= threshold
  }
  const threshold = positive(rule.thresholdCents)
  return threshold > 0 && goodsCents >= threshold
}

/**
 * What one rule would take off, clamped to the goods total.
 *
 * A percentage rule may carry a cap; an uncapped 50% on a large basket is
 * usually a typo rather than an intention, but that is the merchant's call and
 * the only hard limit here is that a discount cannot exceed what is being
 * bought.
 */
export function discountRuleAmount(
  rule: PublicDiscountRule,
  goodsCents: number
): number {
  const goods = Math.max(0, Math.round(goodsCents))

  let amount =
    rule.reward === 'PERCENT'
      ? Math.round((goods * positive(rule.valueBps)) / BPS_DIVISOR)
      : Math.round(positive(rule.valueCents))

  if (rule.reward === 'PERCENT' && positive(rule.maxDiscountCents) > 0) {
    amount = Math.min(amount, Math.round(rule.maxDiscountCents))
  }

  return Math.max(0, Math.min(amount, goods))
}

/** A readable name for a rule the merchant did not name themselves. */
export function defaultRuleLabel(
  rule: PublicDiscountRule,
  formatMoney: (cents: number) => string
): string {
  const condition =
    rule.basis === 'QUANTITY'
      ? `${positive(rule.thresholdQuantity)}+ items`
      : `${formatMoney(positive(rule.thresholdCents))}+`

  const reward =
    rule.reward === 'PERCENT'
      ? `${positive(rule.valueBps) / 100}% off`
      : `${formatMoney(positive(rule.valueCents))} off`

  return `Spend ${condition} — ${reward}`
}

export function qualifiesForFreeShipping(
  promotions: PublicPromotions,
  goodsCents: number,
  quantity: number
): boolean {
  const rule = promotions.freeShipping
  if (!rule.enabled) return false
  if (
    positive(rule.minSubtotalCents) > 0 &&
    goodsCents >= rule.minSubtotalCents
  ) {
    return true
  }
  if (positive(rule.minQuantity) > 0 && quantity >= rule.minQuantity) {
    return true
  }
  return false
}

export interface AppliedPromotions {
  discountCents: number
  /** The winning rule's name, for the order's discount line. Empty if none. */
  label: string
  freeShipping: boolean
  /** What delivery costs after the free-shipping rule is considered. */
  shippingCents: number
}

export function applyPromotions(input: {
  goodsCents: number
  quantity: number
  shippingCents: number
  promotions: PublicPromotions
  formatMoney: (cents: number) => string
}): AppliedPromotions {
  const { goodsCents, quantity, promotions, formatMoney } = input

  let best: { amount: number; rule: PublicDiscountRule | null } = {
    amount: 0,
    rule: null,
  }

  for (const rule of promotions.discountRules) {
    if (!meetsThreshold(rule, goodsCents, quantity)) continue
    const amount = discountRuleAmount(rule, goodsCents)
    if (amount > best.amount) best = { amount, rule }
  }

  const free = qualifiesForFreeShipping(promotions, goodsCents, quantity)

  return {
    discountCents: best.amount,
    label: best.rule
      ? (best.rule.label ?? defaultRuleLabel(best.rule, formatMoney))
      : '',
    freeShipping: free,
    shippingCents: free ? 0 : Math.max(0, Math.round(input.shippingCents)),
  }
}

export interface PromotionHint {
  /** How much more to spend, in minor units. 0 when the gap is a count. */
  amountMoreCents: number
  /** How many more pieces. 0 when the gap is money. */
  quantityMore: number
  label: string
}

export interface PromotionHints {
  freeShipping: PromotionHint | null
  discount: PromotionHint | null
}

/**
 * The "add ৳240 more and delivery is free" nudges.
 *
 * Presentation only — nothing here is enforced, and a page that shows no hints
 * charges exactly the same as one that does. The discount hint deliberately
 * ignores rules that would not beat what the buyer has already earned: telling
 * someone to spend more for a smaller reward is worse than saying nothing.
 */
export function promotionHints(input: {
  goodsCents: number
  quantity: number
  promotions: PublicPromotions
  formatMoney: (cents: number) => string
}): PromotionHints {
  const { goodsCents, quantity, promotions, formatMoney } = input
  const hints: PromotionHints = { freeShipping: null, discount: null }

  const freeRule = promotions.freeShipping
  if (
    freeRule.enabled &&
    !qualifiesForFreeShipping(promotions, goodsCents, quantity)
  ) {
    const amountMore =
      positive(freeRule.minSubtotalCents) > 0
        ? Math.max(0, freeRule.minSubtotalCents - goodsCents)
        : 0
    const quantityMore =
      positive(freeRule.minQuantity) > 0
        ? Math.max(0, freeRule.minQuantity - quantity)
        : 0

    if (amountMore > 0 || quantityMore > 0) {
      hints.freeShipping = {
        amountMoreCents: amountMore,
        quantityMore,
        label: 'free delivery',
      }
    }
  }

  const earned = applyPromotions({
    goodsCents,
    quantity,
    shippingCents: 0,
    promotions,
    formatMoney,
  }).discountCents

  let nearest: (PromotionHint & { distance: number }) | null = null

  for (const rule of promotions.discountRules) {
    if (meetsThreshold(rule, goodsCents, quantity)) continue

    // Value the rule at the basket that would actually trigger it, not the
    // current one — otherwise a percentage rule looks worthless at a small
    // basket and never gets suggested.
    const reachable = discountRuleAmount(
      rule,
      Math.max(goodsCents, positive(rule.thresholdCents))
    )
    if (reachable <= earned) continue

    const amountMore =
      rule.basis === 'SUBTOTAL'
        ? Math.max(0, positive(rule.thresholdCents) - goodsCents)
        : 0
    const quantityMore =
      rule.basis === 'QUANTITY'
        ? Math.max(0, positive(rule.thresholdQuantity) - quantity)
        : 0

    // Money gaps and piece gaps are not comparable, so pieces are scaled far
    // out of the money range to make "one more item" lose to "৳20 more" only
    // when the money gap really is trivial.
    const distance = amountMore || quantityMore * 1_000_000
    if (!nearest || distance < nearest.distance) {
      nearest = {
        amountMoreCents: amountMore,
        quantityMore,
        label: rule.label ?? defaultRuleLabel(rule, formatMoney),
        distance,
      }
    }
  }

  if (nearest) {
    hints.discount = {
      amountMoreCents: nearest.amountMoreCents,
      quantityMore: nearest.quantityMore,
      label: nearest.label,
    }
  }

  return hints
}
