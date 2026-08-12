/**
 * Money handling for the commerce module.
 *
 * Every amount in the system is an integer in the currency's minor unit
 * (cents, paisa, yen). Floats are never used for money: 0.1 + 0.2 !== 0.3 in
 * IEEE 754, and a page of order lines summed as floats will drift by a cent
 * and then fail reconciliation against the payment provider. Integers make
 * that class of bug impossible.
 *
 * Currency lives on the owning aggregate (StoreSettings, Order, Cart), not
 * beside each amount, so arithmetic within one aggregate is always
 * same-currency by construction. The helpers here take a currency code only
 * where they need its exponent (formatting, parsing).
 */

/**
 * Minor-unit exponents that differ from the default of 2, per ISO 4217.
 * Getting this wrong means charging a customer 100x — JPY 1000 stored as
 * 100000 minor units would be ¥100,000, not ¥1,000.
 */
const CURRENCY_EXPONENTS: Record<string, number> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
}

export function currencyExponent(currencyCode: string): number {
  return CURRENCY_EXPONENTS[currencyCode.toUpperCase()] ?? 2
}

/** Smallest representable amount in a currency, e.g. 100 for USD, 1 for JPY. */
export function minorUnitsPerMajor(currencyCode: string): number {
  return 10 ** currencyExponent(currencyCode)
}

/**
 * Formats minor units for display: `formatMoney(129900, 'USD')` -> "$1,299.00".
 *
 * `Intl` already knows each currency's exponent, so this only needs to shift
 * the decimal point — it must not also apply its own rounding.
 */
export function formatMoney(
  amountCents: number,
  currencyCode: string,
  locale = 'en-US'
): string {
  const major = amountCents / minorUnitsPerMajor(currencyCode)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode.toUpperCase(),
  }).format(major)
}

/** Formats without the currency symbol: 129900 -> "1,299.00". */
export function formatMoneyAmount(
  amountCents: number,
  currencyCode: string,
  locale = 'en-US'
): string {
  const exponent = currencyExponent(currencyCode)
  const major = amountCents / minorUnitsPerMajor(currencyCode)
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(major)
}

/**
 * Parses merchant-entered major units into minor units: "12.99" -> 1299.
 *
 * Rounds rather than truncates so "0.1" * 100 (which is 10.000000000000002 in
 * binary floating point) lands on 10 and not 10.
 */
export function parseMoneyInput(
  input: string | number,
  currencyCode: string
): number {
  const raw =
    typeof input === 'number'
      ? input
      : Number(String(input).replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(raw)) {
    throw new Error(`Invalid money input: ${String(input)}`)
  }
  return Math.round(raw * minorUnitsPerMajor(currencyCode))
}

// ── Percentages ──────────────────────────────────────────────────────────
//
// Rates are basis points (1 bp = 1/100th of a percent) for the same reason
// amounts are integers: 8.25% stored as 825 is exact, stored as 0.0825 is not.

export function percentToBps(percent: number): number {
  return Math.round(percent * 100)
}

export function bpsToPercent(bps: number): number {
  return bps / 100
}

/** Applies a basis-point rate to an amount, rounding half away from zero. */
export function applyBps(amountCents: number, bps: number): number {
  return roundHalfAwayFromZero((amountCents * bps) / 10000)
}

/**
 * Backs a tax amount out of a tax-inclusive price.
 *
 * For a gross price G and rate r, the tax component is G - G/(1+r). Computing
 * it as G * r would overcharge, because r applies to the net price, not the
 * gross one — this is the single most common tax bug in stores that support
 * inclusive pricing.
 */
export function taxFromInclusive(grossCents: number, bps: number): number {
  return roundHalfAwayFromZero(
    grossCents - (grossCents * 10000) / (10000 + bps)
  )
}

/**
 * Rounds half away from zero (0.5 -> 1, -0.5 -> -1).
 *
 * `Math.round` rounds half *up*, so it turns -0.5 into -0 and makes refunds
 * asymmetric with the charges they reverse.
 */
export function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/**
 * Splits `amountCents` across `weights` so the parts sum back to exactly the
 * original amount.
 *
 * Needed whenever an order-level figure has to be attributed to lines — a
 * $10.00 discount over three equal lines is 333 + 333 + 333 = 999, one cent
 * short. This distributes by largest remainder, giving the leftover cents to
 * the lines with the biggest fractional claim, so the parts always reconcile.
 * Without it, order.discountTotal stops equalling the sum of its lines and
 * every downstream report disagrees with itself.
 */
export function allocate(amountCents: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)

  if (totalWeight <= 0) {
    // Nothing to weight by — spread evenly and hand remainders to the front.
    const base = Math.trunc(amountCents / weights.length)
    const parts = weights.map(() => base)
    let remainder = amountCents - base * weights.length
    for (let i = 0; remainder > 0; i = (i + 1) % parts.length, remainder--) {
      parts[i] += 1
    }
    return parts
  }

  const exact = weights.map((w) => (amountCents * w) / totalWeight)
  const floored = exact.map((v) => Math.floor(v))
  let remainder = amountCents - floored.reduce((sum, v) => sum + v, 0)

  const byRemainder = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac)

  for (const { index } of byRemainder) {
    if (remainder <= 0) break
    floored[index] += 1
    remainder -= 1
  }

  return floored
}

/** Clamps to a non-negative amount — discounts must never invert a total. */
export function clampNonNegative(amountCents: number): number {
  return amountCents < 0 ? 0 : amountCents
}

/**
 * Renders minor units as a plain editable string in major units — "1299.00"
 * for 129900 USD, "1000" for 1000 JPY.
 *
 * For populating form inputs, where `formatMoney`'s grouping separators and
 * currency symbol would have to be stripped again before the value could be
 * parsed back. Uses the currency's real exponent rather than assuming two
 * decimal places, so a yen price does not round-trip as one-hundredth of
 * itself.
 */
export function centsToMajorString(
  amountCents: number | null | undefined,
  currencyCode: string
): string {
  if (amountCents === null || amountCents === undefined) return ''
  const exponent = currencyExponent(currencyCode)
  return (amountCents / minorUnitsPerMajor(currencyCode)).toFixed(exponent)
}
