import 'server-only'
import { prisma } from '@/server/db/client'
import type { Prisma } from '@/generated/prisma/client'
import type {
  BillingInvoice,
  BillingPaymentMethod,
} from '@/generated/prisma/client'
import { policyForBilling } from './crm'
import {
  priceSale,
  untaxedSale,
  vatLabel,
  type InvoiceLine,
  type PricedInvoice,
  type SaleLine,
  type Seller,
  type TaxPolicy,
} from './tax'

/**
 * NCOM's invoices: one per sale with something to pay, raised in the same
 * transaction as the order, priced under the CRM's tax settings, and settled
 * in the same transaction that settles the order. billing/crmSync.ts takes
 * them to the CRM; database triggers queue every change, so nothing here has
 * to remember to.
 */

type Db = Prisma.TransactionClient

export type InvoiceOrderKind = 'plan' | 'credits'

export class InvoiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvoiceError'
  }
}

/** Connected to the CRM, but it has never given its tax settings: nothing can be priced. */
export const BILLING_STARTING =
  'Billing is starting up. Please try again in a minute.'

/** The tax settings a sale is priced under now, or InvoiceError. */
export async function billingPolicy(): Promise<TaxPolicy> {
  const policy = await policyForBilling()
  if (!policy) throw new InvoiceError(BILLING_STARTING)
  return policy
}

/**
 * The CRM's invoice number format, ENV<yymm> + series + serial, in a series of
 * NCOM's own (N; the CRM issues A, Envo E), so an invoice has one number
 * everywhere and never waits for the CRM. The serial is the invoice id.
 */
function invoiceNumber(id: number, at: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dhaka',
      year: '2-digit',
      month: '2-digit',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value])
  )
  return `ENV${parts.year}${parts.month}N${String(id).padStart(3, '0')}`
}

export interface Buyer {
  name: string
  email: string
  /** The owner's login when verified: the only email that may match an existing CRM client. */
  verifiedEmail: string | null
  phone: string
  address: string
}

const ADDRESS_ORDER = [
  'line1',
  'line2',
  'address1',
  'address2',
  'street',
  'area',
  'city',
  'district',
  'state',
  'postalCode',
  'postcode',
  'zip',
  'country',
]

function addressText(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'object') {
    // JSON objects come back with their keys reordered: the usual parts first.
    const record = value as Record<string, unknown>
    const known = ADDRESS_ORDER.filter((key) => key in record)
    const rest = Object.keys(record).filter(
      (key) => !ADDRESS_ORDER.includes(key)
    )
    return [...known, ...rest]
      .map((key) => record[key])
      .filter((part) => typeof part === 'string' && part.trim())
      .map((part) => (part as string).trim())
      .join(', ')
  }
  return ''
}

/** The workspace as the CRM's client: its billing name, the owner's email. */
export async function customerOf(
  db: Db | typeof prisma,
  organizationId: string
): Promise<{ customerNumber: number; buyer: Buyer } | null> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      name: true,
      billingNumber: true,
      settings: {
        select: {
          businessName: true,
          businessAddress: true,
          supportPhone: true,
          supportEmail: true,
        },
      },
      memberships: {
        where: { role: 'OWNER' },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { user: { select: { email: true, emailVerified: true } } },
      },
    },
  })
  if (!org) return null
  const owner = org.memberships[0]?.user ?? null
  const email = (owner?.email ?? org.settings?.supportEmail ?? '').trim()
  return {
    customerNumber: org.billingNumber,
    buyer: {
      name: (org.settings?.businessName?.trim() || org.name).slice(0, 200),
      email,
      verifiedEmail: owner?.emailVerified ? owner.email : null,
      phone: (org.settings?.supportPhone ?? '').trim().slice(0, 60),
      address: addressText(org.settings?.businessAddress).slice(0, 500),
    },
  }
}

/** Prices a sale for a workspace. */
export function priceFor(
  policy: TaxPolicy,
  customerNumber: number,
  sale: SaleLine[],
  discountCents: number
): PricedInvoice {
  return priceSale(sale, discountCents, policy, customerNumber)
}

async function nextInvoiceId(db: Db): Promise<number> {
  const [row] = await db.$queryRaw<{ id: number }[]>`
    SELECT nextval(pg_get_serial_sequence('"BillingInvoice"', 'id'))::int AS id
  `
  if (!row) throw new Error('No invoice number')
  return row.id
}

/** Raises the invoice for an order, inside the transaction that records it. */
export async function createInvoice(
  db: Db,
  input: {
    organizationId: string
    order: { kind: InvoiceOrderKind; id: string }
    description: string
    priced: PricedInvoice
    seller: Seller | null
    /** When it must be paid by. Default: on issue. */
    dueAt?: Date
  }
): Promise<BillingInvoice> {
  const customer = await customerOf(db, input.organizationId)
  if (!customer) throw new InvoiceError('That workspace was not found.')
  const id = await nextInvoiceId(db)
  const now = new Date()
  const { priced } = input
  return db.billingInvoice.create({
    data: {
      id,
      number: invoiceNumber(id, now),
      organizationId: input.organizationId,
      customerNumber: customer.customerNumber,
      planOrderId: input.order.kind === 'plan' ? input.order.id : null,
      creditOrderId: input.order.kind === 'credits' ? input.order.id : null,
      description: input.description.slice(0, 300),
      lines: priced.lines as unknown as Prisma.InputJsonValue,
      currencyCode: 'BDT',
      subtotalCents: priced.subtotalCents,
      discountCents: priced.discountCents,
      sdCents: priced.sdCents,
      vatCents: priced.vatCents,
      totalCents: priced.totalCents,
      vatTreatment: priced.vatTreatment,
      vatRate: priced.vatRate,
      sdRate: priced.sdRate,
      serviceCode: priced.serviceCode,
      taxPolicyVersion: priced.taxPolicyVersion,
      pricesIncludeVat: priced.pricesIncludeVat,
      dueAt: input.dueAt ?? now,
      buyer: customer.buyer as unknown as Prisma.InputJsonValue,
      seller: (input.seller ?? undefined) as Prisma.InputJsonValue | undefined,
      createdAt: now,
    },
  })
}

function orderWhere(order: { kind: InvoiceOrderKind; id: string }) {
  return order.kind === 'plan'
    ? { planOrderId: order.id }
    : { creditOrderId: order.id }
}

export function findOrderInvoice(
  db: Db | typeof prisma,
  order: { kind: InvoiceOrderKind; id: string }
) {
  return db.billingInvoice.findFirst({ where: orderWhere(order) })
}

/**
 * The invoice of an order placed before invoices existed, raised as it stands:
 * no VAT, for exactly what the order asks (it was priced without one).
 */
async function ensureOrderInvoice(
  db: Db,
  order: { kind: InvoiceOrderKind; id: string }
): Promise<BillingInvoice | null> {
  const existing = await findOrderInvoice(db, order)
  if (existing) return existing
  const source =
    order.kind === 'plan'
      ? await db.planOrder.findUnique({
          where: { id: order.id },
          include: { plan: { select: { name: true } } },
        })
      : null
  const credit =
    order.kind === 'credits'
      ? await db.aiCreditOrder.findUnique({ where: { id: order.id } })
      : null
  const organizationId = source?.organizationId ?? credit?.organizationId
  const totalCents = source?.totalCents ?? credit?.totalCents ?? 0
  if (!organizationId || totalCents <= 0) return null
  const sale: SaleLine[] = source
    ? [
        {
          description: `${source.plan.name} · ${source.interval === 'ANNUAL' ? 'yearly' : 'monthly'}`,
          quantity: 1,
          unitCents: source.subtotalCents,
        },
      ]
    : [
        {
          description: `${credit!.packName} · ${credit!.credits.toLocaleString('en')} AI credits`,
          quantity: 1,
          unitCents: credit!.totalCents,
        },
      ]
  const priced = untaxedSale(sale, source?.discountCents ?? 0)
  if (priced.totalCents !== totalCents) return null
  return createInvoice(db, {
    organizationId,
    order,
    description: sale[0]!.description,
    priced,
    seller: null,
  })
}

export interface PaymentRecord {
  method: BillingPaymentMethod
  amountCents: number
  /** Makes the payment count once however often it is confirmed. */
  dedupeKey: string
  paidAt: Date
  livemode?: boolean | null
  channel?: string
  reference?: string
  checkoutId?: string | null
  transactionId?: string | null
  createdById?: string | null
}

/**
 * The order was paid: its invoice is paid, with the payment that paid it.
 * Called in the transaction that settles the order, right after it claimed it.
 */
export async function recordOrderPayment(
  db: Db,
  order: { kind: InvoiceOrderKind; id: string },
  payment: PaymentRecord
): Promise<void> {
  const invoice = await ensureOrderInvoice(db, order)
  if (!invoice) return
  await db.billingPayment.createMany({
    data: [
      {
        invoiceId: invoice.id,
        method: payment.method,
        amountCents: payment.amountCents,
        livemode: payment.livemode ?? null,
        channel: (payment.channel ?? '').slice(0, 40),
        reference: (payment.reference ?? '').slice(0, 120),
        checkoutId: payment.checkoutId ?? null,
        transactionId: payment.transactionId ?? null,
        dedupeKey: payment.dedupeKey,
        paidAt: payment.paidAt,
        createdById: payment.createdById ?? null,
      },
    ],
    skipDuplicates: true,
  })
  await db.billingInvoice.updateMany({
    where: { id: invoice.id, status: 'UNPAID' },
    data: { status: 'PAID', paidAt: payment.paidAt },
  })
}

/** The order was cancelled before it was paid: so is its invoice. */
export async function voidOrderInvoice(
  db: Db | typeof prisma,
  order: { kind: InvoiceOrderKind; id: string }
): Promise<void> {
  await db.billingInvoice.updateMany({
    where: { ...orderWhere(order), status: 'UNPAID' },
    data: { status: 'VOID', voidedAt: new Date() },
  })
}

/** Enfinito Pay says the money went back: the CRM asks finance for a credit note. */
export async function markCheckoutRefunded(
  checkoutId: string
): Promise<number> {
  const { count } = await prisma.billingPayment.updateMany({
    where: { checkoutId, method: 'ENFINITO_PAY', status: 'SUCCEEDED' },
    data: { status: 'REFUNDED', refundedAt: new Date() },
  })
  return count
}

// ------------------------------------------------------------------- checkout

/**
 * What Enfinito Pay's page shows for an invoiced order: its lines at the
 * prices the owner saw, VAT as a line of its own when it goes on top, and
 * whatever brings that to the invoice's total (the coupon, and the paisa a
 * VAT-inclusive price can come out under) as the discount.
 */
export function checkoutLines(
  invoice: Pick<
    BillingInvoice,
    | 'totalCents'
    | 'vatCents'
    | 'sdCents'
    | 'pricesIncludeVat'
    | 'vatTreatment'
    | 'vatRate'
  >,
  items: { name: string; amountCents: number; quantity: number }[]
): {
  items: { name: string; amountCents: number; quantity: number }[]
  discountCents: number
} {
  const tax = invoice.vatCents + invoice.sdCents
  const lines = [...items]
  if (!invoice.pricesIncludeVat && tax > 0) {
    lines.push({
      name:
        invoice.sdCents > 0
          ? `${vatLabel(invoice.vatTreatment, invoice.vatRate)} and SD`
          : vatLabel(invoice.vatTreatment, invoice.vatRate),
      amountCents: tax,
      quantity: 1,
    })
  }
  const sum = lines.reduce((s, l) => s + l.amountCents * l.quantity, 0)
  const discountCents = sum - invoice.totalCents
  if (discountCents < 0) {
    // Never asks for more than the lines add up to: one line for the invoice.
    return {
      items: [
        {
          name:
            items
              .map((i) => i.name)
              .join(', ')
              .slice(0, 200) || 'NCOM',
          amountCents: invoice.totalCents,
          quantity: 1,
        },
      ],
      discountCents: 0,
    }
  }
  return { items: lines, discountCents }
}

// ---------------------------------------------------------------------- reads

export interface InvoiceView {
  id: number
  number: string
  status: 'UNPAID' | 'PAID' | 'VOID'
  description: string
  createdAt: Date
  paidAt: Date | null
  voidedAt: Date | null
  currencyCode: string
  lines: (InvoiceLine & { amount: number })[]
  subtotalCents: number
  discountCents: number
  sdCents: number
  vatCents: number
  totalCents: number
  vatTreatment: string
  vatRate: number
  sdRate: number
  serviceCode: string | null
  pricesIncludeVat: boolean
  buyer: Buyer
  seller: Seller | null
  /** From the CRM, once it has the invoice: its client code and BIN as printed there. */
  crm: {
    clientCode: string | null
    buyerBin: string | null
    seller: Seller | null
  } | null
  payments: {
    id: number
    method: BillingPaymentMethod
    status: 'SUCCEEDED' | 'REFUNDED'
    amountCents: number
    channel: string
    transactionId: string | null
    paidAt: Date
  }[]
  organizationId: string | null
}

function toView(
  invoice: BillingInvoice & {
    payments: {
      id: number
      method: BillingPaymentMethod
      status: 'SUCCEEDED' | 'REFUNDED'
      amountCents: number
      channel: string
      transactionId: string | null
      paidAt: Date
    }[]
  }
): InvoiceView {
  const lines = (Array.isArray(invoice.lines)
    ? invoice.lines
    : []) as unknown as InvoiceLine[]
  const snapshot = (invoice.crmSnapshot ?? null) as {
    clientCode?: string | null
    seller?: Seller | null
    buyer?: { bin?: string | null } | null
  } | null
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    description: invoice.description,
    createdAt: invoice.createdAt,
    paidAt: invoice.paidAt,
    voidedAt: invoice.voidedAt,
    currencyCode: invoice.currencyCode,
    lines: lines.map((line) => ({
      ...line,
      amount: Math.round(line.quantity * line.rate * 100) / 100,
    })),
    subtotalCents: invoice.subtotalCents,
    discountCents: invoice.discountCents,
    sdCents: invoice.sdCents,
    vatCents: invoice.vatCents,
    totalCents: invoice.totalCents,
    vatTreatment: invoice.vatTreatment,
    vatRate: invoice.vatRate,
    sdRate: invoice.sdRate,
    serviceCode: invoice.serviceCode,
    pricesIncludeVat: invoice.pricesIncludeVat,
    buyer: invoice.buyer as unknown as Buyer,
    seller: (invoice.seller ?? null) as Seller | null,
    crm: snapshot
      ? {
          clientCode: snapshot.clientCode ?? null,
          buyerBin: snapshot.buyer?.bin ?? null,
          seller: snapshot.seller ?? null,
        }
      : null,
    payments: invoice.payments,
    organizationId: invoice.organizationId,
  }
}

const PAYMENT_SELECT = {
  id: true,
  method: true,
  status: true,
  amountCents: true,
  channel: true,
  transactionId: true,
  paidAt: true,
} as const

export async function loadInvoice(id: number): Promise<InvoiceView | null> {
  if (!Number.isInteger(id) || id <= 0) return null
  const invoice = await prisma.billingInvoice.findUnique({
    where: { id },
    include: { payments: { select: PAYMENT_SELECT, orderBy: { id: 'asc' } } },
  })
  return invoice ? toView(invoice) : null
}

/** A workspace's invoices, newest first. Access is the caller's to check. */
export function listOrganizationInvoices(organizationId: string, take = 50) {
  return prisma.billingInvoice.findMany({
    where: { organizationId },
    orderBy: { id: 'desc' },
    take,
    select: {
      id: true,
      number: true,
      status: true,
      description: true,
      totalCents: true,
      currencyCode: true,
      createdAt: true,
      paidAt: true,
      planOrderId: true,
      creditOrderId: true,
    },
  })
}
