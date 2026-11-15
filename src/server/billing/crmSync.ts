import 'server-only'
import { after } from 'next/server'
import { prisma } from '@/server/db/client'
import { Prisma } from '@/generated/prisma/client'
import type { CrmSyncState } from '@/generated/prisma/enums'
import {
  CrmError,
  crmCall,
  crmEnabled,
  crmHost,
  crmSyncFrom,
  currentPolicy,
  deleteSetting,
  forgetPolicy,
  readSetting,
  refreshPolicy,
  writeSetting,
} from './crm'
import { computeTotals, type InvoiceLine, type VatTreatment } from './tax'
import { customerOf, type Buyer } from './invoices'

/**
 * Keeps the Enfinito CRM in step with NCOM's invoices, the way Envo does.
 *
 * Triggers (migration 20261115090000) mark every changed invoice; this pushes
 * the whole state of what is marked, in batches, so an owner never waits for
 * the CRM: they get their invoice and pay in NCOM while the CRM catches up.
 * Pushing state instead of events means a retry, a timeout or a CRM restart
 * cannot lose or double anything: the CRM makes itself match (and its unique
 * indexes hold even if that goes wrong).
 *
 * Runs from the crm-sync cron (every minute) and right after a sale changes
 * (`scheduleCrmSync`). The CRM side is lib/products in crm-v2, docs/ncom.md.
 */

const BATCH = 50
const POLICY_EVERY_MS = 60_000
const RECONCILE_EVERY_MS = 6 * 60 * 60_000
const RECONCILE_PAGE = 500
const RETRY_MIN_MS = 5_000
const RETRY_MAX_MS = 15 * 60_000
const REVIEW_RETRY_MS = 15 * 60_000
const REJECTED_RETRY_MS = 60 * 60_000
const TARGET_KEY = 'crm.target'
const RECONCILE_KEY = 'crm.reconcile'
const MAX_INT = 2_147_483_647

const cents = (taka: unknown) => Math.round((Number(taka) || 0) * 100)
const taka = (paisa: number) => paisa / 100
const EXPECTED_STATUS: Record<string, string> = {
  UNPAID: 'DRAFT',
  PAID: 'PAID',
  VOID: 'CANCELLED',
}
const DOC_STATUS: Record<string, 'unpaid' | 'paid' | 'void'> = {
  UNPAID: 'unpaid',
  PAID: 'paid',
  VOID: 'void',
}

function retryDelay(attempts: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** Math.min(attempts, 12))
}

const inMs = (ms: number) => new Date(Date.now() + ms)

/** Free invoices move no money; go-live counts whichever came last. */
function eligible(): Prisma.BillingInvoiceWhereInput {
  const from = crmSyncFrom()
  return {
    totalCents: { gt: 0 },
    ...(from && {
      OR: [{ createdAt: { gte: from } }, { paidAt: { gte: from } }],
    }),
  }
}

function notEligible(): Prisma.BillingInvoiceWhereInput {
  const from = crmSyncFrom()
  return {
    OR: [
      { totalCents: { lte: 0 } },
      ...(from
        ? [
            {
              createdAt: { lt: from },
              OR: [{ paidAt: null }, { paidAt: { lt: from } }],
            },
          ]
        : []),
    ],
  }
}

const QUEUE_INCLUDE = {
  payments: {
    where: { status: { in: ['SUCCEEDED', 'REFUNDED'] } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.BillingInvoiceInclude

type QueueRow = Prisma.BillingInvoiceGetPayload<{
  include: typeof QUEUE_INCLUDE
}>

async function loadQueue(limit: number): Promise<QueueRow[]> {
  return prisma.billingInvoice.findMany({
    where: {
      crmVersion: { gt: prisma.billingInvoice.fields.crmSyncedVersion },
      crmNextAttemptAt: { lte: new Date() },
      ...eligible(),
    },
    orderBy: [{ crmNextAttemptAt: 'asc' }, { id: 'asc' }],
    take: limit,
    include: QUEUE_INCLUDE,
  })
}

interface CrmView {
  invoiceId: string
  number: string
  status: string
  total: number
  vatAmount: number
  sdAmount: number
  paidAmount: number
  /** What the books hold after refunds and credit notes: must equal what NCOM received. */
  received: number
  issuedAt: string | null
  clientCode: string | null
  seller: unknown
  buyer: unknown
}

interface SyncResult {
  id: number
  version: number
  status: 'ok' | 'review' | 'rejected' | 'retry'
  code?: string
  message?: string
  crm?: CrmView | null
}

/** The whole state of each invoice, read after the change committed. */
async function buildDocs(rows: QueueRow[]): Promise<Record<string, unknown>[]> {
  const live = new Map<string, Buyer>()
  for (const id of new Set(rows.map((r) => r.organizationId).filter(Boolean))) {
    const customer = await customerOf(prisma, id as string)
    if (customer) live.set(id as string, customer.buyer)
  }
  return rows.map((row) => {
    const lines = (row.lines ?? []) as unknown as InvoiceLine[]
    const totals = computeTotals(
      lines,
      taka(row.discountCents),
      row.vatTreatment as VatTreatment
    )
    // Live details keep the CRM's client current; the invoice's own copy when the workspace is gone.
    const buyer =
      (row.organizationId && live.get(row.organizationId)) ||
      (row.buyer as unknown as Buyer)
    return {
      id: row.id,
      version: row.crmVersion,
      number: row.number,
      status: DOC_STATUS[row.status],
      createdAt: row.createdAt,
      dueAt: row.dueAt,
      paidAt: row.paidAt,
      currency: 'BDT',
      vatTreatment: row.vatTreatment,
      serviceCode: row.serviceCode,
      policyVersion: row.taxPolicyVersion,
      items: lines.map((line) => ({
        description: line.description.slice(0, 300),
        quantity: line.quantity,
        rate: line.rate,
        vatRate: line.vatRate,
        sdRate: line.sdRate,
      })),
      totals: {
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxableValue: totals.taxableValue,
        sdAmount: totals.sdAmount,
        vatAmount: totals.vatAmount,
        total: totals.total,
      },
      customer: {
        id: row.customerNumber,
        name: buyer.name.trim().slice(0, 200) || buyer.email,
        email: buyer.email,
        verifiedEmail: buyer.verifiedEmail ?? null,
        phone: (buyer.phone ?? '').slice(0, 60),
        address: (buyer.address ?? '').slice(0, 500),
      },
      payments: row.payments.map((p) => ({
        id: p.id,
        method: p.method === 'ENFINITO_PAY' ? 'enfinito_pay' : 'manual',
        status: p.status === 'SUCCEEDED' ? 'succeeded' : 'refunded',
        livemode: p.livemode,
        amount: taka(p.amountCents),
        paidAt: p.paidAt,
        channel: p.channel,
        reference: p.reference,
        tranId: p.checkoutId,
        bankTranId: p.transactionId,
        cardType: p.method === 'ENFINITO_PAY' ? p.channel || null : null,
        gatewayFee: null,
      })),
    }
  })
}

const paidOf = (row: QueueRow) =>
  row.payments
    .filter((p) => p.status === 'SUCCEEDED')
    .reduce((s, p) => s + p.amountCents, 0)

/** What the CRM answered must be what NCOM has, down to the paisa. */
function crmDiffers(
  row: QueueRow,
  paidCents: number,
  crm: CrmView | null | undefined
): string | null {
  // Refunded before it was ever issued: nothing was billed, so it stays a draft.
  const neverIssued =
    row.status === 'PAID' && crm?.status === 'DRAFT' && !(paidCents > 0)
  if (!crm)
    return row.status === 'VOID'
      ? null
      : 'The CRM did not report the invoice back'
  if (crm.number !== row.number) return `The CRM has it as ${crm.number}`
  if (cents(crm.total) !== row.totalCents)
    return `Total is ${crm.total} in the CRM, ${taka(row.totalCents)} here`
  if (cents(crm.vatAmount) !== row.vatCents)
    return `VAT is ${crm.vatAmount} in the CRM, ${taka(row.vatCents)} here`
  if (cents(crm.sdAmount) !== row.sdCents)
    return `SD is ${crm.sdAmount} in the CRM, ${taka(row.sdCents)} here`
  if (!neverIssued && crm.status !== EXPECTED_STATUS[row.status])
    return `${crm.status} in the CRM, ${row.status.toLowerCase()} here`
  if (row.status === 'PAID' && cents(crm.received) !== paidCents)
    return `${crm.received} received in the CRM, ${taka(paidCents)} here`
  return null
}

function snapshotOf(crm: CrmView | null | undefined) {
  return crm
    ? ({
        clientCode: crm.clientCode,
        seller: crm.seller,
        buyer: crm.buyer,
        issuedAt: crm.issuedAt,
        status: crm.status,
      } as Prisma.InputJsonValue)
    : undefined
}

async function recordResult(row: QueueRow, r: SyncResult): Promise<void> {
  const snapshot = snapshotOf(r.crm)
  if (r.status === 'review') {
    // Not done: stays queued, so it completes by itself once finance has fixed the cause.
    await prisma.billingInvoice.updateMany({
      where: { id: row.id, crmVersion: row.crmVersion },
      data: {
        crmState: 'REVIEW',
        crmCode: r.code ?? null,
        crmError: r.message?.slice(0, 1000) ?? null,
        crmNextAttemptAt: inMs(REVIEW_RETRY_MS),
        ...(r.crm?.invoiceId && { crmInvoiceId: r.crm.invoiceId }),
        ...(snapshot && { crmSnapshot: snapshot }),
      },
    })
    return
  }
  if (r.status === 'ok') {
    const differs = crmDiffers(row, paidOf(row), r.crm)
    // One statement: a change that lands meanwhile (a newer version) keeps the invoice queued.
    await prisma.$executeRaw`
      UPDATE "BillingInvoice" SET
        "crmSyncedVersion" = GREATEST("crmSyncedVersion", ${row.crmVersion}),
        "crmState" = (CASE WHEN "crmVersion" > ${row.crmVersion} THEN 'PENDING'
                           WHEN ${differs}::text IS NULL THEN 'SYNCED' ELSE 'MISMATCH' END)::"CrmSyncState",
        "crmCode" = CASE WHEN ${differs}::text IS NULL THEN NULL ELSE 'MISMATCH' END,
        "crmError" = ${differs}::text,
        "crmAttempts" = 0,
        "crmSyncedAt" = now(),
        "crmInvoiceId" = COALESCE(${r.crm?.invoiceId ?? null}::text, "crmInvoiceId"),
        "crmSnapshot" = COALESCE(${snapshot ? JSON.stringify(snapshot) : null}::jsonb, "crmSnapshot"),
        "updatedAt" = now()
      WHERE "id" = ${row.id}
    `
    if (differs) console.warn(`[crm] invoice ${row.number} differs: ${differs}`)
    return
  }
  if (r.status === 'rejected') {
    // Fixable on the CRM's side (settings, a corrected value), so it is tried again now and then.
    await prisma.billingInvoice.updateMany({
      where: { id: row.id, crmVersion: row.crmVersion },
      data: {
        crmState: 'REJECTED',
        crmCode: r.code ?? null,
        crmError: r.message?.slice(0, 1000) ?? null,
        crmNextAttemptAt: inMs(REJECTED_RETRY_MS),
      },
    })
    console.warn(`[crm] invoice ${row.number} refused: ${r.code} ${r.message}`)
    return
  }
  await backOff([row], r.message ?? 'Try again')
}

async function backOff(rows: QueueRow[], message: string): Promise<void> {
  for (const row of rows) {
    await prisma.billingInvoice.updateMany({
      where: { id: row.id, crmVersion: row.crmVersion },
      data: {
        crmAttempts: { increment: 1 },
        crmError: message.slice(0, 500),
        crmNextAttemptAt: inMs(retryDelay(row.crmAttempts)),
      },
    })
  }
}

let lastTransportError: string | null = null
let policyVersionSeen: string | null = null

/** Invoices backing off (not the ones finance has to deal with) go on the next pass. */
async function wakeWaiting(): Promise<number> {
  const { count } = await prisma.billingInvoice.updateMany({
    where: {
      crmVersion: { gt: prisma.billingInvoice.fields.crmSyncedVersion },
      crmState: 'PENDING',
      crmNextAttemptAt: { gt: new Date() },
    },
    data: { crmNextAttemptAt: new Date() },
  })
  return count
}

/** Invoices that aren't for the CRM leave the queue; a change to one (it gets paid) brings it back. */
async function skipIneligible(): Promise<number> {
  const rows = await prisma.billingInvoice.findMany({
    where: {
      crmVersion: { gt: prisma.billingInvoice.fields.crmSyncedVersion },
      ...notEligible(),
    },
    select: { id: true, crmVersion: true },
    take: 1000,
  })
  for (const row of rows) {
    await prisma.billingInvoice.updateMany({
      where: { id: row.id, crmVersion: row.crmVersion },
      data: { crmSyncedVersion: row.crmVersion, crmState: 'SKIPPED' },
    })
  }
  return rows.length
}

/** Sends what is queued, batch after batch, until nothing is due. */
async function runCrmPass(): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0
  for (;;) {
    const rows = await loadQueue(BATCH)
    if (!rows.length) break
    const docs = await buildDocs(rows)
    let answer: { results: SyncResult[]; policyVersion?: string }
    try {
      answer = await crmCall<{ results: SyncResult[]; policyVersion?: string }>(
        { type: 'invoices.sync', items: docs }
      )
      if (lastTransportError) {
        const n = await wakeWaiting()
        console.log(`[crm] connection back, ${n} waiting invoices go now`)
      }
      lastTransportError = null
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message !== lastTransportError)
        console.warn(`[crm] ${message}; invoices wait and go later`)
      lastTransportError = message
      await backOff(rows, message)
      failed += rows.length
      break
    }
    const byId = new Map(rows.map((r) => [r.id, r]))
    for (const r of answer.results ?? []) {
      const row = byId.get(r.id)
      if (!row) continue
      if (r.status === 'ok') sent++
      else failed++
      await recordResult(row, r)
    }
    if (answer.policyVersion && answer.policyVersion !== policyVersionSeen) {
      policyVersionSeen = answer.policyVersion
      const policy = await currentPolicy()
      if (policy?.version !== answer.policyVersion)
        await refreshPolicy().catch(() => undefined)
    }
    if (rows.length < BATCH) break
  }
  return { sent, failed }
}

// ------------------------------------------------------------------- comparison

export interface ReconcileReport {
  at: string
  target: string | null
  ncom: { count: number; total: number; vat: number; paid: number }
  crm: { count: number; total: number; vat: number; paid: number }
  pending: number
  diffCount: number
  diffs: { id: number; number: string; code: string; detail: string }[]
  resent: number
}

const MAX_DIFFS_KEPT = 100
/** A fresh push can settle these; anything else needs a person. */
const RESEND = new Set(['MISSING_IN_CRM', 'STATUS_DIFFERS', 'PAID_DIFFERS'])

async function requeue(id: number): Promise<number> {
  const { count } = await prisma.billingInvoice.updateMany({
    where: { id },
    data: {
      crmVersion: { increment: 1 },
      crmState: 'PENDING',
      crmAttempts: 0,
      crmNextAttemptAt: new Date(),
    },
  })
  return count
}

/** Compares every invoice with the CRM, both ways, page by page. Pushes again what a push can fix. */
export async function reconcileWithCrm(): Promise<ReconcileReport> {
  const totals = {
    ncom: { count: 0, total: 0, vat: 0, paid: 0 },
    crm: { count: 0, total: 0, vat: 0, paid: 0 },
  }
  const diffs: ReconcileReport['diffs'] = []
  let diffCount = 0
  let pending = 0
  let resent = 0
  let cursor = 0
  for (;;) {
    const rows = await prisma.billingInvoice.findMany({
      where: { ...eligible(), id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: RECONCILE_PAGE,
      select: {
        id: true,
        number: true,
        status: true,
        totalCents: true,
        vatCents: true,
        sdCents: true,
        crmVersion: true,
        crmSyncedVersion: true,
        payments: {
          where: { status: 'SUCCEEDED' },
          select: { amountCents: true },
        },
      },
    })
    const last = rows.length < RECONCILE_PAGE
    const toId = last ? MAX_INT : rows[rows.length - 1]!.id
    const paid = (r: (typeof rows)[number]) =>
      r.payments.reduce((s, p) => s + p.amountCents, 0)
    const page = await crmCall<{
      diffs: ReconcileReport['diffs']
      crm: ReconcileReport['crm']
    }>({
      type: 'reconcile.page',
      fromId: cursor,
      toId,
      items: rows.map((r) => ({
        id: r.id,
        number: r.number,
        status: DOC_STATUS[r.status],
        total: taka(r.totalCents),
        vat: taka(r.vatCents),
        sd: taka(r.sdCents),
        paid: taka(paid(r)),
      })),
    })
    const inFlight = new Set(
      rows.filter((r) => r.crmVersion > r.crmSyncedVersion).map((r) => r.id)
    )
    pending += inFlight.size
    for (const r of rows) {
      if (r.status === 'VOID') continue
      totals.ncom.count++
      totals.ncom.total += r.totalCents
      totals.ncom.vat += r.vatCents
      totals.ncom.paid += paid(r)
    }
    totals.crm.count += page.crm.count
    totals.crm.total += cents(page.crm.total)
    totals.crm.vat += cents(page.crm.vat)
    totals.crm.paid += cents(page.crm.paid)
    for (const d of page.diffs) {
      // Still on its way: not a difference yet.
      if (inFlight.has(d.id)) continue
      diffCount++
      if (diffs.length < MAX_DIFFS_KEPT) diffs.push(d)
      if (RESEND.has(d.code)) resent += await requeue(d.id)
    }
    if (last) break
    cursor = toId
  }
  const toMoney = (t: {
    count: number
    total: number
    vat: number
    paid: number
  }) => ({
    count: t.count,
    total: taka(t.total),
    vat: taka(t.vat),
    paid: taka(t.paid),
  })
  const report: ReconcileReport = {
    at: new Date().toISOString(),
    target: crmHost(),
    ncom: toMoney(totals.ncom),
    crm: toMoney(totals.crm),
    pending,
    diffCount,
    diffs,
    resent,
  }
  await writeSetting(RECONCILE_KEY, report)
  await crmCall({ type: 'reconcile.report', report }).catch(() => undefined)
  if (diffCount)
    console.warn(
      `[crm] comparison found ${diffCount} difference(s), pushed ${resent} again`
    )
  else
    console.log(
      `[crm] comparison: ${report.ncom.count} invoices agree (${pending} on their way)`
    )
  return report
}

// ------------------------------------------------------------------ admin screen

export async function crmStatus() {
  if (!crmEnabled()) return { enabled: false as const, target: null }
  const [states, problems, reconcile, policy] = await Promise.all([
    prisma.billingInvoice.groupBy({
      by: ['crmState'],
      where: eligible(),
      _count: { _all: true },
    }),
    prisma.billingInvoice.findMany({
      where: {
        ...eligible(),
        AND: [
          {
            OR: [
              { crmState: { in: ['REVIEW', 'REJECTED', 'MISMATCH'] } },
              { crmState: 'PENDING', crmAttempts: { gt: 0 } },
            ],
          },
        ],
      },
      orderBy: { id: 'desc' },
      take: 30,
      select: {
        id: true,
        number: true,
        status: true,
        totalCents: true,
        crmState: true,
        crmCode: true,
        crmError: true,
        crmNextAttemptAt: true,
        organization: { select: { name: true } },
      },
    }),
    readSetting<ReconcileReport>(RECONCILE_KEY),
    currentPolicy(),
  ])
  return {
    enabled: true as const,
    target: crmHost(),
    connectionError: lastTransportError,
    syncFrom: crmSyncFrom(),
    counts: Object.fromEntries(
      states.map((s) => [s.crmState, s._count._all])
    ) as Partial<Record<CrmSyncState, number>>,
    problems,
    reconcile,
    policy,
  }
}

export async function resendInvoice(id: number): Promise<number> {
  const n = await requeue(id)
  scheduleCrmSync()
  return n
}

// ------------------------------------------------------------------------- clock

/**
 * Moving to another CRM (demo to live): that CRM has none of this, so
 * everything is queued for it. Numbers and amounts stay what they are;
 * CRM_SYNC_FROM keeps invoices from before go-live out of the new books.
 */
async function followTarget(): Promise<void> {
  const target = crmHost()
  const from = crmSyncFrom()?.toISOString() ?? null
  const row = await readSetting<{ host: string; from?: string | null }>(
    TARGET_KEY
  )
  if (row?.host === target && (row.from ?? null) === from) return
  const moved = !!row?.host && row.host !== target
  if (row?.host) {
    const { count } = await prisma.billingInvoice.updateMany({
      data: {
        crmSyncedVersion: 0,
        crmState: 'PENDING',
        crmAttempts: 0,
        crmNextAttemptAt: new Date(),
        crmInvoiceId: null,
        crmSnapshot: Prisma.DbNull,
        crmCode: null,
        crmError: null,
      },
    })
    console.log(
      moved
        ? `[crm] now connected to ${target} instead of ${row.host}: ${count} invoices queued for it`
        : `[crm] go-live date changed: ${count} invoices looked at again`
    )
  }
  // Its rules, not the last CRM's: nothing is billed under them until it has answered.
  if (moved) await forgetPolicy()
  await deleteSetting(RECONCILE_KEY)
  await writeSetting(TARGET_KEY, { host: target, from })
}

let running: Promise<CrmJobResult> | null = null
let lastPolicyAt = 0

export interface CrmJobResult {
  enabled: boolean
  sent?: number
  failed?: number
  skipped?: number
  compared?: boolean
  error?: string
}

async function job(options: { compare?: boolean }): Promise<CrmJobResult> {
  if (!crmEnabled()) return { enabled: false }
  await followTarget()
  if (Date.now() - lastPolicyAt > POLICY_EVERY_MS) {
    lastPolicyAt = Date.now()
    await refreshPolicy().catch((err: unknown) => {
      console.warn(
        '[crm] tax settings not refreshed:',
        err instanceof Error ? err.message : err
      )
    })
  }
  const skipped = await skipIneligible()
  const { sent, failed } = await runCrmPass()
  let compared = false
  const last = await readSetting<ReconcileReport>(RECONCILE_KEY)
  const due =
    options.compare ||
    !last ||
    Date.now() - new Date(last.at).getTime() > RECONCILE_EVERY_MS
  if (due && !lastTransportError) {
    await reconcileWithCrm()
    compared = true
  }
  return { enabled: true, sent, failed, skipped, compared }
}

/**
 * One run of the CRM clock: follow the address, refresh the tax settings,
 * push what is queued, compare when it is time. One at a time per process.
 */
export function runCrmJob(
  options: { compare?: boolean } = {}
): Promise<CrmJobResult> {
  if (running) return running
  running = job(options)
    .catch((err: unknown) => {
      const error =
        err instanceof CrmError || err instanceof Error
          ? err.message
          : String(err)
      console.warn('[crm] run failed:', error)
      return { enabled: true, error }
    })
    .finally(() => {
      running = null
    })
  return running
}

/** Pushes now, after the response: a sale changed. The minute cron catches anything missed. */
export function scheduleCrmSync(): void {
  if (!crmEnabled()) return
  const run = () => {
    void runCrmJob()
  }
  try {
    after(run)
  } catch {
    // Outside a request (a script): just go.
    run()
  }
}
