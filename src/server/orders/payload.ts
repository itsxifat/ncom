import 'server-only'
import { prisma } from '@/server/db/client'
import { env } from '@/lib/env'
import type {
  HandoffAddress,
  HandoffEnvelope,
  HandoffLine,
  HandoffLineSource,
  HandoffOrder,
} from './types'

/**
 * Turns a placed order into the body sent to the merchant's website.
 *
 * Everything the receiver could reasonably need, resolved once, here. The
 * alternative — send ids and let them call back for the rest — was rejected on
 * two grounds: it makes a working integration depend on a second round of
 * credentials and endpoints, and it means an order that arrives during a NCOM
 * outage is undeliverable rather than merely delayed. The payload is a complete
 * record on its own, which is also what lets it be stored verbatim as the
 * receipt of what was sent.
 *
 * Three things this function is careful about, because each has a way of being
 * quietly wrong:
 *
 *   **Whose product is it.** A cart can hold goods from both catalogues, and
 *   the ids of one mean nothing to the other. Which is which is decided by
 *   asking our own tables — not by guessing from the shape of an id — and
 *   reported per line as `source`.
 *
 *   **The picture.** A merchant's admin shows the photo to whoever is packing
 *   the parcel, so a line with a broken image is a line that gets mis-picked.
 *   Every URL is made absolute before it leaves, whichever of the three places
 *   it came from.
 *
 *   **The money.** Copied from the order exactly as recorded, never recomputed.
 *   The order is the authority for what the customer was charged, and a second
 *   arithmetic path is a second answer waiting to disagree with the first.
 */

/** The order shape this module reads. Selected once, in `loadOrderForHandoff`. */
const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  organizationId: true,
  createdAt: true,
  currencyCode: true,
  email: true,
  phone: true,
  subtotalCents: true,
  discountTotalCents: true,
  shippingTotalCents: true,
  taxTotalCents: true,
  totalCents: true,
  discountCode: true,
  couponDiscountCents: true,
  shippingMethodTitle: true,
  shippingAddress: true,
  billingAddress: true,
  note: true,
  offerKey: true,
  offerLabel: true,
  offerPriceCents: true,
  offerRegularCents: true,
  store: {
    select: {
      id: true,
      name: true,
      subdomain: true,
      customDomains: {
        where: { status: 'VERIFIED' as const },
        orderBy: [
          { isPrimary: 'desc' as const },
          { createdAt: 'asc' as const },
        ],
        take: 1,
        select: { hostname: true },
      },
    },
  },
  page: { select: { id: true, title: true, slug: true, isHome: true } },
  lines: {
    orderBy: { id: 'asc' as const },
    select: {
      productId: true,
      variantId: true,
      title: true,
      variantTitle: true,
      sku: true,
      vendor: true,
      imageUrl: true,
      quantity: true,
      unitPriceCents: true,
      totalDiscountCents: true,
      taxTotalCents: true,
      totalCents: true,
      requiresShipping: true,
      weightGrams: true,
      isGift: true,
    },
  },
}

export async function buildHandoffEnvelope(
  organizationId: string,
  orderId: string
): Promise<HandoffEnvelope | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: ORDER_SELECT,
  })
  if (!order) return null

  const origin = storefrontOrigin(order.store)
  const sources = await lineSources(order.lines)

  const shippingAddress = readAddress(order.shippingAddress)
  const billingAddress = readOptionalAddress(order.billingAddress)

  const handoff: HandoffOrder = {
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt.toISOString(),
    currencyCode: order.currencyCode,

    // The name is only ever on the address — a cash-on-delivery form asks for
    // one name and that is where it is written — so it is read back out rather
    // than left null for want of a column of its own.
    customer: {
      name: shippingAddress.name,
      phone: order.phone ?? shippingAddress.phone,
      email: order.email ?? shippingAddress.email,
    },
    shippingAddress,
    // Only when it is genuinely a different address. Echoing the shipping one
    // back under a second name invites a receiver to render two identical
    // blocks and wonder which is real, and an object of nothing but nulls is
    // worse still — it reads as "there is a billing address" to any receiver
    // that checks for presence rather than for content.
    billingAddress:
      billingAddress && !sameAddress(shippingAddress, billingAddress)
        ? billingAddress
        : null,

    lines: order.lines.map((line) =>
      toHandoffLine(line, sources.get(line.variantId ?? '') ?? 'ncom', origin)
    ),

    subtotalCents: order.subtotalCents,
    discountTotalCents: order.discountTotalCents,
    shippingTotalCents: order.shippingTotalCents,
    taxTotalCents: order.taxTotalCents,
    totalCents: order.totalCents,

    discountCode: order.discountCode,
    couponDiscountCents: order.couponDiscountCents,

    shippingMethodTitle: order.shippingMethodTitle,
    paymentMethod: 'cash_on_delivery',
    status: 'pending',

    note: order.note,

    campaign: {
      pageId: order.page?.id ?? null,
      pageTitle: order.page?.title ?? null,
      pageUrl: pageUrl(origin, order.page),
      offerKey: order.offerKey,
      offerLabel: order.offerLabel,
      offerPriceCents: order.offerPriceCents,
      offerRegularCents: order.offerRegularCents,
    },
    store: {
      id: order.store?.id ?? null,
      name: order.store?.name ?? null,
      subdomain: order.store?.subdomain ?? null,
      url: origin,
    },
  }

  return {
    version: 1,
    topic: 'order.placed',
    idempotencyKey: order.id,
    sentAt: new Date().toISOString(),
    organizationId,
    order: handoff,
  }
}

/** One order line, as `ORDER_SELECT` reads it. */
interface OrderLineRow {
  productId: string | null
  variantId: string | null
  title: string
  variantTitle: string | null
  sku: string | null
  vendor: string | null
  imageUrl: string | null
  quantity: number
  unitPriceCents: number
  totalDiscountCents: number
  taxTotalCents: number
  totalCents: number
  requiresShipping: boolean
  weightGrams: number
  isGift: boolean
}

function toHandoffLine(
  line: OrderLineRow,
  source: HandoffLineSource,
  origin: string | null
): HandoffLine {
  return {
    productId: line.productId,
    variantId: line.variantId,
    source,
    title: line.title,
    variantTitle: line.variantTitle,
    sku: line.sku,
    vendor: line.vendor,
    imageUrl: absoluteImageUrl(line.imageUrl, origin),
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    discountCents: line.totalDiscountCents,
    taxCents: line.taxTotalCents,
    totalCents: line.totalCents,
    requiresShipping: line.requiresShipping,
    weightGrams: line.weightGrams,
    isGift: line.isGift,
  }
}

/**
 * Which catalogue each line's variant came from, asked of our own tables.
 *
 * A variant we have a row for is ours; anything else was read from the
 * merchant's website — or, for an order old enough that the product has since
 * been deleted here, was ours and is gone. Both of those are reported as
 * `ncom`, which is the safe direction: the receiver is told "these ids are not
 * yours", and the worst case is that they file a line descriptively that they
 * could in principle have joined.
 *
 * Deliberately not inferred from the shape of the id. NCOM mints cuids and
 * Mongo-backed shops hand out 24-hex ObjectIds, so a regex looks like it works
 * — right up to the first merchant running Postgres with integer ids.
 */
async function lineSources(
  lines: { variantId: string | null }[]
): Promise<Map<string, HandoffLineSource>> {
  const ids = [
    ...new Set(lines.map((line) => line.variantId).filter((id) => id !== null)),
  ]
  if (ids.length === 0) return new Map()

  const ours = await prisma.productVariant.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  })
  const ourIds = new Set(ours.map((variant) => variant.id))

  return new Map(
    ids.map((id) => [id, ourIds.has(id) ? 'ncom' : ('website' as const)])
  )
}

/**
 * An image URL the receiver's own browser can load.
 *
 * Three kinds arrive here and only one of them is already fit to send:
 *
 *   * a merchant's own website returns absolute https URLs — its connector is
 *     required to, and Elysium's for one resolves them before answering;
 *   * NCOM's own products carry EnCDN URLs, which are absolute;
 *   * anything pasted by hand into a product or a block can be neither — a
 *     site-relative `/uploads/shirt.jpg`, or a protocol-relative `//host/x.jpg`.
 *
 * The last kind is the whole reason this function exists. A relative URL is
 * perfectly correct on the storefront that produced it and completely broken
 * the moment it is rendered inside somebody else's admin panel, and it fails
 * silently — as an empty box next to a line a packer is meant to pick.
 *
 * Anything that cannot be made absolute is sent as null rather than as a string
 * that will not load. A receiver can render a placeholder for null; it cannot
 * do anything sensible with a 404.
 */
export function absoluteImageUrl(
  raw: string | null | undefined,
  origin: string | null
): string | null {
  const value = raw?.trim()
  if (!value) return null

  // `//cdn.example.com/x.jpg` — legal in a browser, meaningless to a server
  // that has no scheme of its own to inherit.
  if (value.startsWith('//')) return `https:${value}`

  if (/^https?:\/\//i.test(value)) return value

  // Anything else is only resolvable against the storefront it was written for.
  if (value.startsWith('/') && origin) return `${origin}${value}`

  // A bare filename, a data: URI, a blob: — nothing a receiver can fetch.
  return null
}

/** The public origin of the storefront an order came through. */
function storefrontOrigin(
  store: {
    subdomain: string
    customDomains: { hostname: string }[]
  } | null
): string | null {
  if (!store) return null

  // A verified custom domain is where the buyer actually was, so it is what a
  // link in the merchant's admin should open. The subdomain always works and is
  // the fallback rather than the answer.
  const host =
    store.customDomains[0]?.hostname ?? `${store.subdomain}.${env.ROOT_DOMAIN}`

  const scheme = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  return `${scheme}://${host}`
}

function pageUrl(
  origin: string | null,
  page: { slug: string; isHome: boolean } | null
): string | null {
  if (!origin || !page) return null
  return page.isHome ? `${origin}/` : `${origin}/${page.slug}`
}

/**
 * Reads the address JSON an order was placed with.
 *
 * Tolerant on the way in, exact on the way out. Addresses are written by the
 * order form, by the cart, and by whatever a merchant posts at the public
 * endpoint by hand, so the field names vary — `address1` and `street` and
 * `line1` are all the same thing to a courier. Every one is normalised to the
 * single shape the contract documents, so a receiver never has to guess.
 */
function readAddress(value: unknown): HandoffAddress {
  const raw = (value ?? {}) as Record<string, unknown>

  const first = str(raw.firstName)
  const last = str(raw.lastName)
  const joined = [first, last].filter(Boolean).join(' ').trim()

  return {
    name: str(raw.name) ?? (joined === '' ? null : joined),
    phone: str(raw.phone),
    email: str(raw.email),
    address1: str(raw.address1) ?? str(raw.street) ?? str(raw.line1),
    address2: str(raw.address2) ?? str(raw.line2),
    city: str(raw.city),
    province: str(raw.province) ?? str(raw.state) ?? str(raw.zone),
    postalCode: str(raw.postalCode) ?? str(raw.zip) ?? str(raw.postcode),
    countryCode: str(raw.countryCode) ?? str(raw.country),
  }
}

/**
 * The same, but null when there is nothing there.
 *
 * A cash-on-delivery order usually has no billing address at all, and an order
 * whose JSON is `{}` or missing must produce `null` rather than an address
 * object whose every field is null — see the note at the call site.
 */
function readOptionalAddress(value: unknown): HandoffAddress | null {
  if (!value || typeof value !== 'object') return null
  const address = readAddress(value)
  const empty = Object.values(address).every((field) => field === null)
  return empty ? null : address
}

function str(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function sameAddress(a: HandoffAddress, b: HandoffAddress): boolean {
  return (Object.keys(a) as (keyof HandoffAddress)[]).every(
    (key) => a[key] === b[key]
  )
}
