/**
 * What an NCOM invoice adds up to, worked out exactly as the Enfinito CRM's
 * lib/invoiceTotals.js does (same formulas, same rounding, same discount
 * allocation). The CRM recalculates every invoice it receives and refuses one
 * that differs by a paisa, so a change to either side shows up at once instead
 * of drifting: change both together.
 *
 * Pure on purpose (no server imports), so it can be checked on its own.
 */

export type VatTreatment =
  'STANDARD' | 'REDUCED' | 'ZERO_RATED' | 'EXEMPT' | 'NONE'

export const VAT_TREATMENTS: readonly VatTreatment[] = [
  'STANDARD',
  'REDUCED',
  'ZERO_RATED',
  'EXEMPT',
  'NONE',
]

/** The company selling, as the CRM prints it on its invoices. */
export interface Seller {
  name: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  bin: string | null
  tin: string | null
  tradeLicense?: string | null
}

/** Tax settings handed out by the CRM (Configuration → Integrations → NCOM). */
export interface TaxPolicy {
  version: string | null
  vatTreatment: VatTreatment
  vatRate: number
  sdRate: number
  /** true: the price on the pricing page is what is paid, VAT inside it. false: VAT goes on top. */
  pricesIncludeVat: boolean
  serviceCode: string | null
  /** Workspaces (billing numbers) the CRM bills at zero rate: clients marked foreign there. */
  zeroRatedAccounts: number[]
  seller?: Seller | null
}

/** Not connected to a CRM: no VAT, and the price is what is paid. */
export const NO_TAX: TaxPolicy = {
  version: null,
  vatTreatment: 'NONE',
  vatRate: 0,
  sdRate: 0,
  pricesIncludeVat: true,
  serviceCode: null,
  zeroRatedAccounts: [],
  seller: null,
}

/** One invoice line, in taka, as the CRM recalculates it. */
export interface InvoiceLine {
  description: string
  quantity: number
  /** Unit price before VAT and SD. */
  rate: number
  vatRate: number
  sdRate: number
}

export interface LineTotals {
  amount: number
  discountShare: number
  taxableValue: number
  sdAmount: number
  vatAmount: number
  lineTotal: number
}

export interface InvoiceTotals {
  lines: LineTotals[]
  subtotal: number
  discount: number
  taxableValue: number
  sdAmount: number
  vatAmount: number
  total: number
}

export class TaxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TaxError'
  }
}

const ZERO_RATE_TREATMENTS: VatTreatment[] = ['ZERO_RATED', 'EXEMPT', 'NONE']
const NO_SD_TREATMENTS: VatTreatment[] = ['ZERO_RATED', 'NONE']

// The CRM's two roundings, kept apart exactly as it keeps them.
const legacyRound = (n: number) => Math.round(n * 100) / 100
const round2 = (n: number) =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100

const toCents = (taka: number) => Math.round(taka * 100)

/**
 * Splits `totalCents` across `weights` pro-rata in whole cents, largest
 * remainders first, ties to the later line (the CRM's allocateCents).
 */
function allocateCents(totalCents: number, weights: number[]): number[] {
  const W = weights.reduce((s, w) => s + w, 0)
  if (W <= 0 || totalCents <= 0) return weights.map(() => 0)
  const target = Math.min(totalCents, W)
  const raw = weights.map((w) => (target * w) / W)
  const shares = raw.map((r, i) =>
    Math.min(weights[i]!, Math.max(0, Math.floor(r)))
  )
  let left = target - shares.reduce((s, v) => s + v, 0)
  const order = raw
    .map((r, i) => ({ i, f: r - Math.floor(r) }))
    .sort((a, b) => b.f - a.f || b.i - a.i)
  for (const { i } of order) {
    if (left <= 0) break
    if (shares[i]! + 1 > weights[i]!) continue
    shares[i]! += 1
    left -= 1
  }
  for (let i = shares.length - 1; i >= 0 && left > 0; i--) {
    const room = weights[i]! - shares[i]!
    if (room <= 0) continue
    const add = Math.min(room, left)
    shares[i]! += add
    left -= add
  }
  return shares
}

/**
 * The CRM's computeInvoiceTotals for NCOM's invoices (no MFS charge). Throws
 * TaxError for what the CRM would refuse.
 */
export function computeTotals(
  lines: InvoiceLine[],
  discount: number,
  treatment: VatTreatment
): InvoiceTotals {
  if (!VAT_TREATMENTS.includes(treatment))
    throw new TaxError('Invalid VAT treatment')
  if (lines.length === 0) throw new TaxError('At least one item required')
  const isVat = treatment !== 'NONE'
  const lineRatesApply = !ZERO_RATE_TREATMENTS.includes(treatment)
  const sdApplies = !NO_SD_TREATMENTS.includes(treatment)

  const processed = lines.map((line, i) => {
    if (!(line.quantity > 0))
      throw new TaxError(`Item ${i + 1}: quantity must be greater than 0`)
    if (!(line.rate >= 0))
      throw new TaxError(`Item ${i + 1}: rate must be 0 or more`)
    const vatRate = lineRatesApply ? line.vatRate : 0
    if (lineRatesApply) {
      if (!(vatRate >= 0 && vatRate <= 100))
        throw new TaxError(`Item ${i + 1}: VAT rate must be between 0 and 100`)
      if (treatment === 'STANDARD' && vatRate !== 15)
        throw new TaxError(`Item ${i + 1}: standard-rated supplies are VAT 15%`)
      if (treatment === 'REDUCED' && !(vatRate > 0 && vatRate < 15))
        throw new TaxError(
          `Item ${i + 1}: reduced-rate VAT must be above 0% and below 15%`
        )
    }
    const sdRate = sdApplies ? line.sdRate : 0
    if (!(sdRate >= 0 && sdRate <= 500))
      throw new TaxError(`Item ${i + 1}: SD rate must be between 0 and 500`)
    return {
      amount: legacyRound(line.quantity * line.rate),
      vatRate,
      sdRate,
    }
  })

  const subtotal = legacyRound(processed.reduce((s, p) => s + p.amount, 0))
  if (!(discount >= 0) || discount > subtotal + 0.001) {
    throw new TaxError(
      isVat
        ? 'Discount cannot be more than the subtotal (before VAT)'
        : 'Discount must be between 0 and the invoice subtotal'
    )
  }

  const shares = allocateCents(
    Math.round(discount * 100),
    processed.map((p) => Math.max(0, Math.round(p.amount * 100)))
  )
  let taxableSum = 0
  let sdSum = 0
  let vatSum = 0
  const out = processed.map((p, i) => {
    const discountShare = shares[i]! / 100
    const taxableValue = round2(p.amount - discountShare)
    const sdAmount = p.sdRate ? round2((taxableValue * p.sdRate) / 100) : 0
    const vatAmount = p.vatRate
      ? round2(((taxableValue + sdAmount) * p.vatRate) / 100)
      : 0
    const lineTotal = round2(taxableValue + sdAmount + vatAmount)
    taxableSum += taxableValue
    sdSum += sdAmount
    vatSum += vatAmount
    return {
      amount: p.amount,
      discountShare,
      taxableValue,
      sdAmount,
      vatAmount,
      lineTotal,
    }
  })
  const sdAmount = round2(sdSum)
  const vatAmount = round2(vatSum)
  const base = subtotal - discount
  return {
    lines: out,
    subtotal,
    discount,
    taxableValue: round2(taxableSum),
    sdAmount,
    vatAmount,
    total: isVat ? round2(base + sdAmount + vatAmount) : legacyRound(base),
  }
}

// ---------------------------------------------------------------------- pricing

/** What was sold, at the price the owner was shown (per unit, in paisa). */
export interface SaleLine {
  description: string
  quantity: number
  unitCents: number
}

export interface PricedInvoice {
  lines: InvoiceLine[]
  subtotalCents: number
  discountCents: number
  sdCents: number
  vatCents: number
  totalCents: number
  vatTreatment: VatTreatment
  vatRate: number
  sdRate: number
  serviceCode: string | null
  taxPolicyVersion: string | null
  pricesIncludeVat: boolean
}

/** The treatment and rates a workspace is billed under. */
export function taxFor(policy: TaxPolicy, customerNumber: number) {
  const zeroRated =
    policy.vatTreatment !== 'NONE' &&
    policy.zeroRatedAccounts.includes(customerNumber)
  const treatment: VatTreatment = zeroRated ? 'ZERO_RATED' : policy.vatTreatment
  const vatRate = ZERO_RATE_TREATMENTS.includes(treatment) ? 0 : policy.vatRate
  const sdRate = NO_SD_TREATMENTS.includes(treatment) ? 0 : policy.sdRate
  return { treatment, vatRate, sdRate, hasTax: vatRate > 0 || sdRate > 0 }
}

function totalsCents(t: InvoiceTotals) {
  return {
    subtotalCents: toCents(t.subtotal),
    discountCents: toCents(t.discount),
    sdCents: toCents(t.sdAmount),
    vatCents: toCents(t.vatAmount),
    totalCents: toCents(t.total),
  }
}

/**
 * Prices a sale under the CRM's tax settings. The owner never pays more than
 * the price they were shown: with VAT inside the price, the net is the most
 * that fits (a price with no exact split comes out a paisa or two under: BDT
 * 999 at 15% is 868.69 + 130.30 = 998.99); with VAT on top, it is added.
 */
export function priceSale(
  sale: SaleLine[],
  discountCents: number,
  policy: TaxPolicy,
  customerNumber: number
): PricedInvoice {
  const { treatment, vatRate, sdRate, hasTax } = taxFor(policy, customerNumber)
  const inclusive = hasTax && policy.pricesIncludeVat
  const listCents = sale.reduce((s, l) => s + l.quantity * l.unitCents, 0)
  const discount = Math.max(0, Math.min(discountCents, listCents))

  let lines: InvoiceLine[]
  let totals: InvoiceTotals
  if (!inclusive) {
    lines = sale.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      rate: l.unitCents / 100,
      vatRate,
      sdRate,
    }))
    totals = computeTotals(lines, discount / 100, treatment)
  } else {
    // Each line: the largest net unit price whose line total fits inside it.
    lines = sale.map((l) => {
      const gross = l.quantity * l.unitCents
      const guess = Math.round(
        l.unitCents / ((1 + sdRate / 100) * (1 + vatRate / 100))
      )
      let best = 0
      for (let cents = guess + 3; cents > 0; cents--) {
        const line = {
          description: l.description,
          quantity: l.quantity,
          rate: cents / 100,
          vatRate,
          sdRate,
        }
        if (toCents(computeTotals([line], 0, treatment).total) <= gross) {
          best = cents
          break
        }
      }
      return {
        description: l.description,
        quantity: l.quantity,
        rate: best / 100,
        vatRate,
        sdRate,
      }
    })
    const target = listCents - discount
    const totalAt = (d: number) =>
      toCents(computeTotals(lines, d / 100, treatment).total)
    const netSubtotal = toCents(computeTotals(lines, 0, treatment).subtotal)
    let d = 0
    if (totalAt(0) > target) {
      // The smallest net discount that brings the total inside what is paid.
      let lo = 0
      let hi = netSubtotal
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (totalAt(mid) <= target) hi = mid
        else lo = mid + 1
      }
      d = lo
      // Rounding is not perfectly monotonic: a paisa less may fit too.
      for (let k = d - 1; k >= Math.max(0, d - 3); k--) {
        if (totalAt(k) <= target) d = k
      }
    }
    totals = computeTotals(lines, d / 100, treatment)
  }

  const cents = totalsCents(totals)
  if (
    cents.subtotalCents -
      cents.discountCents +
      cents.sdCents +
      cents.vatCents !==
    cents.totalCents
  ) {
    throw new TaxError('The invoice does not add up')
  }
  return {
    lines,
    ...cents,
    vatTreatment: treatment,
    vatRate,
    sdRate,
    serviceCode: treatment === 'NONE' ? null : policy.serviceCode,
    taxPolicyVersion: policy.version,
    pricesIncludeVat: policy.pricesIncludeVat,
  }
}

/** No tax at all: what is asked is what is billed (orders from before the CRM). */
export function untaxedSale(
  sale: SaleLine[],
  discountCents: number
): PricedInvoice {
  return priceSale(sale, discountCents, NO_TAX, 0)
}

/** What owners are told next to prices. */
export function vatNote(policy: TaxPolicy): string {
  const rate = policy.vatRate
  if (
    policy.vatTreatment === 'NONE' ||
    policy.vatTreatment === 'EXEMPT' ||
    policy.vatTreatment === 'ZERO_RATED' ||
    !(rate > 0)
  )
    return ''
  return policy.pricesIncludeVat
    ? `Prices include ${rate}% VAT.`
    : `${rate}% VAT is added to these prices.`
}

/** "VAT (15%)", "VAT (zero-rated)", "VAT (exempt)", as the CRM labels it. */
export function vatLabel(treatment: string, rate: number): string {
  if (treatment === 'ZERO_RATED') return 'VAT (zero-rated)'
  if (treatment === 'EXEMPT') return 'VAT (exempt)'
  return rate > 0 ? `VAT (${rate}%)` : 'VAT'
}
