import 'server-only'
import { randomBytes } from 'node:crypto'
import { Resolver } from 'node:dns/promises'
import { prisma } from '@/server/db/client'
import type { DomainRecordType, DomainStatus } from '@/generated/prisma/enums'
import { requireOrgAccess } from '@/server/auth/rbac'
import { env } from '@/lib/env'
import { RESERVED_SUBDOMAINS } from '@/lib/reserved-subdomains'
import { requireQuota } from '@/server/services/entitlementService'
import { getPlatformFlag } from '@/server/services/platformFlagService'
import { logAudit } from '@/server/services/auditService'
import { sendEmail } from '@/server/services/emailService'
import { domainVerifiedEmail } from '@/server/email/templates'

/**
 * Custom domains, from "I own this name" to "we answer for it".
 *
 * Verification is a TXT challenge, not a "does it point at us yet" check. Those
 * are different questions and conflating them is how domain takeover happens:
 * if merely pointing a CNAME at NCOM were enough to claim a hostname, whoever
 * asked first would own it, including names they do not control. The TXT record
 * proves control of the DNS zone; the CNAME/A record makes traffic arrive. Both
 * are checked, and the TXT one is the one that grants the claim.
 *
 * DNS is read with a resolver pinned to public nameservers rather than the
 * host's. A container inheriting a split-horizon or caching resolver will happily
 * serve a stale NXDOMAIN for minutes after the tenant added the record, and the
 * resulting "I added it, it says missing" support loop is unfalsifiable from our
 * side.
 */

export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainError'
  }
}

/** The label the challenge TXT record is published at. */
export const CHALLENGE_PREFIX = '_ncom-challenge'

/**
 * Where tenants point their DNS.
 *
 * The apex A record needs a literal IP, which is deployment-specific — set
 * `DOMAIN_TARGET_IP` when the platform has a stable ingress address. Without it
 * the UI shows the CNAME target only and tells apex users to use a
 * provider-level ALIAS/ANAME, which is the correct advice anyway: an A record
 * hard-codes an address that will eventually change.
 */
export function domainTargets() {
  const root = env.ROOT_DOMAIN.split(':')[0]!
  return {
    cnameTarget: `sites.${root}`,
    aRecordIp: process.env.DOMAIN_TARGET_IP ?? null,
  }
}

const publicResolver = new Resolver()
publicResolver.setServers(['1.1.1.1', '8.8.8.8'])

/**
 * Normalises what a tenant typed into a hostname.
 *
 * People paste URLs, add trailing slashes and type capitals. Rejecting those
 * instead of cleaning them up produces a form that feels broken for no reason.
 */
export function normalizeHostname(input: string): string {
  let value = input.trim().toLowerCase()

  value = value.replace(/^https?:\/\//, '')
  value = value.replace(/\/.*$/, '')
  value = value.replace(/\.$/, '')
  value = value.replace(/^\*\./, '')

  return value
}

const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

export function assertValidHostname(hostname: string): void {
  if (!HOSTNAME_PATTERN.test(hostname)) {
    throw new DomainError(
      'That does not look like a domain name. Use something like shop.example.com.'
    )
  }

  // Our own domain is not available as a "custom" domain: a tenant claiming
  // admin.ncom.app or another tenant's subdomain would hijack platform routing,
  // which resolves subdomains before it ever looks at this table.
  const root = env.ROOT_DOMAIN.split(':')[0]!.toLowerCase()
  if (hostname === root || hostname.endsWith(`.${root}`)) {
    throw new DomainError(
      `${root} subdomains are managed by NCOM — add a domain you own instead.`
    )
  }

  const firstLabel = hostname.split('.')[0]!
  if (RESERVED_SUBDOMAINS.has(firstLabel) && hostname.split('.').length === 2) {
    throw new DomainError('That name is reserved.')
  }
}

/** Apex domains cannot hold a CNAME, so they get A-record instructions. */
export function isApex(hostname: string): boolean {
  // Two labels means apex for the common case (example.com). Multi-part public
  // suffixes (example.co.uk) are also apex but read as three labels — treated as
  // a subdomain here, which only means the tenant is offered a CNAME. That is
  // the record their registrar will accept anyway for a name they can ALIAS.
  return hostname.split('.').length === 2
}

export interface DomainView {
  id: string
  hostname: string
  storeId: string
  storeName: string
  isPrimary: boolean
  status: DomainStatus
  recordType: DomainRecordType
  verificationToken: string
  challengeHost: string
  verifiedAt: Date | null
  lastCheckedAt: Date | null
  lastError: string | null
  createdAt: Date
}

function toView(row: {
  id: string
  hostname: string
  storeId: string
  isPrimary: boolean
  status: DomainStatus
  recordType: DomainRecordType
  verificationToken: string
  verifiedAt: Date | null
  lastCheckedAt: Date | null
  lastError: string | null
  createdAt: Date
  store?: { name: string } | null
}): DomainView {
  return {
    id: row.id,
    hostname: row.hostname,
    storeId: row.storeId,
    storeName: row.store?.name ?? '',
    isPrimary: row.isPrimary,
    status: row.status,
    recordType: row.recordType,
    verificationToken: row.verificationToken,
    challengeHost: `${CHALLENGE_PREFIX}.${row.hostname}`,
    verifiedAt: row.verifiedAt,
    lastCheckedAt: row.lastCheckedAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
  }
}

export async function listDomains(
  organizationId: string,
  storeId?: string
): Promise<DomainView[]> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const rows = await prisma.customDomain.findMany({
    where: { organizationId, ...(storeId ? { storeId } : {}) },
    include: { store: { select: { name: true } } },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  })

  return rows.map(toView)
}

export async function addDomain(input: {
  organizationId: string
  storeId: string
  hostname: string
}): Promise<DomainView> {
  await requireOrgAccess(input.organizationId, 'ADMIN')

  if (!(await getPlatformFlag('domains.verificationEnabled'))) {
    throw new DomainError('Custom domains are turned off on this platform.')
  }

  const hostname = normalizeHostname(input.hostname)
  assertValidHostname(hostname)

  const store = await prisma.store.findFirst({
    where: { id: input.storeId, organizationId: input.organizationId },
    select: { id: true },
  })
  if (!store) throw new DomainError('Store not found.')

  // Plan limit. Checked here rather than in the action so every path that adds
  // a domain is covered.
  await requireQuota(input.organizationId, 'CUSTOM_DOMAINS')

  const taken = await prisma.customDomain.findUnique({ where: { hostname } })
  if (taken) {
    // Deliberately identical whether or not the other claimant is this
    // organisation: telling an outsider "another workspace has this" confirms
    // which domains are hosted here and by whom.
    throw new DomainError('That domain is already connected.')
  }

  const isFirst =
    (await prisma.customDomain.count({ where: { storeId: input.storeId } })) ===
    0

  const created = await prisma.customDomain.create({
    data: {
      organizationId: input.organizationId,
      storeId: input.storeId,
      hostname,
      recordType: isApex(hostname) ? 'A' : 'CNAME',
      // 32 hex characters: long enough that guessing it is not a strategy, short
      // enough to paste into a DNS panel without wrapping.
      verificationToken: `ncom-verify=${randomBytes(16).toString('hex')}`,
      isPrimary: isFirst,
    },
    include: { store: { select: { name: true } } },
  })

  return toView(created)
}

export interface VerificationOutcome {
  status: DomainStatus
  /** True when the TXT challenge was found. */
  ownershipProven: boolean
  /** True when traffic for the hostname will actually reach us. */
  pointsHere: boolean
  message: string
}

/**
 * Runs both DNS checks and records the result.
 *
 * Ownership and routing are reported separately so the UI can say which half is
 * missing — "we can see your TXT record but the site still points elsewhere" is
 * actionable, "verification failed" is not.
 */
export async function verifyDomain(
  organizationId: string,
  domainId: string
): Promise<VerificationOutcome> {
  await requireOrgAccess(organizationId, 'ADMIN')

  const domain = await prisma.customDomain.findFirst({
    where: { id: domainId, organizationId },
    include: { store: { select: { name: true } } },
  })
  if (!domain) throw new DomainError('Domain not found.')

  const targets = domainTargets()
  const ownershipProven = await hasChallengeRecord(
    domain.hostname,
    domain.verificationToken
  )
  const pointsHere = await pointsAtUs(domain.hostname, targets)

  const status: DomainStatus = ownershipProven ? 'VERIFIED' : 'PENDING'
  const message = ownershipProven
    ? pointsHere
      ? 'Verified and receiving traffic.'
      : `Ownership verified. Traffic is not reaching us yet — point ${domain.hostname} at ${targets.cnameTarget}.`
    : `No ${CHALLENGE_PREFIX}.${domain.hostname} TXT record found yet. DNS changes can take up to an hour to propagate.`

  const wasVerified = domain.status === 'VERIFIED'

  await prisma.customDomain.update({
    where: { id: domain.id },
    data: {
      status,
      lastCheckedAt: new Date(),
      verifiedAt: ownershipProven ? (domain.verifiedAt ?? new Date()) : null,
      lastError: ownershipProven ? null : message,
    },
  })

  if (ownershipProven && !wasVerified) {
    const owner = await prisma.membership.findFirst({
      where: { organizationId, role: 'OWNER' },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'asc' },
    })

    if (owner?.user.email) {
      const rendered = domainVerifiedEmail({
        hostname: domain.hostname,
        storeName: domain.store.name,
      })
      // Best effort: a missing notification must not fail the verification that
      // already succeeded.
      await sendEmail({
        purpose: 'DOMAIN_ALERT',
        to: owner.user.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      })
    }

    await logAudit(
      owner?.userId ?? '',
      'domain.verified',
      'CustomDomain',
      domain.id,
      { hostname: domain.hostname }
    ).catch(() => undefined)
  }

  return { status, ownershipProven, pointsHere, message }
}

async function hasChallengeRecord(
  hostname: string,
  expectedToken: string
): Promise<boolean> {
  try {
    // resolveTxt returns chunked strings per record; a long value split across
    // chunks by the DNS provider has to be rejoined before comparing.
    const records = await publicResolver.resolveTxt(
      `${CHALLENGE_PREFIX}.${hostname}`
    )
    return records.some((chunks) => chunks.join('').trim() === expectedToken)
  } catch {
    // NXDOMAIN and SERVFAIL are both "not there yet" from the tenant's point of
    // view, and neither is an error worth surfacing as a stack trace.
    return false
  }
}

async function pointsAtUs(
  hostname: string,
  targets: { cnameTarget: string; aRecordIp: string | null }
): Promise<boolean> {
  try {
    const cnames = await publicResolver.resolveCname(hostname)
    if (
      cnames.some((value) => value.replace(/\.$/, '') === targets.cnameTarget)
    ) {
      return true
    }
  } catch {
    // No CNAME is normal for an apex domain; fall through to the A check.
  }

  if (!targets.aRecordIp) return false

  try {
    const addresses = await publicResolver.resolve4(hostname)
    return addresses.includes(targets.aRecordIp)
  } catch {
    return false
  }
}

/**
 * Makes one domain the canonical name for its store.
 *
 * Only a verified domain may be primary: `buildShopDrop` reads the primary
 * hostname for canonical URLs, and pointing those at an unverified name would
 * publish links that do not resolve.
 */
export async function setPrimaryDomain(
  organizationId: string,
  domainId: string
): Promise<void> {
  await requireOrgAccess(organizationId, 'ADMIN')

  const domain = await prisma.customDomain.findFirst({
    where: { id: domainId, organizationId },
  })
  if (!domain) throw new DomainError('Domain not found.')
  if (domain.status !== 'VERIFIED') {
    throw new DomainError('Verify the domain before making it primary.')
  }

  await prisma.$transaction([
    prisma.customDomain.updateMany({
      where: { storeId: domain.storeId },
      data: { isPrimary: false },
    }),
    prisma.customDomain.update({
      where: { id: domain.id },
      data: { isPrimary: true },
    }),
  ])
}

export async function removeDomain(
  organizationId: string,
  domainId: string
): Promise<void> {
  await requireOrgAccess(organizationId, 'ADMIN')

  const domain = await prisma.customDomain.findFirst({
    where: { id: domainId, organizationId },
  })
  if (!domain) throw new DomainError('Domain not found.')

  await prisma.customDomain.delete({ where: { id: domain.id } })

  // Removing the primary leaves the store without one, so the oldest remaining
  // verified domain is promoted — otherwise canonical URLs silently fall back to
  // the subdomain while a perfectly good custom domain is still connected.
  if (domain.isPrimary) {
    const next = await prisma.customDomain.findFirst({
      where: { storeId: domain.storeId, status: 'VERIFIED' },
      orderBy: { createdAt: 'asc' },
    })
    if (next) {
      await prisma.customDomain.update({
        where: { id: next.id },
        data: { isPrimary: true },
      })
    }
  }
}

/**
 * Which store a hostname belongs to, for request routing. Verified only.
 *
 * Used by the public site resolver, so it is a single indexed lookup on a
 * unique column.
 */
export async function resolveStoreByHostname(hostname: string) {
  return prisma.customDomain.findFirst({
    where: { hostname: normalizeHostname(hostname), status: 'VERIFIED' },
    select: { store: { select: { id: true, subdomain: true } } },
  })
}

/**
 * Whether we should obtain a TLS certificate for a hostname.
 *
 * Backs the endpoint Caddy's on-demand TLS asks before it starts an ACME order,
 * and it has to say no by default. On-demand issuance means anyone who points a
 * DNS record at this server can provoke a certificate order for a name we do not
 * serve; left ungated that is both free cert issuance on our account and a fast
 * way to burn Let's Encrypt's per-week limit, after which real tenants onboarding
 * get no certificate at all.
 *
 * Answers yes for exactly the names this deployment actually answers on:
 * the platform host, the `sites.` target tenants aim a CNAME at, any additional
 * platform host, a subdomain belonging to a real store, and a custom domain that
 * has passed the TXT challenge. Note the last one is `VERIFIED` only, so a tenant
 * cannot get a certificate minted for a name they have not proved they own.
 */
export async function isCertifiableHostname(
  hostname: string
): Promise<boolean> {
  const host = normalizeHostname(hostname)
  if (!host) return false

  const root = env.ROOT_DOMAIN.split(':')[0]!.toLowerCase()

  if (host === root || host === `sites.${root}`) return true

  const platformHosts = (process.env.PLATFORM_HOSTS ?? '')
    .split(',')
    .map((entry) => normalizeHostname(entry))
    .filter(Boolean)
  if (platformHosts.includes(host)) return true

  if (host.endsWith(`.${root}`)) {
    const label = host.slice(0, -(root.length + 1))
    // Only one level deep is routed, so `a.b.root` is not a tenant and must not
    // pull a certificate.
    if (label.includes('.')) return false
    if (RESERVED_SUBDOMAINS.has(label)) return true

    const store = await prisma.store.findUnique({
      where: { subdomain: label },
      select: { id: true },
    })
    return store !== null
  }

  return (await resolveStoreByHostname(host)) !== null
}

/** Every domain on the platform, for the admin tab. */
export async function listAllDomains() {
  return prisma.customDomain.findMany({
    include: {
      store: { select: { name: true, subdomain: true } },
      organization: { select: { id: true, name: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })
}

/**
 * Force a domain's status from the admin panel.
 *
 * An escape hatch for the cases DNS checks cannot see: a tenant behind a proxy
 * that hides the CNAME, or a name whose zone we verified out of band. Recorded
 * in the audit log because it bypasses proof of ownership.
 */
export async function setDomainStatusAsAdmin(
  actorUserId: string,
  domainId: string,
  status: DomainStatus
): Promise<void> {
  await prisma.customDomain.update({
    where: { id: domainId },
    data: {
      status,
      verifiedAt: status === 'VERIFIED' ? new Date() : null,
      lastCheckedAt: new Date(),
      lastError: status === 'FAILED' ? 'Marked failed by platform admin' : null,
    },
  })

  await logAudit(
    actorUserId,
    'domain.status.forced',
    'CustomDomain',
    domainId,
    {
      status,
    }
  )
}
