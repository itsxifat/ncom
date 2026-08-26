import 'server-only'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { BCRYPT_COST, DUMMY_BCRYPT_HASH } from '@/lib/security'
import type { CustomerAddressInput } from '@/lib/validation/address'

/**
 * Storefront customers.
 *
 * These are NOT platform Users. A shopper who buys from a tenant's store has
 * no account on NCOM, never appears in an organization's member list, and
 * authenticates against a completely separate session table. Merging the two
 * would mean a storefront login attempt could reach a merchant's dashboard
 * credentials, so the separation is a security boundary, not an organisational
 * preference.
 *
 * Customer sessions use opaque random tokens stored as SHA-256 hashes. The
 * plaintext token exists only in the shopper's cookie: a leaked database
 * cannot be replayed as a live session. bcrypt would be wrong here — these are
 * high-entropy random values, not user-chosen passwords, so there is nothing
 * for a slow hash to protect against, and login would pay bcrypt's cost on
 * every authenticated request.
 */

const SESSION_TTL_DAYS = 30

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// ── Storefront authentication ────────────────────────────────────────────

export async function registerCustomer(
  organizationId: string,
  input: {
    email: string
    password: string
    firstName?: string
    lastName?: string
    acceptsMarketing?: boolean
  }
): Promise<{ customerId: string; token: string }> {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: { customerAccountsEnabled: true },
  })
  if (settings && !settings.customerAccountsEnabled) {
    throw new Error('This store does not offer customer accounts')
  }

  const existing = await prisma.customer.findUnique({
    where: { organizationId_email: { organizationId, email: input.email } },
    select: { id: true, passwordHash: true },
  })

  // A guest checkout already created a passwordless Customer row for this
  // email; registering claims that row so the buyer keeps their order history
  // instead of starting a second, disconnected account.
  if (existing?.passwordHash) {
    throw new Error('An account with that email already exists')
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST)

  const customer = existing
    ? await prisma.customer.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          firstName: input.firstName ?? undefined,
          lastName: input.lastName ?? undefined,
          acceptsMarketing: input.acceptsMarketing ?? false,
          marketingOptInAt: input.acceptsMarketing ? new Date() : null,
        },
        select: { id: true },
      })
    : await prisma.customer.create({
        data: {
          organizationId,
          email: input.email,
          passwordHash,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          acceptsMarketing: input.acceptsMarketing ?? false,
          marketingOptInAt: input.acceptsMarketing ? new Date() : null,
        },
        select: { id: true },
      })

  const token = await createCustomerSession(customer.id)
  return { customerId: customer.id, token }
}

export async function authenticateCustomer(
  organizationId: string,
  email: string,
  password: string
): Promise<{ customerId: string; token: string }> {
  const customer = await prisma.customer.findUnique({
    where: { organizationId_email: { organizationId, email } },
    select: { id: true, passwordHash: true },
  })

  // Compare against a dummy hash when the account is absent or passwordless so
  // the response takes the same time either way — otherwise the timing
  // difference enumerates which emails have accounts at this store.
  const hash = customer?.passwordHash ?? DUMMY_BCRYPT_HASH
  const matches = await bcrypt.compare(password, hash)

  if (!customer?.passwordHash || !matches) {
    throw new Error('Incorrect email or password')
  }

  const token = await createCustomerSession(customer.id)
  return { customerId: customer.id, token }
}

async function createCustomerSession(customerId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')

  await prisma.customerSession.create({
    data: {
      customerId,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  })

  return token
}

/**
 * Resolves a session cookie to a customer, scoped to the store it was issued
 * for. The organizationId check stops a session from one tenant's storefront being
 * replayed against another's.
 */
export async function getCustomerBySession(
  organizationId: string,
  token: string | null
) {
  if (!token) return null

  const session = await prisma.customerSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      customer: {
        include: {
          addresses: true,
        },
      },
    },
  })

  if (!session) return null
  if (session.customer.organizationId !== organizationId) return null

  if (session.expiresAt < new Date()) {
    await prisma.customerSession.delete({ where: { id: session.id } })
    return null
  }

  return session.customer
}

export async function logoutCustomer(token: string) {
  await prisma.customerSession
    .delete({ where: { tokenHash: hashSessionToken(token) } })
    .catch(() => {
      // Already gone — logging out twice is not an error worth surfacing.
    })
}

/**
 * Constant-time comparison for any storefront token check that isn't a session
 * lookup (order status links, for instance), where the value is compared
 * directly rather than used as a unique key.
 */
export function tokensMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  if (bufferA.length !== bufferB.length) return false
  return timingSafeEqual(bufferA, bufferB)
}

// ── Address book ─────────────────────────────────────────────────────────

export async function addCustomerAddress(
  customerId: string,
  input: CustomerAddressInput
) {
  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.customerAddress.updateMany({
        where: { customerId },
        data: { isDefault: false },
      })
    }

    const count = await tx.customerAddress.count({ where: { customerId } })

    return tx.customerAddress.create({
      data: {
        customerId,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        company: input.company ?? null,
        address1: input.address1,
        address2: input.address2 ?? null,
        city: input.city,
        provinceCode: input.provinceCode ?? null,
        countryCode: input.countryCode,
        postalCode: input.postalCode ?? null,
        phone: input.phone ?? null,
        // The first address a customer saves becomes their default whether or
        // not they ticked the box — otherwise checkout has nothing to prefill.
        isDefault: input.isDefault || count === 0,
      },
    })
  })
}

export async function deleteCustomerAddress(
  customerId: string,
  addressId: string
) {
  const address = await prisma.customerAddress.findFirst({
    where: { id: addressId, customerId },
    select: { id: true },
  })
  if (!address) throw new Error('Address not found')

  await prisma.customerAddress.delete({ where: { id: addressId } })
}

// ── Merchant-facing ──────────────────────────────────────────────────────

export async function listCustomers(
  organizationId: string,
  options: { search?: string; take?: number; skip?: number } = {}
) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const where = {
    organizationId,
    ...(options.search
      ? {
          OR: [
            {
              email: { contains: options.search, mode: 'insensitive' as const },
            },
            {
              firstName: {
                contains: options.search,
                mode: 'insensitive' as const,
              },
            },
            {
              lastName: {
                contains: options.search,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {}),
  }

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      // passwordHash is never selected into anything a route can return.
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        ordersCount: true,
        totalSpentCents: true,
        acceptsMarketing: true,
        tags: true,
        lastOrderAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: options.take ?? 50,
      skip: options.skip ?? 0,
    }),
    prisma.customer.count({ where }),
  ])

  return { items, total }
}

export async function getCustomerForMerchant(
  organizationId: string,
  customerId: string
) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      note: true,
      tags: true,
      ordersCount: true,
      totalSpentCents: true,
      acceptsMarketing: true,
      lastOrderAt: true,
      createdAt: true,
      addresses: true,
      orders: {
        select: {
          id: true,
          orderNumber: true,
          totalCents: true,
          currencyCode: true,
          financialStatus: true,
          workflowState: true,
          workflowUpdatedAt: true,
          cancelledAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  })

  if (!customer) throw new Error('Customer not found')
  return customer
}
