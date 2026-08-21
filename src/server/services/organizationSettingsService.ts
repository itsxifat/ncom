import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import {
  parseStatusColors,
  type StatusColorMap,
} from '@/lib/order-status-colors'

/**
 * Organisation-wide commerce settings.
 *
 * Currency, weight unit and tax behaviour belong to the business, not to any
 * one of its websites: a merchant running three landing pages off one catalogue
 * prices in one currency. Provisioned with the organisation, so nothing here
 * has to cope with a missing settings row.
 */

export async function getOrganizationSettings(organizationId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  return prisma.organizationSettings.findFirst({
    where: { organizationId },
  })
}

export async function updateOrganizationSettings(
  organizationId: string,
  input: {
    currencyCode?: string
    weightUnit?: 'GRAM' | 'KILOGRAM' | 'OUNCE' | 'POUND'
    pricesIncludeTax?: boolean
    customerAccountsEnabled?: boolean
    requiresCustomerAccount?: boolean
    allowOutOfStockPurchase?: boolean
    orderNumberPrefix?: string
    supportEmail?: string | null
    supportPhone?: string | null
    businessName?: string | null
  }
) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const settings = await prisma.organizationSettings.findFirst({
    where: { organizationId },
    select: { id: true, currencyCode: true, pricesIncludeTax: true },
  })
  if (!settings) throw new Error('This store is not a store')

  const orderCount = await prisma.order.count({ where: { organizationId } })

  // Currency and tax-inclusivity are baked into every order already written.
  // Changing them retroactively would reinterpret historical amounts — a
  // $10.00 order silently becoming €10.00 — so they lock once a store has
  // sold anything.
  if (orderCount > 0) {
    if (input.currencyCode && input.currencyCode !== settings.currencyCode) {
      throw new Error('Currency cannot be changed once the store has orders')
    }
    if (
      input.pricesIncludeTax !== undefined &&
      input.pricesIncludeTax !== settings.pricesIncludeTax
    ) {
      throw new Error(
        'Tax-inclusive pricing cannot be changed once the store has orders'
      )
    }
  }

  return prisma.organizationSettings.update({
    where: { id: settings.id },
    data: {
      ...input,
      // Records that someone actually chose, as distinct from the row still
      // carrying its default. Prices are stored as bare minor units, so a
      // merchant pushing taka into a workspace left on USD imports ৳1,290 as
      // $1,290.00 with every call reporting success — and nothing in the
      // numbers afterwards can tell that happened. This flag is what lets the
      // import endpoint warn while it still matters.
      ...(input.currencyCode ? { currencyConfiguredAt: new Date() } : {}),
    },
  })
}

/**
 * How this workspace wants its order rows coloured.
 *
 * VIEWER, not ADMIN: this is a reading aid on a list everyone in the workspace
 * looks at, and a packer whose rows are the wrong colour is a packer who ships
 * the wrong parcel. Writing it is a separate, higher bar below.
 *
 * Anything unrecognised in the column is dropped rather than thrown on — see
 * parseStatusColors. A bad value must not be able to blank the order list.
 */
export async function getOrderStatusColors(
  organizationId: string
): Promise<StatusColorMap> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: { orderStatusColors: true },
  })

  return parseStatusColors(settings?.orderStatusColors)
}

/**
 * Saves the colour map.
 *
 * The whole map is written each time rather than merged: the editor shows every
 * status at once, so what it posts *is* the intended state, and a merge would
 * make "set this one back to the default" impossible to express.
 *
 * EDITOR rather than ADMIN — it changes nothing about what the business sells
 * or charges, and putting a display preference behind an owner login means the
 * people who actually read the list all day cannot fix it.
 */
export async function setOrderStatusColors(
  organizationId: string,
  colors: StatusColorMap
) {
  await requireOrgAccess(organizationId, 'EDITOR')

  // Upserted rather than updated. Not every organisation has a settings row —
  // the column has always been read with a `?? default` behind it, so nothing
  // noticed — and a display preference must not be the thing that discovers
  // it. `organizationId` is unique, so this is the row or nothing.
  //
  // Re-parsed on the way in as well as on the way out: this arrives from a
  // server action, which is a public endpoint like any other.
  const orderStatusColors = parseStatusColors(colors)

  return prisma.organizationSettings.upsert({
    where: { organizationId },
    update: { orderStatusColors },
    create: { organizationId, orderStatusColors },
  })
}

/**
 * The workspace's money and weight conventions, for callers that have to agree
 * with them before writing prices.
 */
export async function getCurrencyContext(organizationId: string) {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: {
      currencyCode: true,
      weightUnit: true,
      currencyConfiguredAt: true,
    },
  })

  return {
    currencyCode: settings?.currencyCode ?? 'USD',
    weightUnit: settings?.weightUnit ?? 'KILOGRAM',
    /** False while the workspace is still on the default nobody picked. */
    currencyConfigured:
      settings?.currencyConfiguredAt !== null &&
      settings?.currencyConfiguredAt !== undefined,
  }
}

/**
 * Headline numbers for the store overview.
 *
 * Revenue counts captured money (`paidTotalCents`) minus refunds rather than
 * order totals: an unpaid COD order is not revenue, and counting it would make
 * the dashboard disagree with the merchant's bank account. Cancelled orders
 * are excluded from the order count for the same reason.
 */
export async function getStoreOverview(organizationId: string) {
  await requireOrgAccess(organizationId, 'VIEWER')

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [
    revenue,
    orderCount,
    productCount,
    customerCount,
    lowStock,
    recentOrders,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: { organizationId, cancelledAt: null },
      _sum: { paidTotalCents: true, refundedTotalCents: true },
    }),
    prisma.order.count({
      where: {
        organizationId,
        cancelledAt: null,
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.product.count({ where: { organizationId, status: 'ACTIVE' } }),
    prisma.customer.count({ where: { organizationId } }),
    prisma.inventoryLevel.count({
      where: {
        available: { lte: 5 },
        variant: { inventoryTracked: true, product: { organizationId } },
      },
    }),
    prisma.order.findMany({
      where: { organizationId },
      select: {
        id: true,
        orderNumber: true,
        email: true,
        totalCents: true,
        currencyCode: true,
        financialStatus: true,
        workflowState: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ])

  const unfulfilled = await prisma.order.count({
    where: {
      organizationId,
      cancelledAt: null,
      // "Not yet with a courier" is the modern reading of unfulfilled: the
      // merchant still has these parcels in the building.
      workflowState: { in: ['PENDING', 'FRAUD_REVIEW', 'PROCESSING'] },
    },
  })

  return {
    netRevenueCents:
      (revenue._sum.paidTotalCents ?? 0) -
      (revenue._sum.refundedTotalCents ?? 0),
    orderCount,
    productCount,
    customerCount,
    lowStock,
    unfulfilled,
    recentOrders,
  }
}
