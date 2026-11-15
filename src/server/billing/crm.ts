import 'server-only'
import { createHmac } from 'node:crypto'
import { prisma } from '@/server/db/client'
import type { Prisma } from '@/generated/prisma/client'
import { NO_TAX, VAT_TREATMENTS, type TaxPolicy } from './tax'

/**
 * The connection to the Enfinito CRM, where NCOM's sales are invoiced and
 * booked as income under the NCOM product, and where VAT is decided.
 *
 *   CRM_BASE_URL    the CRM's address (https://crm.enfinito.com)
 *   CRM_API_SECRET  the whsec_… secret made in the CRM (Configuration →
 *                   Integrations → NCOM)
 *   CRM_SYNC_FROM   optional go-live day (YYYY-MM-DD, a Dhaka day): invoices
 *                   raised and paid before it stay out of the CRM's books
 *
 * Unset = not connected: no VAT, nothing sent. Calls are signed like the CRM's
 * other webhooks: Ncom-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of
 * "<t>.<raw body>">.
 */

export class CrmError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'CrmError'
  }
}

function baseUrl(): string {
  return (process.env.CRM_BASE_URL ?? '').trim().replace(/\/$/, '')
}

function secret(): string {
  return (process.env.CRM_API_SECRET ?? '').trim()
}

export const crmEnabled = (): boolean => !!baseUrl() && !!secret()

export function crmHost(): string | null {
  const url = baseUrl()
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Go-live, as an instant: a bare date is the start of that day in Dhaka. */
export function crmSyncFrom(): Date | null {
  const raw = (process.env.CRM_SYNC_FROM ?? '').trim()
  if (!raw) return null
  const value = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00+06:00` : raw
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function crmCall<T>(
  body: Record<string, unknown>,
  timeoutMs = 55_000
): Promise<T> {
  const text = JSON.stringify(body)
  const t = Math.floor(Date.now() / 1000)
  const v1 = createHmac('sha256', secret())
    .update(`${t}.`)
    .update(text)
    .digest('hex')
  let response: Response
  try {
    response = await fetch(`${baseUrl()}/api/webhooks/ncom`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'NCOM',
        'ncom-signature': `t=${t},v1=${v1}`,
      },
      body: text,
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    })
  } catch (cause) {
    throw new CrmError(
      0,
      `The CRM did not answer: ${cause instanceof Error ? cause.message : String(cause)}`
    )
  }
  const data = (await response.json().catch(() => null)) as
    (T & { error?: string }) | null
  if (!response.ok || !data) {
    throw new CrmError(
      response.status,
      data?.error ?? `The CRM answered ${response.status}`
    )
  }
  return data
}

// ---------------------------------------------------------------- settings kept here

const POLICY_KEY = 'crm.policy'

export async function readSetting<T>(key: string): Promise<T | null> {
  const row = await prisma.platformSetting.findUnique({ where: { key } })
  return (row?.value as T | undefined) ?? null
}

export async function writeSetting(key: string, value: unknown): Promise<void> {
  const json = value as Prisma.InputJsonValue
  await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value: json },
    update: { value: json },
  })
}

export async function deleteSetting(key: string): Promise<void> {
  await prisma.platformSetting.deleteMany({ where: { key } })
}

// -------------------------------------------------------------------- tax settings
// Kept in the database: owners can check out while the CRM is away or NCOM has
// just restarted. Cached briefly in memory, read from the database otherwise.

let cached: { policy: TaxPolicy | null; at: number } | null = null
const CACHE_MS = 10_000

function isPolicy(value: unknown): value is TaxPolicy {
  const p = value as TaxPolicy | null
  return (
    !!p &&
    VAT_TREATMENTS.includes(p.vatTreatment) &&
    typeof p.vatRate === 'number' &&
    typeof p.sdRate === 'number' &&
    typeof p.pricesIncludeVat === 'boolean' &&
    Array.isArray(p.zeroRatedAccounts)
  )
}

/** The tax settings to bill with; null only when connected but the CRM has never answered. */
export async function currentPolicy(): Promise<TaxPolicy | null> {
  if (!crmEnabled()) return NO_TAX
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.policy
  const stored = await readSetting<TaxPolicy & { host?: string | null }>(
    POLICY_KEY
  )
  // Given by another CRM (the address was changed): its rules no longer apply.
  const policy =
    isPolicy(stored) && stored.host === crmHost() ? withoutHost(stored) : null
  cached = { policy, at: Date.now() }
  return policy
}

function withoutHost(stored: TaxPolicy & { host?: string | null }): TaxPolicy {
  const policy: TaxPolicy & { host?: string | null } = { ...stored }
  delete policy.host
  return policy
}

/**
 * The tax settings to bill with, asking the CRM when it has never answered
 * (a first sale right after connecting). Null: billing has to wait.
 */
export async function policyForBilling(): Promise<TaxPolicy | null> {
  const policy = await currentPolicy()
  if (policy) return policy
  return refreshPolicy(10_000).catch(() => null)
}

/** Connected to another CRM: its rules apply, so nothing is billed until it has given them. */
export async function forgetPolicy(): Promise<void> {
  await deleteSetting(POLICY_KEY)
  cached = null
}

/** Asks the CRM for its tax settings. A failure keeps the last ones. */
export async function refreshPolicy(timeoutMs = 20_000): Promise<TaxPolicy> {
  const data = await crmCall<{ policy: unknown }>({ type: 'policy' }, timeoutMs)
  if (!isPolicy(data.policy)) {
    throw new CrmError(
      502,
      'The CRM sent tax settings NCOM does not understand'
    )
  }
  const next: TaxPolicy = {
    version: data.policy.version ?? null,
    vatTreatment: data.policy.vatTreatment,
    vatRate: Number(data.policy.vatRate) || 0,
    sdRate: Number(data.policy.sdRate) || 0,
    pricesIncludeVat: data.policy.pricesIncludeVat,
    serviceCode: data.policy.serviceCode ?? null,
    zeroRatedAccounts: data.policy.zeroRatedAccounts
      .map(Number)
      .filter(Number.isInteger),
    seller: data.policy.seller ?? null,
  }
  const before = await readSetting<TaxPolicy & { host?: string | null }>(
    POLICY_KEY
  )
  const stored = { ...next, host: crmHost() }
  if (JSON.stringify(before) !== JSON.stringify(stored)) {
    await writeSetting(POLICY_KEY, stored)
    if (before?.version !== next.version || before?.host !== stored.host) {
      console.log(
        `[crm] tax settings now ${next.vatTreatment} ${next.vatRate}% (${next.version}), ${next.pricesIncludeVat ? 'inside' : 'on top of'} prices`
      )
    }
  }
  cached = { policy: next, at: Date.now() }
  return next
}
