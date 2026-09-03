import 'server-only'
import { prisma } from '@/server/db/client'
import { priceCartById } from './pricingService'
import { commitInventoryForOrder } from './inventoryService'
import { emitOrderWebhook } from './orderService'
import { verifyPayment } from './paymentService'
import { scheduleCourierEvaluation } from './courierService'
import type { PlaceOrderInput } from '@/lib/validation/cart'
import type { TaxLine } from '@/lib/pricing'
import type { Prisma } from '@/generated/prisma/client'
import type { PaymentProvider } from '@/generated/prisma/enums'

/**
 * Turns a cart into an order.
 *
 * This is the one place in the system where money, stock and a customer
 * promise all change together, so the whole thing runs in a single database
 * transaction. If any step fails — stock ran out, the discount hit its cap,
 * the order number collided — everything rolls back and the shopper still has
 * their cart.
 *
 * Three properties this function has to guarantee:
 *
 *   Idempotency.   A double-clicked pay button, a retried request, a webhook
 *                  arriving twice: all must produce one order. Cart.completedAt
 *                  plus the unique constraint on Order.cartId enforce that at
 *                  the database level, not with an in-memory lock that a second
 *                  server process would not see.
 *
 *   Authority.     Totals are recomputed here from the stored cart. Nothing
 *                  the client submitted about price, discount or shipping cost
 *                  is trusted, including values this same server sent it a
 *                  moment ago.
 *
 *   Atomic stock.  Inventory is decremented with a conditional update inside
 *                  this transaction, so two concurrent checkouts for the last
 *                  unit cannot both succeed.
 */

export interface PlaceOrderResult {
  orderId: string
  orderNumber: string
  totalCents: number
  currencyCode: string
}

/**
 * A landing page's own economics, layered over the organisation's.
 *
 * A campaign page sells at a negotiated bundle price with its own delivery
 * charge, neither of which the cart pricing engine knows about — it prices a
 * cart of variants against the business's discounts, zones and taxes. Rather
 * than teach that engine about offers, the offer path computes its own numbers
 * (see offerService, which is the authority for them) and hands them in here.
 *
 * The order still records honest line prices. The campaign saving is carried as
 * a discount, not by quietly writing down the goods, so the merchant's reports
 * show what the products list for and what the campaign cost them.
 */
export interface CampaignContext {
  /** Which landing page and which offer sold this. Copied onto the order. */
  pageId: string | null
  offerKey: string
  offerLabel: string
  /** What the offer charged for goods, and what those goods list for. */
  offerPriceCents: number
  offerRegularCents: number

  /** Delivery for this page, replacing whatever the org zones would charge. */
  shippingCents: number
  shippingTitle: string | null

  /** The offer saving plus any page promotion, already computed and capped. */
  discountCents: number
  /** Names the winning promotion for the order record. */
  discountLabel: string | null
  /** The code the buyer typed, once the server has agreed it applies. */
  discountCode?: string | null
  /** What that code alone was worth, of the `discountCents` above. */
  couponDiscountCents?: number
  /**
   * Variants the campaign is giving away, and how many of each.
   *
   * The units are in the cart like any other, so they are picked and their
   * stock moves; this only marks the resulting lines as gifts so the order
   * reads "Gift" rather than showing a price the customer is not paying. The
   * money is already inside `discountCents`.
   */
  giftVariants?: Map<string, number>
}

export async function placeOrder(
  organizationId: string,
  input: PlaceOrderInput,
  campaign?: CampaignContext
): Promise<PlaceOrderResult> {
  const cart = await prisma.cart.findFirst({
    where: { token: input.cartToken, organizationId },
    include: {
      lines: {
        include: {
          variant: {
            include: {
              product: { select: { id: true, title: true, vendor: true } },
            },
          },
        },
      },
      order: {
        select: {
          id: true,
          orderNumber: true,
          totalCents: true,
          currencyCode: true,
        },
      },
    },
  })

  if (!cart) throw new Error('Cart not found')

  // Idempotent replay: a cart that already converted returns its order rather
  // than erroring, so a retried request is indistinguishable from the first.
  if (cart.completedAt && cart.order) {
    return {
      orderId: cart.order.id,
      orderNumber: cart.order.orderNumber,
      totalCents: cart.order.totalCents,
      currencyCode: cart.order.currencyCode,
    }
  }

  if (cart.lines.length === 0) throw new Error('Your cart is empty')

  // One contact method, not specifically an email. A cash-on-delivery order is
  // confirmed by a phone call, and requiring an address the buyer does not
  // have is how a COD storefront loses the sale. The phone may arrive on the
  // cart itself or on the shipping address the buyer filled in.
  const shippingPhone =
    typeof cart.shippingAddress === 'object' &&
    cart.shippingAddress !== null &&
    'phone' in cart.shippingAddress &&
    typeof cart.shippingAddress.phone === 'string'
      ? cart.shippingAddress.phone
      : null

  const contactPhone = cart.phone ?? shippingPhone
  if (!cart.email && !contactPhone) {
    throw new Error('An email address or phone number is required')
  }

  const pricing = await priceCartById(cart.id)

  // A campaign page carries its own delivery rules, so the organisation having
  // no zone covering this address is not a reason to refuse the order.
  if (pricing.shippingUnavailable && !campaign) {
    throw new Error('We do not ship to that address')
  }

  // The money actually recorded. Without a campaign these are the pricing
  // engine's own figures untouched; with one, delivery and the campaign saving
  // replace their cart-level equivalents while the line prices stay honest.
  //
  // Tax is left as the engine computed it, on the pre-campaign goods. That is
  // a real (small) overstatement where a landing page sells taxed goods at a
  // bundle discount — but these pages are cash-on-delivery in markets that tax
  // at zero, and silently re-deriving tax from a discounted base would be a
  // worse kind of wrong than a documented one.
  const shippingTotalCents = campaign
    ? Math.max(0, campaign.shippingCents)
    : pricing.shippingTotalCents
  const discountTotalCents = campaign
    ? Math.min(
        pricing.subtotalCents,
        pricing.discountTotalCents + Math.max(0, campaign.discountCents)
      )
    : pricing.discountTotalCents
  const totalCents = campaign
    ? Math.max(
        0,
        pricing.subtotalCents -
          discountTotalCents +
          shippingTotalCents +
          pricing.taxTotalCents
      )
    : pricing.totalCents

  const shippingAddress = cart.shippingAddress
  const requiresShipping = cart.lines.some(
    (line) => line.variant.requiresShipping
  )
  if (requiresShipping && !shippingAddress) {
    throw new Error('A shipping address is required')
  }

  // Verify an externally authorized payment covers what we actually computed.
  // Skipping this is how a client that manipulated the displayed total gets
  // goods for less than they cost.
  if (input.paymentReference) {
    await assertPaymentCoversTotal(
      organizationId,
      input.paymentProvider,
      input.paymentReference,
      totalCents,
      pricing.currencyCode
    )
  }

  const placed = await prisma.$transaction(async (tx) => {
    // Re-check inside the transaction: between the read above and here another
    // request could have completed this same cart.
    const fresh = await tx.cart.findUnique({
      where: { id: cart.id },
      select: { completedAt: true },
    })
    if (fresh?.completedAt) {
      const existing = await tx.order.findUnique({
        where: { cartId: cart.id },
        select: {
          id: true,
          orderNumber: true,
          totalCents: true,
          currencyCode: true,
        },
      })
      if (existing) {
        return {
          orderId: existing.id,
          orderNumber: existing.orderNumber,
          totalCents: existing.totalCents,
          currencyCode: existing.currencyCode,
        }
      }
    }

    const orderNumber = await nextOrderNumber(tx, organizationId)

    const customerId = await resolveCustomer(
      tx,
      organizationId,
      cart.customerId,
      {
        email: cart.email,
        phone: contactPhone,
      }
    )

    const pricedById = new Map(pricing.lines.map((line) => [line.id, line]))

    const order = await tx.order.create({
      data: {
        organizationId,
        // Copied from the cart so the order records which storefront sold it.
        // Every order answers "which landing page made this".
        storeId: cart.storeId,
        pageId: campaign?.pageId ?? null,
        offerKey: campaign?.offerKey ?? null,
        offerLabel: campaign?.offerLabel ?? null,
        offerPriceCents: campaign?.offerPriceCents ?? null,
        offerRegularCents: campaign?.offerRegularCents ?? null,
        orderNumber,
        cartId: cart.id,
        customerId,
        email: cart.email,
        phone: contactPhone,
        currencyCode: pricing.currencyCode,
        subtotalCents: pricing.subtotalCents,
        discountTotalCents,
        shippingTotalCents,
        taxTotalCents: pricing.taxTotalCents,
        totalCents,
        financialStatus: 'PENDING',
        shippingAddress: shippingAddress ?? undefined,
        billingAddress: cart.billingAddress ?? shippingAddress ?? undefined,
        shippingCountryCode: readCountryCode(shippingAddress),
        shippingMethodTitle: campaign?.shippingTitle ?? undefined,
        discountCode:
          cart.discountCode ??
          campaign?.discountCode ??
          campaign?.discountLabel ??
          undefined,
        // What the code alone was worth, kept apart from the sum of everything
        // in `discountTotalCents` — see the note on the column in schema.prisma.
        //
        // A campaign page evaluates its own coupon and hands the figure over.
        // An ordinary cart has no other discount, so the pricing engine's total
        // *is* the code's worth. This used to write zero on that second path,
        // which meant an edit made after the campaign behind the code had
        // expired found nothing to carry forward and silently withdrew a
        // discount the customer had already been given.
        couponDiscountCents: campaign
          ? Math.max(0, Math.round(campaign.couponDiscountCents ?? 0))
          : cart.discountCode
            ? Math.max(0, pricing.discountTotalCents)
            : 0,
        note: cart.note,
        lines: {
          create: cart.lines.flatMap((line) =>
            toOrderLines(line, pricedById.get(line.id), campaign)
          ),
        },
      },
      select: {
        id: true,
        orderNumber: true,
        totalCents: true,
        currencyCode: true,
      },
    })

    const committed = await commitInventoryForOrder(
      tx,
      order.id,
      cart.lines.map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        inventoryTracked: line.variant.inventoryTracked,
        inventoryPolicy: line.variant.inventoryPolicy,
      }))
    )

    if (!committed.ok) {
      const sold = cart.lines.find(
        (line) => line.variantId === committed.variantId
      )
      // Throwing rolls back the order and the number we just consumed. A gap
      // in order numbers is acceptable; overselling is not.
      throw new Error(
        `${sold?.variant.product.title ?? 'An item'} sold out while you were checking out`
      )
    }

    if (cart.discountCode) {
      await redeemDiscountCode(tx, organizationId, cart.discountCode)
    }

    await tx.cart.update({
      where: { id: cart.id },
      data: { completedAt: new Date() },
    })

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'order_placed',
        message: `Order ${order.orderNumber} placed`,
      },
    })

    // A manual or cash-on-delivery order is a promise to pay later, so it
    // stays PENDING. An order carrying a verified gateway reference is money
    // already taken and is recorded as such.
    if (input.paymentReference) {
      await tx.transaction.create({
        data: {
          orderId: order.id,
          kind: 'SALE',
          status: 'SUCCESS',
          provider: input.paymentProvider,
          amountCents: totalCents,
          currencyCode: pricing.currencyCode,
          gatewayReference: input.paymentReference,
        },
      })

      await tx.order.update({
        where: { id: order.id },
        data: {
          financialStatus: 'PAID',
          paidTotalCents: totalCents,
        },
      })

      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: 'payment_captured',
          message: `Payment captured via ${input.paymentProvider}`,
        },
      })
    }

    if (customerId) {
      await tx.customer.update({
        where: { id: customerId },
        data: {
          ordersCount: { increment: 1 },
          totalSpentCents: { increment: totalCents },
          lastOrderAt: new Date(),
        },
      })
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalCents: order.totalCents,
      currencyCode: order.currencyCode,
    }
  })

  // After the commit, so a receiver that immediately reads stock sees the
  // quantities this order already reserved rather than the pre-order numbers.
  // Never awaited into the buyer's critical path beyond queueing — see
  // emitWebhook, which returns as soon as the delivery rows are written.
  await emitOrderWebhook(organizationId, placed.orderId, 'ORDER_CREATED')

  // Screen the customer against their courier delivery history, and dispatch if
  // the merchant's thresholds allow it.
  //
  // Queued, never awaited. The screen involves signing into a third party's
  // portal and a courier's create-order call, and the buyer pressing "Place
  // order" must not wait on either — nor lose a completed sale because one of
  // them is having a bad afternoon. The order already exists and is already
  // paid for or promised; everything the courier pipeline does to it afterwards
  // is a state change the merchant can also make by hand.
  scheduleCourierEvaluation(organizationId, placed.orderId)

  return placed
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Allocates the next per-store order number.
 *
 * The increment is atomic and inside the checkout transaction, so two
 * simultaneous checkouts cannot both take 1001. Numbering is per store, which
 * is why it lives on StoreSettings rather than being derived from a global
 * sequence — a merchant's first order should be #1001 whatever the platform's
 * total volume is.
 */
/**
 * One cart line as the order should record it — usually one row, two when part
 * of it is a gift.
 *
 * A cart cannot hold the same variant twice: CartLine is unique on
 * (cart, variant), so a campaign that sells a cap and throws a second cap in
 * free arrives here as one line of two. Recording that as a single gift line
 * would mark a unit the customer paid for as free, and as a single sold line
 * would charge them for the gift. So it is split.
 *
 * The gift half is worth its list price and carries an equal discount, which is
 * what keeps the subtotal honest about what left the shelf — see the note on
 * OrderLine.isGift in schema.prisma. Its value is already inside the campaign's
 * discount total, so recording it here moves it from the order level to the
 * line level rather than counting it twice.
 */
function toOrderLines(
  line: {
    id: string
    variantId: string
    quantity: number
    properties: unknown
    variant: {
      priceCents: number
      title: string
      sku: string | null
      requiresShipping: boolean
      weightGrams: number
      product: { id: string; title: string; vendor: string | null }
    }
  },
  priced:
    | {
        discountCents: number
        taxCents: number
        taxLines: TaxLine[]
        totalCents: number
      }
    | undefined,
  campaign: CampaignContext | undefined
) {
  const giftQuantity = Math.min(
    line.quantity,
    Math.max(0, campaign?.giftVariants?.get(line.variantId) ?? 0)
  )
  const soldQuantity = line.quantity - giftQuantity

  // Every descriptive field is copied, not referenced — see the snapshot rule
  // in schema.prisma. An order must still read correctly after the product is
  // renamed or deleted.
  const base = {
    productId: line.variant.product.id,
    variantId: line.variantId,
    title: line.variant.product.title,
    variantTitle: line.variant.title,
    sku: line.variant.sku,
    vendor: line.variant.product.vendor,
    unitPriceCents: line.variant.priceCents,
    requiresShipping: line.variant.requiresShipping,
    weightGrams: line.variant.weightGrams,
    properties: (line.properties ?? undefined) as
      Prisma.InputJsonValue | undefined,
  }

  const rows: Prisma.OrderLineCreateWithoutOrderInput[] = []

  if (soldQuantity > 0) {
    // The priced figures are for the whole line, so the sold half takes its
    // share. Rounding down on the discount cannot overcharge: the remainder
    // lands on the gift half, which the customer is not paying for anyway.
    const share = soldQuantity / line.quantity
    const discountCents = Math.floor((priced?.discountCents ?? 0) * share)
    const taxCents = Math.floor((priced?.taxCents ?? 0) * share)

    rows.push({
      ...base,
      quantity: soldQuantity,
      totalDiscountCents: discountCents,
      taxTotalCents: taxCents,
      // TaxLine[] is a structurally plain array of records, but Prisma's
      // InputJsonValue only accepts types with an index signature, which a
      // named interface does not have.
      taxLines: (priced?.taxLines ?? []) as unknown as Prisma.InputJsonValue,
      totalCents:
        giftQuantity > 0
          ? Math.max(
              0,
              line.variant.priceCents * soldQuantity - discountCents + taxCents
            )
          : (priced?.totalCents ?? 0),
      isGift: false,
    })
  }

  if (giftQuantity > 0) {
    const value = line.variant.priceCents * giftQuantity
    rows.push({
      ...base,
      quantity: giftQuantity,
      totalDiscountCents: value,
      taxTotalCents: 0,
      taxLines: [] as unknown as Prisma.InputJsonValue,
      totalCents: 0,
      isGift: true,
    })
  }

  return rows
}

async function nextOrderNumber(
  tx: Tx,
  organizationId: string
): Promise<string> {
  const settings = await tx.organizationSettings.update({
    where: { organizationId },
    data: { nextOrderNumber: { increment: 1 } },
    select: {
      nextOrderNumber: true,
      orderNumberPrefix: true,
      orderNumberSuffix: true,
    },
  })

  // The update returns the value *after* incrementing, so the number this
  // order takes is one less.
  const assigned = settings.nextOrderNumber - 1

  return `${settings.orderNumberPrefix}${assigned}${settings.orderNumberSuffix}`
}

/**
 * Finds or creates the customer record for a checkout.
 *
 * Guest checkouts still get a Customer row (with no password) so that repeat
 * purchases by the same email accumulate into one history, and so the merchant
 * can see a real customer list rather than a pile of orphaned orders.
 */
/**
 * Finds or creates the customer this order belongs to.
 *
 * Identity is the email when there is one, and the phone number otherwise —
 * which is the normal case for cash-on-delivery. Phone is deliberately not a
 * unique column (see the schema), so matching on it is a `findFirst` rather
 * than an upsert: two people sharing a landline should not collide into one
 * customer record, but a repeat buyer calling from the same mobile should be
 * recognised as themselves.
 */
async function resolveCustomer(
  tx: Tx,
  organizationId: string,
  existingCustomerId: string | null,
  contact: { email: string | null; phone: string | null }
): Promise<string> {
  if (existingCustomerId) return existingCustomerId

  if (contact.email) {
    const customer = await tx.customer.upsert({
      where: { organizationId_email: { organizationId, email: contact.email } },
      create: { organizationId, email: contact.email, phone: contact.phone },
      // Left untouched on repeat purchases: the customer record is the
      // merchant's to curate, and a number typed into one checkout should not
      // silently replace the one they have on file.
      update: {},
      select: { id: true },
    })
    return customer.id
  }

  const phone = contact.phone!
  const existing = await tx.customer.findFirst({
    where: { organizationId, phone },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  if (existing) return existing.id

  const created = await tx.customer.create({
    data: { organizationId, phone },
    select: { id: true },
  })
  return created.id
}

/**
 * Consumes one redemption of a discount code.
 *
 * The conditional updateMany makes the cap real under concurrency: a code
 * limited to 100 uses cannot be redeemed by 150 simultaneous checkouts, which
 * a read-then-write would allow.
 */
async function redeemDiscountCode(
  tx: Tx,
  organizationId: string,
  code: string
) {
  const discountCode = await tx.discountCode.findFirst({
    where: {
      code: { equals: code, mode: 'insensitive' },
      discount: { organizationId },
    },
    select: { id: true, discountId: true },
  })
  if (!discountCode) return

  const discount = await tx.discount.findUnique({
    where: { id: discountCode.discountId },
    select: { usageLimit: true },
  })

  if (discount?.usageLimit != null) {
    const claimed = await tx.discount.updateMany({
      where: {
        id: discountCode.discountId,
        usageCount: { lt: discount.usageLimit },
      },
      data: { usageCount: { increment: 1 } },
    })

    if (claimed.count === 0) {
      throw new Error('That discount code has reached its usage limit')
    }
  } else {
    await tx.discount.update({
      where: { id: discountCode.discountId },
      data: { usageCount: { increment: 1 } },
    })
  }

  await tx.discountCode.update({
    where: { id: discountCode.id },
    data: { usageCount: { increment: 1 } },
  })
}

/**
 * Confirms an externally authorized payment really covers this order.
 *
 * Delegates to paymentService, which asks the gateway directly whether the
 * payment succeeded, for how much, and in what currency. Nothing about the
 * amount is taken from the request — the figure compared against is the one
 * the pricing engine just computed on this server.
 */
async function assertPaymentCoversTotal(
  organizationId: string,
  provider: PaymentProvider,
  reference: string,
  expectedTotalCents: number,
  currencyCode: string
) {
  const config = await prisma.paymentProviderConfig.findFirst({
    where: { organizationId, provider, isEnabled: true },
    select: { id: true },
  })

  if (!config) {
    throw new Error('That payment method is not available')
  }

  if (expectedTotalCents <= 0) {
    throw new Error('Cannot take a payment for a zero-value order')
  }

  if (reference.trim().length === 0) {
    throw new Error('Payment reference is missing')
  }

  await verifyPayment(
    organizationId,
    provider,
    reference,
    expectedTotalCents,
    currencyCode
  )
}

function readCountryCode(address: unknown): string | null {
  if (!address || typeof address !== 'object') return null
  const code = (address as Record<string, unknown>).countryCode
  return typeof code === 'string' ? code : null
}
