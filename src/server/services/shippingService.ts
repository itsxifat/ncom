import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { encryptCredentials, maskSecret, decryptSecret } from '@/lib/crypto'
import type {
  LocationInput,
  PaymentProviderInput,
  ShippingRateInput,
  ShippingZoneInput,
  TaxRateInput,
} from '@/lib/validation/store'

/**
 * Shipping zones and rates, tax rates, locations and payment providers —
 * the organisation's fulfilment and money configuration, shared by every store.
 */

// ── Shipping ─────────────────────────────────────────────────────────────

export async function listShippingZones(organizationId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  return prisma.shippingZone.findMany({
    where: { organizationId },
    include: { rates: { orderBy: { position: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })
}

export async function createShippingZone(
  organizationId: string,
  input: ShippingZoneInput
) {
  // Two catch-all zones would make rate selection depend on row order, which
  // is not something a merchant can see or control.
  if (input.countryCodes.length === 0) {
    const existingCatchAll = await prisma.shippingZone.findFirst({
      where: { organizationId, countryCodes: { isEmpty: true } },
      select: { id: true },
    })
    if (existingCatchAll) {
      throw new Error('This store already has a rest-of-world zone')
    }
  }

  return prisma.shippingZone.create({
    data: {
      organizationId,
      name: input.name,
      countryCodes: input.countryCodes,
    },
  })
}

export async function updateShippingZone(
  organizationId: string,
  zoneId: string,
  input: ShippingZoneInput
) {
  const zone = await prisma.shippingZone.findFirst({
    where: { id: zoneId, organizationId },
    select: { id: true },
  })
  if (!zone) throw new Error('Zone not found')

  return prisma.shippingZone.update({
    where: { id: zoneId },
    data: { name: input.name, countryCodes: input.countryCodes },
  })
}

export async function deleteShippingZone(
  organizationId: string,
  zoneId: string
) {
  const zone = await prisma.shippingZone.findFirst({
    where: { id: zoneId, organizationId },
    select: { id: true },
  })
  if (!zone) throw new Error('Zone not found')

  await prisma.shippingZone.delete({ where: { id: zoneId } })
}

export async function createShippingRate(
  organizationId: string,
  zoneId: string,
  input: ShippingRateInput
) {
  const zone = await prisma.shippingZone.findFirst({
    where: { id: zoneId, organizationId },
    select: { id: true },
  })
  if (!zone) throw new Error('Zone not found')

  return prisma.shippingRate.create({
    data: {
      zoneId,
      name: input.name,
      description: input.description ?? null,
      priceCents: input.priceCents,
      minSubtotalCents: input.minSubtotalCents ?? null,
      maxSubtotalCents: input.maxSubtotalCents ?? null,
      minWeightGrams: input.minWeightGrams ?? null,
      maxWeightGrams: input.maxWeightGrams ?? null,
      position: input.position,
    },
  })
}

export async function updateShippingRate(
  organizationId: string,
  rateId: string,
  input: ShippingRateInput
) {
  const rate = await prisma.shippingRate.findFirst({
    where: { id: rateId, zone: { organizationId } },
    select: { id: true },
  })
  if (!rate) throw new Error('Rate not found')

  return prisma.shippingRate.update({
    where: { id: rateId },
    data: {
      name: input.name,
      description: input.description ?? null,
      priceCents: input.priceCents,
      minSubtotalCents: input.minSubtotalCents ?? null,
      maxSubtotalCents: input.maxSubtotalCents ?? null,
      minWeightGrams: input.minWeightGrams ?? null,
      maxWeightGrams: input.maxWeightGrams ?? null,
      position: input.position,
    },
  })
}

export async function deleteShippingRate(
  organizationId: string,
  rateId: string
) {
  const rate = await prisma.shippingRate.findFirst({
    where: { id: rateId, zone: { organizationId } },
    select: { id: true },
  })
  if (!rate) throw new Error('Rate not found')

  await prisma.shippingRate.delete({ where: { id: rateId } })
}

// ── Tax ──────────────────────────────────────────────────────────────────

export async function listTaxRates(organizationId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  return prisma.taxRate.findMany({
    where: { organizationId },
    orderBy: [{ countryCode: 'asc' }, { provinceCode: 'asc' }],
  })
}

export async function createTaxRate(
  organizationId: string,
  input: TaxRateInput
) {
  const clash = await prisma.taxRate.findFirst({
    where: {
      organizationId,
      countryCode: input.countryCode,
      provinceCode: input.provinceCode ?? null,
      taxCode: input.taxCode ?? null,
    },
    select: { id: true },
  })
  if (clash) {
    throw new Error('A rate already exists for that country and region')
  }

  return prisma.taxRate.create({
    data: {
      organizationId,
      name: input.name,
      countryCode: input.countryCode,
      provinceCode: input.provinceCode ?? null,
      rateBps: input.rateBps,
      appliesToShipping: input.appliesToShipping,
      taxCode: input.taxCode ?? null,
    },
  })
}

export async function updateTaxRate(
  organizationId: string,
  taxRateId: string,
  input: TaxRateInput
) {
  const rate = await prisma.taxRate.findFirst({
    where: { id: taxRateId, organizationId },
    select: { id: true },
  })
  if (!rate) throw new Error('Tax rate not found')

  return prisma.taxRate.update({
    where: { id: taxRateId },
    data: {
      name: input.name,
      countryCode: input.countryCode,
      provinceCode: input.provinceCode ?? null,
      rateBps: input.rateBps,
      appliesToShipping: input.appliesToShipping,
      taxCode: input.taxCode ?? null,
    },
  })
}

export async function deleteTaxRate(organizationId: string, taxRateId: string) {
  const rate = await prisma.taxRate.findFirst({
    where: { id: taxRateId, organizationId },
    select: { id: true },
  })
  if (!rate) throw new Error('Tax rate not found')

  await prisma.taxRate.delete({ where: { id: taxRateId } })
}

// ── Locations ────────────────────────────────────────────────────────────

export async function listLocations(organizationId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  return prisma.location.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
  })
}

export async function createLocation(
  organizationId: string,
  input: LocationInput
) {
  return prisma.location.create({
    data: {
      organizationId,
      name: input.name,
      isActive: input.isActive,
      fulfillsOnlineOrders: input.fulfillsOnlineOrders,
    },
  })
}

export async function deleteLocation(
  organizationId: string,
  locationId: string
) {
  const location = await prisma.location.findFirst({
    where: { id: locationId, organizationId },
    select: { id: true },
  })
  if (!location) throw new Error('Location not found')

  const remaining = await prisma.location.count({ where: { organizationId } })
  if (remaining <= 1) {
    // Deleting the last location would cascade away every InventoryLevel row,
    // silently zeroing the whole catalogue's stock.
    throw new Error('A store needs at least one location')
  }

  const stocked = await prisma.inventoryLevel.count({
    where: { locationId, available: { not: 0 } },
  })
  if (stocked > 0) {
    throw new Error(
      'This location still holds stock — move or zero it before deleting'
    )
  }

  await prisma.location.delete({ where: { id: locationId } })
}

// ── Payment providers ────────────────────────────────────────────────────

/**
 * Lists configured providers with credentials masked.
 *
 * Decrypted secrets never leave the server: the admin UI shows a masked
 * preview so a merchant can confirm *which* key is saved without the value
 * being present in the HTML payload, in the React Server Component stream, or
 * in any browser cache.
 */
export async function listPaymentProviders(organizationId: string) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const providers = await prisma.paymentProviderConfig.findMany({
    where: { organizationId },
    orderBy: { position: 'asc' },
  })

  return providers.map((provider) => ({
    id: provider.id,
    provider: provider.provider,
    displayName: provider.displayName,
    isEnabled: provider.isEnabled,
    testMode: provider.testMode,
    instructions: provider.instructions,
    position: provider.position,
    credentialPreview: maskCredentials(provider.credentials),
  }))
}

function maskCredentials(stored: unknown): Record<string, string> {
  if (!stored || typeof stored !== 'object') return {}

  return Object.fromEntries(
    Object.entries(stored as Record<string, string>).map(([key, value]) => {
      try {
        return [key, maskSecret(decryptSecret(value))]
      } catch {
        // A value that fails to decrypt was written under a different key, or
        // is corrupt. Say so rather than showing a misleading preview.
        return [key, 'unreadable — re-enter this key']
      }
    })
  )
}

export async function upsertPaymentProvider(
  organizationId: string,
  input: PaymentProviderInput
) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const store = await prisma.store.findFirst({
    where: { id: organizationId },
    select: { id: true },
  })
  if (!store) throw new Error('Store not found')

  const existing = await prisma.paymentProviderConfig.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: input.provider },
    },
    select: { id: true, credentials: true },
  })

  // An empty submitted value means "leave the saved key alone" — the form
  // never receives the real value, so it cannot echo it back.
  const submitted = Object.fromEntries(
    Object.entries(input.credentials ?? {}).filter(
      ([, value]) => value.trim().length > 0
    )
  )

  const credentials = {
    ...((existing?.credentials as Record<string, string> | null) ?? {}),
    ...encryptCredentials(submitted),
  }

  const data = {
    displayName: input.displayName,
    isEnabled: input.isEnabled,
    testMode: input.testMode,
    instructions: input.instructions ?? null,
    credentials,
  }

  if (existing) {
    return prisma.paymentProviderConfig.update({
      where: { id: existing.id },
      data,
    })
  }

  return prisma.paymentProviderConfig.create({
    data: { organizationId, provider: input.provider, ...data },
  })
}

/**
 * Server-side credential read for the checkout path. Never call this from
 * anything that renders to the client.
 */
export async function getProviderCredentials(
  organizationId: string,
  provider: PaymentProviderInput['provider']
): Promise<Record<string, string> | null> {
  const config = await prisma.paymentProviderConfig.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
    select: { credentials: true, isEnabled: true },
  })

  if (!config?.isEnabled || !config.credentials) return null

  const stored = config.credentials as Record<string, string>
  return Object.fromEntries(
    Object.entries(stored).map(([key, value]) => [key, decryptSecret(value)])
  )
}
