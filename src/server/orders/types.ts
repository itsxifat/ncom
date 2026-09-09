import 'server-only'

/**
 * The wire shape of an order handed to a merchant's own website.
 *
 * Written down as types rather than assembled ad hoc in the sender, because
 * this is a published contract: somebody else's code parses it, and a field
 * that quietly changes name is an integration that breaks on a deploy they did
 * not make. `docs/order-destination.md` documents exactly these types, and the
 * two are meant to be read side by side.
 *
 * ── Money ───────────────────────────────────────────────────────────────────
 * Every amount is an integer in the currency's minor unit, named `…Cents`, and
 * there is never a second decimal form of the same figure. One representation
 * means there is no pair of numbers that can disagree — the rule the catalogue
 * contract already applies in the other direction. A receiver working in whole
 * taka divides by 100.
 *
 * ── Identity ────────────────────────────────────────────────────────────────
 * `id` is NCOM's order id and is also the idempotency key. A receiver that has
 * already stored an order with this id must return 200 and its own identifiers
 * rather than creating a second one — see the note on `OrderForward` in
 * schema.prisma for why a retry can arrive after a success.
 */

/** Whose catalogue a line's goods came out of. */
export type HandoffLineSource = 'website' | 'ncom'

export interface HandoffLine {
  /**
   * The product and variant ids as the *receiver* knows them, when the goods
   * came from their own catalogue: these are the exact ids their connector
   * handed us, so they join straight back to their own rows.
   *
   * When `source` is `ncom` they are NCOM's ids instead, and mean nothing on
   * the receiving side — which is what `source` is there to say. A receiver
   * should record such a line descriptively and not try to resolve it.
   */
  productId: string | null
  variantId: string | null
  source: HandoffLineSource

  title: string
  /** The variant's own name — the size, the colourway. Null when there is one. */
  variantTitle: string | null
  sku: string | null
  vendor: string | null

  /**
   * An absolute https URL for the photo the goods were sold with, or null.
   *
   * Absolute is a promise, not a hope — see `absoluteImageUrl`. A receiver
   * pasting this into an `<img src>` on their own admin must not have to know
   * which of three places the picture came from.
   */
  imageUrl: string | null

  quantity: number
  unitPriceCents: number
  /** What came off this line, including its share of a bundle's saving. */
  discountCents: number
  taxCents: number
  /** quantity × unit price − discount + tax. What this line is worth. */
  totalCents: number

  requiresShipping: boolean
  weightGrams: number
  /**
   * Given away by the campaign rather than sold. The line keeps its real price
   * and carries an equal discount, so a receiver that ignores this flag still
   * arrives at the right total — it only loses the ability to print "Gift".
   */
  isGift: boolean
}

export interface HandoffAddress {
  name: string | null
  phone: string | null
  email: string | null
  /** Street and building, as one field or two — both are sent when both exist. */
  address1: string | null
  address2: string | null
  city: string | null
  /** District, division, state — whatever the form called it. */
  province: string | null
  postalCode: string | null
  countryCode: string | null
}

/** Which landing page sold this, and under what offer. */
export interface HandoffCampaign {
  pageId: string | null
  pageTitle: string | null
  /** The public address of the page the buyer ordered from, when resolvable. */
  pageUrl: string | null
  /** The offer's stable key and the label the buyer actually read. */
  offerKey: string | null
  offerLabel: string | null
  /** What the offer charged for goods, and what those goods list for. */
  offerPriceCents: number | null
  offerRegularCents: number | null
}

/** The storefront the order came through. */
export interface HandoffStore {
  id: string | null
  name: string | null
  subdomain: string | null
  url: string | null
}

export interface HandoffOrder {
  /** NCOM's order id. Also the idempotency key. */
  id: string
  /** The human number shown to the buyer and printed on the parcel. */
  orderNumber: string
  createdAt: string

  currencyCode: string

  customer: {
    name: string | null
    phone: string | null
    email: string | null
  }
  shippingAddress: HandoffAddress
  billingAddress: HandoffAddress | null

  lines: HandoffLine[]

  subtotalCents: number
  discountTotalCents: number
  shippingTotalCents: number
  taxTotalCents: number
  totalCents: number

  /** What the buyer typed, and what it alone was worth. */
  discountCode: string | null
  couponDiscountCents: number

  shippingMethodTitle: string | null
  /** Always cash on delivery today; named so it can stop being. */
  paymentMethod: 'cash_on_delivery'
  /**
   * Always `pending`. NCOM took no money and did not screen the customer — the
   * order arrives unprocessed on purpose, and what happens to it next is the
   * receiver's own pipeline.
   */
  status: 'pending'

  note: string | null
  campaign: HandoffCampaign
  store: HandoffStore
}

/**
 * What a request is.
 *
 * `order.test` carries a complete, plausible order and must be answered exactly
 * like a real one — the same 200, the same signature check — *without* creating
 * anything. It exists because the alternative ways to prove an integration
 * works are both bad: a merchant placing a real order on their own live shop to
 * see if it arrives, or a bare ping that proves the URL resolves and nothing
 * about whether the payload parses.
 *
 * A receiver that ignores the distinction and files the test as an order has
 * one junk order to delete, which is why the sample is unmistakable: its
 * `orderNumber` starts `TEST-` and its lines say so.
 */
export type HandoffTopic =
  | 'order.placed'
  | 'order.test'
  /** The order changed here. Carries the whole order, not a diff. */
  | 'order.updated'
  /** Cancelled here. Release whatever you are holding for it. */
  | 'order.cancelled'

/** The full request body. Versioned so a v2 can be told apart on arrival. */
export interface HandoffEnvelope {
  /** Contract revision. `1` is this document. */
  version: 1
  topic: HandoffTopic
  /** Repeated from `order.id` so a receiver can dedupe before parsing deeper. */
  idempotencyKey: string
  sentAt: string
  organizationId: string
  order: HandoffOrder

  /**
   * What this message believes the receiver currently holds, and what applying
   * it will produce. Absent on `order.placed` and `order.test` — there is
   * nothing yet to have a revision.
   *
   * A receiver **must** refuse a message whose `baseRevision` is not the
   * revision it holds, with 409 and its own current revision. That refusal is
   * the entire defence against two people editing the same order in two
   * systems and one of the edits vanishing. Applying it anyway, or merging,
   * produces an order that neither person asked for.
   *
   * A message whose `revision` the receiver has already applied is a retry:
   * answer 200, change nothing.
   */
  baseRevision?: number
  revision?: number

  /** Why, on `order.cancelled`. Free text, for the record. */
  reason?: string | null
}

/** What a receiver answers a sync message with. */
export interface SyncAck extends HandoffAck {
  /** The revision the receiver now holds. Lets both sides confirm they agree. */
  revision?: number
}

/**
 * What a receiver may answer with. Every field is optional: a bare `200` is a
 * complete and valid acceptance, and requiring a body would break every
 * merchant whose framework answers with an empty 204.
 */
export interface HandoffAck {
  orderId?: string | null
  orderNumber?: string | null
}
