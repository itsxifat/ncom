import 'server-only'
import { prisma } from '@/server/db/client'
import type { Prisma } from '@/generated/prisma/client'
import {
  requireHumanOrgAccess,
  requireOrgAccess,
  requirePlatformAdmin,
} from '@/server/auth/rbac'
import { usagePeriodKey } from '@/lib/plans'
import { formatMoney } from '@/lib/money'
import { getEntitlements } from './entitlementService'
import { logAudit } from './auditService'

/**
 * AI builder credits.
 *
 * Every AI request a workspace makes — a whole site, a page, one section —
 * costs credits (the prices are the platform team's, see aiSettingsService),
 * because every one of them costs the platform real money at Anthropic. A
 * workspace has two kinds:
 *
 *   The month's allowance, from its plan (`Plan.aiMonthlyCredits`). Spent
 *   first. It refreshes on the 1st and does not carry over, like the plan's
 *   traffic allowance.
 *
 *   Its balance: credits bought as packs, given once on starting a plan
 *   (`Plan.aiStartCredits`), or granted by the platform team. These never
 *   expire.
 *
 * A request is paid for before Claude is called and refunded if no design
 * comes back, so a workspace only ever pays for designs it received. Every
 * movement is an `AiCreditEntry`; the account row is locked for each one, so
 * two requests at once cannot both spend the last credit.
 */

/** Raised when a workspace cannot pay for a request. Its message is for the merchant. */
export class NotEnoughCreditsError extends Error {
  constructor(
    readonly needed: number,
    readonly available: number,
    readonly refreshesAt: Date,
    /** Whether the plan gives credits every month, so some will come back. */
    monthly: boolean
  ) {
    super(
      available > 0
        ? `This needs ${needed} AI credits and you have ${available} left. You can buy more under Plan & billing.`
        : monthly
          ? `You’ve used this month’s AI credits. They come back on ${formatDay(refreshesAt)}, or you can buy more under Plan & billing.`
          : 'You don’t have any AI credits left. You can buy credits under Plan & billing.'
    )
    this.name = 'NotEnoughCreditsError'
  }
}

export class CreditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CreditError'
  }
}

export interface AiCreditSummary {
  /** The plan's allowance this month, how much is used, and what is left. */
  monthlyAllowance: number
  monthlyUsed: number
  monthlyLeft: number
  /** Bought and granted credits. Never expire. */
  balance: number
  /** Everything that can be spent right now. */
  available: number
  /** When the month's allowance refreshes: the 1st of next month, UTC. */
  refreshesAt: string
  planName: string
}

/** What one spend took from each pot, for refunding it exactly. */
export interface CreditCharge {
  organizationId: string
  period: string
  fromMonthly: number
  fromBalance: number
  /** Credits left after it, for the screen that asked. */
  availableAfter: number
}

interface AccountRow {
  balance: number
  monthlyPeriod: string
  monthlyUsed: number
}

function formatDay(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

/** The first instant of next month, UTC — when the allowance comes back. */
function nextRefresh(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
}

/**
 * The workspace's account row, created if missing, locked for this
 * transaction, and moved to the current month if a new one has started.
 */
async function lockAccount(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<AccountRow> {
  const period = usagePeriodKey()
  // ON CONFLICT rather than an upsert: two first requests at once would both
  // miss a find and one would fail the insert.
  await tx.$executeRaw`
    INSERT INTO "AiCreditAccount" ("organizationId", "balance", "monthlyPeriod", "monthlyUsed", "updatedAt")
    VALUES (${organizationId}, 0, ${period}, 0, now())
    ON CONFLICT ("organizationId") DO NOTHING`
  const [row] = await tx.$queryRaw<AccountRow[]>`
    SELECT "balance", "monthlyPeriod", "monthlyUsed"
    FROM "AiCreditAccount"
    WHERE "organizationId" = ${organizationId}
    FOR UPDATE`
  if (!row) throw new CreditError('The credit account could not be opened.')
  if (row.monthlyPeriod === period) return row
  await tx.aiCreditAccount.update({
    where: { organizationId },
    data: { monthlyPeriod: period, monthlyUsed: 0 },
  })
  return { ...row, monthlyPeriod: period, monthlyUsed: 0 }
}

/**
 * The plan's one-time credits, given the first time the workspace is seen on
 * that plan — at signup for the default plan, after an upgrade for another.
 * Once per workspace per plan, by the entry's dedupe key.
 */
async function giveStartCredits(
  tx: Prisma.TransactionClient,
  organizationId: string,
  account: AccountRow,
  plan: { planId: string; planName: string; onStart: number }
): Promise<AccountRow> {
  if (plan.onStart <= 0 || !plan.planId) return account
  const dedupeKey = `plan-start:${organizationId}:${plan.planId}`
  const given = await tx.aiCreditEntry.findUnique({
    where: { dedupeKey },
    select: { id: true },
  })
  if (given) return account
  const balance = account.balance + plan.onStart
  await tx.aiCreditAccount.update({
    where: { organizationId },
    data: { balance },
  })
  await tx.aiCreditEntry.create({
    data: {
      organizationId,
      kind: 'PLAN_START',
      balanceDelta: plan.onStart,
      balanceAfter: balance,
      description: `Included with the ${plan.planName} plan`,
      dedupeKey,
    },
  })
  return { ...account, balance }
}

async function planCredits(organizationId: string) {
  const entitlements = await getEntitlements(organizationId)
  return {
    planId: entitlements.planId,
    planName: entitlements.planName,
    monthly: entitlements.aiCredits.monthly,
    onStart: entitlements.aiCredits.onStart,
  }
}

function summarize(
  account: AccountRow,
  plan: { monthly: number; planName: string }
): AiCreditSummary {
  const monthlyLeft = Math.max(0, plan.monthly - account.monthlyUsed)
  return {
    monthlyAllowance: plan.monthly,
    monthlyUsed: account.monthlyUsed,
    monthlyLeft,
    balance: account.balance,
    available: monthlyLeft + account.balance,
    refreshesAt: nextRefresh().toISOString(),
    planName: plan.planName,
  }
}

async function readSummary(organizationId: string): Promise<AiCreditSummary> {
  const plan = await planCredits(organizationId)
  return prisma.$transaction(async (tx) => {
    const account = await giveStartCredits(
      tx,
      organizationId,
      await lockAccount(tx, organizationId),
      plan
    )
    return summarize(account, plan)
  })
}

/** A workspace's credits, for its own members. */
export async function getAiCreditSummary(
  organizationId: string
): Promise<AiCreditSummary> {
  await requireOrgAccess(organizationId, 'VIEWER')
  return readSummary(organizationId)
}

/** A workspace's credits, for the platform team. */
export async function getAiCreditSummaryForAdmin(
  organizationId: string
): Promise<AiCreditSummary> {
  await requirePlatformAdmin()
  return readSummary(organizationId)
}

/**
 * Pays for an AI request: from the month's allowance first, then the balance.
 * Throws `NotEnoughCreditsError` — with a sentence for the merchant — when the
 * workspace cannot cover it, before anything is spent.
 */
export async function spendAiCredits(
  organizationId: string,
  cost: number,
  input: { description: string; userId: string | null }
): Promise<CreditCharge> {
  await requireOrgAccess(organizationId, 'EDITOR')
  const plan = await planCredits(organizationId)
  return prisma.$transaction(async (tx) => {
    const account = await giveStartCredits(
      tx,
      organizationId,
      await lockAccount(tx, organizationId),
      plan
    )
    const monthlyLeft = Math.max(0, plan.monthly - account.monthlyUsed)
    const available = monthlyLeft + account.balance
    if (cost > available) {
      throw new NotEnoughCreditsError(
        cost,
        available,
        nextRefresh(),
        plan.monthly > 0
      )
    }
    const fromMonthly = Math.min(cost, monthlyLeft)
    const fromBalance = cost - fromMonthly
    const balance = account.balance - fromBalance
    if (cost > 0) {
      await tx.aiCreditAccount.update({
        where: { organizationId },
        data: { balance, monthlyUsed: account.monthlyUsed + fromMonthly },
      })
      await tx.aiCreditEntry.create({
        data: {
          organizationId,
          kind: 'USAGE',
          monthlyDelta: -fromMonthly,
          balanceDelta: -fromBalance,
          balanceAfter: balance,
          description: input.description,
          createdById: input.userId,
        },
      })
    }
    return {
      organizationId,
      period: account.monthlyPeriod,
      fromMonthly,
      fromBalance,
      availableAfter: available - cost,
    }
  })
}

/**
 * Gives back what a request was charged, when no design came back. The
 * allowance part returns to the allowance — or, if a new month started while
 * the request ran, to the balance, so it is not lost to the reset.
 */
export async function refundAiCredits(
  charge: CreditCharge,
  description: string
): Promise<number> {
  const total = charge.fromMonthly + charge.fromBalance
  const plan = await planCredits(charge.organizationId)
  return prisma.$transaction(async (tx) => {
    const account = await lockAccount(tx, charge.organizationId)
    if (total <= 0) return summarize(account, plan).available
    const sameMonth = account.monthlyPeriod === charge.period
    const monthlyBack = sameMonth
      ? Math.min(charge.fromMonthly, account.monthlyUsed)
      : 0
    const balance =
      account.balance + charge.fromBalance + (charge.fromMonthly - monthlyBack)
    const monthlyUsed = account.monthlyUsed - monthlyBack
    await tx.aiCreditAccount.update({
      where: { organizationId: charge.organizationId },
      data: { balance, monthlyUsed },
    })
    await tx.aiCreditEntry.create({
      data: {
        organizationId: charge.organizationId,
        kind: 'REFUND',
        monthlyDelta: monthlyBack,
        balanceDelta: balance - account.balance,
        balanceAfter: balance,
        description,
      },
    })
    return summarize({ ...account, balance, monthlyUsed }, plan).available
  })
}

/**
 * The most credits a balance can hold: the largest number its column (a
 * Postgres integer) stores. Past it, the write fails with a database error
 * instead of a sentence — a grant typed with three zeros too many took the
 * admin page down rather than saying so.
 */
export const MAX_CREDIT_BALANCE = 2_147_483_647

/** Adds to (or, with a negative amount, takes from) the balance, once per dedupe key. */
async function changeBalance(
  tx: Prisma.TransactionClient,
  organizationId: string,
  credits: number,
  entry: {
    kind: 'PURCHASE' | 'ADMIN_GRANT' | 'ADMIN_DEDUCT'
    description: string
    dedupeKey?: string
    orderId?: string
    createdById?: string | null
  }
): Promise<number> {
  const account = await lockAccount(tx, organizationId)
  if (entry.dedupeKey) {
    const done = await tx.aiCreditEntry.findUnique({
      where: { dedupeKey: entry.dedupeKey },
      select: { id: true },
    })
    if (done) return account.balance
  }
  const balance = account.balance + credits
  if (balance < 0) {
    throw new CreditError(
      `This workspace has only ${account.balance} bought or granted credits to remove.`
    )
  }
  if (balance > MAX_CREDIT_BALANCE) {
    throw new CreditError(
      `That would put the balance at ${balance.toLocaleString('en')} credits; a workspace can hold at most ${MAX_CREDIT_BALANCE.toLocaleString('en')}.`
    )
  }
  await tx.aiCreditAccount.update({
    where: { organizationId },
    data: { balance },
  })
  await tx.aiCreditEntry.create({
    data: {
      organizationId,
      kind: entry.kind,
      balanceDelta: credits,
      balanceAfter: balance,
      description: entry.description,
      dedupeKey: entry.dedupeKey,
      orderId: entry.orderId,
      createdById: entry.createdById ?? null,
    },
  })
  return balance
}

export interface AiCreditEntryRow {
  id: string
  kind: string
  credits: number
  balanceAfter: number
  description: string
  createdAt: Date
}

async function readEntries(
  organizationId: string,
  take: number
): Promise<AiCreditEntryRow[]> {
  const rows = await prisma.aiCreditEntry.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take,
  })
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    credits: row.monthlyDelta + row.balanceDelta,
    balanceAfter: row.balanceAfter,
    description: row.description,
    createdAt: row.createdAt,
  }))
}

export async function listAiCreditEntries(
  organizationId: string,
  take = 20
): Promise<AiCreditEntryRow[]> {
  await requireOrgAccess(organizationId, 'VIEWER')
  return readEntries(organizationId, take)
}

export async function listAiCreditEntriesForAdmin(
  organizationId: string,
  take = 20
): Promise<AiCreditEntryRow[]> {
  await requirePlatformAdmin()
  return readEntries(organizationId, take)
}

/**
 * The platform team adding or removing credits on a workspace — goodwill, a
 * deal, a correction. Only the balance: the month's allowance is the plan's.
 */
export async function adjustAiCreditsAsAdmin(input: {
  organizationId: string
  credits: number
  note: string
}): Promise<void> {
  const session = await requirePlatformAdmin()
  if (!Number.isInteger(input.credits) || input.credits === 0) {
    throw new CreditError('Enter a whole number of credits, not 0.')
  }
  const note = input.note.trim().slice(0, 200)
  await prisma.$transaction((tx) =>
    changeBalance(tx, input.organizationId, input.credits, {
      kind: input.credits > 0 ? 'ADMIN_GRANT' : 'ADMIN_DEDUCT',
      description:
        note ||
        (input.credits > 0
          ? 'Added by the NCOM team'
          : 'Removed by the NCOM team'),
      createdById: session.user.id,
    })
  )
  await logAudit(
    session.user.id,
    'ai.credits.adjusted',
    'Organization',
    input.organizationId,
    { credits: input.credits, note }
  )
}

// ── Packs ────────────────────────────────────────────────────────────────

export interface CreditPackRow {
  id: string
  name: string
  credits: number
  currencyCode: string
  priceCents: number
  isActive: boolean
  position: number
}

/** The packs a workspace can buy, cheapest-first as the team ordered them. */
export async function listCreditPacks(): Promise<CreditPackRow[]> {
  return prisma.aiCreditPack.findMany({
    where: { isActive: true },
    orderBy: [{ position: 'asc' }, { credits: 'asc' }],
  })
}

export async function listCreditPacksForAdmin(): Promise<CreditPackRow[]> {
  await requirePlatformAdmin()
  return prisma.aiCreditPack.findMany({
    orderBy: [{ position: 'asc' }, { credits: 'asc' }],
  })
}

export async function saveCreditPack(
  packId: string | null,
  input: {
    name: string
    credits: number
    priceCents: number
    currencyCode: string
    isActive: boolean
    position: number
  }
): Promise<string> {
  const session = await requirePlatformAdmin()
  const data = {
    name: input.name.trim().slice(0, 60),
    credits: input.credits,
    priceCents: input.priceCents,
    currencyCode: input.currencyCode,
    isActive: input.isActive,
    position: input.position,
  }
  const pack = packId
    ? await prisma.aiCreditPack.update({ where: { id: packId }, data })
    : await prisma.aiCreditPack.create({ data })
  await logAudit(
    session.user.id,
    packId ? 'ai.pack.updated' : 'ai.pack.created',
    'AiCreditPack',
    pack.id,
    { ...data }
  )
  return pack.id
}

/** Orders keep their own copy of what was bought, so a pack can go. */
export async function deleteCreditPack(packId: string): Promise<void> {
  const session = await requirePlatformAdmin()
  await prisma.aiCreditPack.deleteMany({ where: { id: packId } })
  await logAudit(session.user.id, 'ai.pack.deleted', 'AiCreditPack', packId)
}

// ── Orders ───────────────────────────────────────────────────────────────

/**
 * A workspace asking for a pack.
 *
 * Like a plan order it is recorded as waiting for payment; the owner pays it
 * through Enfinito Pay (`billingPaymentService`), and the confirmed payment is
 * what puts the credits on the balance. A pack priced at 0 is given at once.
 */
export async function orderCreditPack(
  organizationId: string,
  packId: string
): Promise<{ orderId: string; paid: boolean }> {
  const { session } = await requireHumanOrgAccess(organizationId, 'OWNER')
  const pack = await prisma.aiCreditPack.findFirst({
    where: { id: packId, isActive: true },
  })
  if (!pack) throw new CreditError('That credit pack is no longer offered.')

  const open = await prisma.aiCreditOrder.count({
    where: { organizationId, status: 'AWAITING_PAYMENT' },
  })
  if (open >= 5) {
    throw new CreditError(
      'You already have several credit orders waiting for payment. Our team will be in touch about them.'
    )
  }

  const order = await prisma.aiCreditOrder.create({
    data: {
      organizationId,
      packId: pack.id,
      packName: pack.name,
      credits: pack.credits,
      currencyCode: pack.currencyCode,
      totalCents: pack.priceCents,
      createdById: session.user.id,
    },
  })
  await logAudit(
    session.user.id,
    'ai.order.created',
    'AiCreditOrder',
    order.id,
    {
      packId: pack.id,
      credits: pack.credits,
      totalCents: pack.priceCents,
    }
  )

  if (pack.priceCents === 0) {
    await settleOrder(order.id, { actorUserId: session.user.id })
    return { orderId: order.id, paid: true }
  }
  return { orderId: order.id, paid: false }
}

async function settleOrder(
  orderId: string,
  input: {
    actorUserId: string | null
    provider?: string
    providerReference?: string
  }
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.aiCreditOrder.findUnique({ where: { id: orderId } })
    if (!order) throw new CreditError('Order not found.')
    if (order.status === 'PAID') return false
    if (order.status === 'CANCELED') {
      throw new CreditError('That order was cancelled and cannot be paid.')
    }
    // Only from waiting: a payment's webhook and the owner's return can
    // settle the same order at once, and only one of them may count.
    const { count } = await tx.aiCreditOrder.updateMany({
      where: { id: orderId, status: 'AWAITING_PAYMENT' },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        provider: input.provider ?? order.provider,
        providerReference: input.providerReference ?? order.providerReference,
      },
    })
    if (count === 0) return false
    await changeBalance(tx, order.organizationId, order.credits, {
      kind: 'PURCHASE',
      description: `Bought ${order.packName} (${order.credits} credits) for ${formatMoney(order.totalCents, order.currencyCode)}`,
      dedupeKey: `order:${order.id}`,
      orderId: order.id,
      createdById: input.actorUserId,
    })
    return true
  })
}

/**
 * Puts a paid order's credits on the balance once Enfinito Pay has confirmed
 * the payment. Once per order however often it is called — a webhook and the
 * owner's return from the payment page both arrive for the same payment — and
 * true only for the call that did it.
 *
 * Authorization is the caller's: the payment was checked with Enfinito Pay,
 * and a webhook has no session to check. `actorUserId` is the person who
 * placed the order.
 */
export async function settleCreditOrderPayment(
  orderId: string,
  input: {
    actorUserId: string | null
    provider: string
    providerReference?: string
  }
): Promise<boolean> {
  const settled = await settleOrder(orderId, input)
  if (settled) {
    await logAudit(
      input.actorUserId,
      'ai.order.paid',
      'AiCreditOrder',
      orderId,
      { provider: input.provider }
    )
  }
  return settled
}

/**
 * Marks an order paid and adds its credits: the platform team's button, for
 * an order settled some other way than Enfinito Pay.
 */
export async function markCreditOrderPaid(
  orderId: string,
  input: { provider?: string; providerReference?: string } = {}
): Promise<void> {
  const session = await requirePlatformAdmin()
  await settleOrder(orderId, { actorUserId: session.user.id, ...input })
  await logAudit(session.user.id, 'ai.order.paid', 'AiCreditOrder', orderId, {
    provider: input.provider ?? null,
  })
}

export async function cancelCreditOrder(orderId: string): Promise<void> {
  const session = await requirePlatformAdmin()
  const { count } = await prisma.aiCreditOrder.updateMany({
    where: { id: orderId, status: 'AWAITING_PAYMENT' },
    data: { status: 'CANCELED', canceledAt: new Date() },
  })
  if (count === 0) {
    throw new CreditError(
      'Only an order still waiting for payment can be cancelled.'
    )
  }
  await logAudit(session.user.id, 'ai.order.canceled', 'AiCreditOrder', orderId)
}

export async function listCreditOrders(organizationId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')
  return prisma.aiCreditOrder.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
}

/** Orders for the platform team: waiting ones, or all of one workspace's. */
export async function listCreditOrdersForAdmin(
  filter: { open: true } | { organizationId: string }
) {
  await requirePlatformAdmin()
  return prisma.aiCreditOrder.findMany({
    where:
      'open' in filter
        ? { status: 'AWAITING_PAYMENT' }
        : { organizationId: filter.organizationId },
    orderBy: { createdAt: 'desc' },
    take: 'open' in filter ? 200 : 20,
    include: { organization: { select: { id: true, name: true } } },
  })
}

/** Credits used across the platform this month, for the admin overview. */
export async function platformCreditUsageThisMonth(): Promise<{
  used: number
  requests: number
}> {
  await requirePlatformAdmin()
  const start = new Date()
  start.setUTCDate(1)
  start.setUTCHours(0, 0, 0, 0)
  const [usage, refunds] = await Promise.all([
    prisma.aiCreditEntry.aggregate({
      where: { kind: 'USAGE', createdAt: { gte: start } },
      _sum: { monthlyDelta: true, balanceDelta: true },
      _count: { _all: true },
    }),
    prisma.aiCreditEntry.aggregate({
      where: { kind: 'REFUND', createdAt: { gte: start } },
      _sum: { monthlyDelta: true, balanceDelta: true },
      _count: { _all: true },
    }),
  ])
  const spent = -(
    (usage._sum.monthlyDelta ?? 0) + (usage._sum.balanceDelta ?? 0)
  )
  const back =
    (refunds._sum.monthlyDelta ?? 0) + (refunds._sum.balanceDelta ?? 0)
  return {
    used: Math.max(0, spent - back),
    requests: Math.max(0, usage._count._all - refunds._count._all),
  }
}
