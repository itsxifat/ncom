import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { orderLineImageUrl, ORDER_LINE_IMAGE_SELECT } from './orderService'

/**
 * What goes on a parcel sticker and an invoice.
 *
 * Read in one query for a whole print run: a merchant prints the morning's
 * orders in one go, and forty round trips to build forty stickers is forty
 * chances for the page to time out halfway through a print job someone is
 * standing at a printer waiting for.
 *
 * Nothing here is recomputed. The totals, the line prices and the address are
 * read exactly as the order recorded them, because a sticker is a document a
 * customer will hold against what they were charged.
 */

interface AddressShape {
  firstName?: string
  lastName?: string
  company?: string
  address1?: string
  address2?: string
  city?: string
  provinceCode?: string
  postalCode?: string
  countryCode?: string
  phone?: string
}

export interface OrderLabel {
  id: string
  orderNumber: string
  createdAt: Date
  currencyCode: string
  storeName: string
  /** Who it goes to, already flattened out of the address JSON. */
  recipient: {
    name: string
    phone: string | null
    lines: string[]
  }
  /**
   * What the rider collects at the door. Zero on an order that was already
   * paid, which has to read differently on the sticker — a courier who sees an
   * amount collects it.
   */
  codCents: number
  subtotalCents: number
  discountCents: number
  shippingCents: number
  taxCents: number
  totalCents: number
  paidCents: number
  discountCode: string | null
  shippingMethodTitle: string | null
  note: string | null
  /** The courier's own reference, once a parcel exists. */
  consignmentId: string | null
  courier: string | null
  items: {
    id: string
    title: string
    variantTitle: string | null
    sku: string | null
    quantity: number
    unitPriceCents: number
    totalCents: number
    imageUrl: string | null
  }[]
}

function readAddress(value: unknown): AddressShape {
  return value && typeof value === 'object' ? (value as AddressShape) : {}
}

export async function getOrdersForLabels(
  organizationId: string,
  orderIds: string[]
): Promise<OrderLabel[]> {
  await requireOrgAccess(organizationId, 'VIEWER')

  if (orderIds.length === 0) return []

  const orders = await prisma.order.findMany({
    // Scoped by organisation as well as by id: the ids arrive in a query
    // string, and a print page that rendered whatever id it was handed would
    // print another tenant's customer addresses.
    where: { id: { in: orderIds }, organizationId },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      currencyCode: true,
      email: true,
      phone: true,
      shippingAddress: true,
      subtotalCents: true,
      discountTotalCents: true,
      shippingTotalCents: true,
      taxTotalCents: true,
      totalCents: true,
      paidTotalCents: true,
      discountCode: true,
      shippingMethodTitle: true,
      note: true,
      organization: { select: { name: true } },
      store: { select: { name: true } },
      shipments: {
        where: { consignmentId: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { consignmentId: true, provider: true },
      },
      lines: {
        select: {
          id: true,
          title: true,
          variantTitle: true,
          sku: true,
          quantity: true,
          unitPriceCents: true,
          totalCents: true,
          ...ORDER_LINE_IMAGE_SELECT,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return orders.map((order) => {
    const address = readAddress(order.shippingAddress)
    const shipment = order.shipments[0] ?? null

    const name =
      [address.firstName, address.lastName].filter(Boolean).join(' ').trim() ||
      order.email ||
      'Customer'

    const lines = [
      address.company,
      address.address1,
      address.address2,
      [address.city, address.provinceCode, address.postalCode]
        .filter(Boolean)
        .join(' ')
        .trim(),
      address.countryCode,
    ].filter((line): line is string => Boolean(line && line.trim()))

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      currencyCode: order.currencyCode,
      // The store the order came through, falling back to the workspace when
      // the storefront has since been deleted — the parcel still has to say
      // who is sending it.
      storeName: order.store?.name ?? order.organization.name,
      recipient: {
        name,
        phone: order.phone ?? address.phone ?? null,
        lines,
      },
      codCents: Math.max(0, order.totalCents - order.paidTotalCents),
      subtotalCents: order.subtotalCents,
      discountCents: order.discountTotalCents,
      shippingCents: order.shippingTotalCents,
      taxCents: order.taxTotalCents,
      totalCents: order.totalCents,
      paidCents: order.paidTotalCents,
      discountCode: order.discountCode,
      shippingMethodTitle: order.shippingMethodTitle,
      note: order.note,
      consignmentId: shipment?.consignmentId ?? null,
      courier: shipment
        ? shipment.provider === 'STEADFAST'
          ? 'Steadfast'
          : 'Pathao'
        : null,
      items: order.lines.map((line) => ({
        id: line.id,
        title: line.title,
        variantTitle: line.variantTitle,
        sku: line.sku,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        totalCents: line.totalCents,
        imageUrl: orderLineImageUrl(line),
      })),
    }
  })
}

/**
 * Finds an order by the number under a barcode.
 *
 * Scanners emit exactly what is encoded, which is the courier-safe form —
 * `1001` for an order the merchant knows as `#1001` — so both spellings are
 * tried. A consignment id is tried too, because the other barcode on a parcel
 * in this market is the courier's own sticker, and a packer holding a gun
 * should not have to know whose label they just scanned.
 */
export async function findOrderByScan(
  organizationId: string,
  code: string,
  options: { storeId?: string } = {}
): Promise<{
  id: string
  orderNumber: string
  storeName: string | null
} | null> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const raw = code.trim()
  if (!raw) return null

  const bare = raw.replace(/^#/, '')

  const order = await prisma.order.findFirst({
    where: {
      organizationId,
      ...(options.storeId ? { storeId: options.storeId } : {}),
      OR: [
        { orderNumber: { in: [raw, bare, `#${bare}`] } },
        { shipments: { some: { consignmentId: raw } } },
        { shipments: { some: { trackingCode: raw } } },
      ],
    },
    select: {
      id: true,
      orderNumber: true,
      store: { select: { name: true } },
    },
  })
  if (!order) return null

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    storeName: order.store?.name ?? null,
  }
}
