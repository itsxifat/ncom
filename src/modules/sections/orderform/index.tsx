import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { OrderFormClient } from './OrderFormClient'

/**
 * Cash-on-delivery order form.
 *
 * The block that turns a landing page into a shop. A one- or two-product lander
 * in a COD market does not use a cart or a checkout flow: the buyer reads the
 * page, picks an offer, fills in name / phone / address, and taps once. This
 * renders that form and posts it to the storefront order endpoint, which
 * creates a real Order — visible in the merchant's admin, counted in their
 * stock, priced by the same engine as every other order.
 *
 * What it sells is *not* configured here. The offers live on the page (see the
 * Offers tab in the builder and the Offer model), because a page sells the same
 * bundles whether the buyer reaches the form through this block or a CTA
 * further up — three surfaces quoting three independently-typed prices is
 * exactly the bug that design removes. Everything here is wording.
 *
 * This module must stay server-safe: a SectionDefinition is read by server
 * components, and a `'use client'` module's exports become client-reference
 * proxies on the server, so `definition.schema` would be undefined and every
 * page carrying this block would crash. The interactive form lives in
 * OrderFormClient and this file only wires it up.
 */
export const orderformContentSchema = z.object({
  title: z.string().max(200).default('Order now — cash on delivery'),
  subtitle: z.string().max(400).default(''),
  submitText: z.string().max(80).default('Confirm order'),

  // Name, phone and address are always required — they are what the courier
  // needs. These toggle the optional extras.
  askEmail: z.boolean().default(true),
  askNote: z.boolean().default(false),

  /**
   * Every word the form says, as fields.
   *
   * These were hard-coded English strings inside the component. That made the
   * one block a merchant most needs to speak their customer's language in the
   * only block they could not touch — and it is the block where a
   * misunderstood field label costs an order. Each carries the sentence it
   * replaced as its default, so a page written before these existed reads
   * exactly as it did.
   */
  packageLabel: z.string().max(120).default('Choose your package'),
  nameLabel: z.string().max(80).default('Full name *'),
  phoneLabel: z.string().max(80).default('Mobile number *'),
  phonePlaceholder: z.string().max(80).default('01XXXXXXXXX'),
  emailLabel: z.string().max(80).default('Email (optional)'),
  addressLabel: z.string().max(120).default('Full delivery address *'),
  addressPlaceholder: z.string().max(120).default('House, road, area'),
  cityLabel: z.string().max(80).default('City / District *'),
  zoneLabel: z.string().max(80).default('Delivery area'),
  noteLabel: z.string().max(80).default('Notes (optional)'),
  couponLabel: z.string().max(120).default('Discount code (optional)'),
  couponPlaceholder: z.string().max(80).default('SAVE10'),
  couponHint: z.string().max(200).default('Applied when you place the order.'),
  deliveryLabel: z.string().max(80).default('Delivery'),
  totalLabel: z.string().max(80).default('Total payable'),
  trustPrimary: z.string().max(80).default('Cash on delivery'),
  trustSecondary: z.string().max(80).default('No advance payment'),

  successTitle: z
    .string()
    .max(200)
    .default('Thank you! Your order is confirmed.'),
  successMessage: z
    .string()
    .max(400)
    .default(
      "We'll call you shortly to confirm delivery. Please keep your phone nearby."
    ),
  orderNumberLabel: z.string().max(80).default('Order number'),
  amountLabel: z.string().max(120).default('Amount payable on delivery'),

  /**
   * The phone-number format the form validates against. Bengali-market
   * defaults, but a tenant selling elsewhere is not forced into them — this is
   * the one place the single-store original could hard-code a country and a
   * multi-tenant platform cannot.
   */
  countryCode: z.string().max(2).default('BD'),
})

export type OrderformContent = z.infer<typeof orderformContentSchema>

export const orderformDefaultContent: OrderformContent =
  orderformContentSchema.parse({})

function OrderformRenderer({
  content,
  config,
  storeId,
  commerce,
}: SectionRendererProps<OrderformContent>) {
  return (
    <OrderFormClient
      content={content}
      config={config}
      storeId={storeId}
      commerce={commerce}
    />
  )
}

export const orderformSection: SectionDefinition<OrderformContent> = {
  key: 'orderform',
  name: 'Order form',
  category: 'Commerce',
  description: 'Offer picker + delivery details. Where the order is placed.',
  // Exactly one per page, and it cannot be removed: a landing page with no way
  // to buy is not a landing page, and two order forms is two carts on one
  // funnel.
  singleton: true,
  schema: orderformContentSchema,
  defaultContent: orderformDefaultContent,
  editorFields: [
    { type: 'richtext', name: 'title', label: 'Heading' },
    { type: 'richtext', name: 'subtitle', label: 'Subheading' },

    { type: 'heading', name: 'divider:copy', label: 'What the form says' },
    { type: 'text', name: 'packageLabel', label: 'Package picker heading' },
    { type: 'text', name: 'nameLabel', label: 'Name label' },
    { type: 'text', name: 'phoneLabel', label: 'Phone label' },
    { type: 'text', name: 'phonePlaceholder', label: 'Phone placeholder' },
    { type: 'boolean', name: 'askEmail', label: 'Ask for an email' },
    {
      type: 'text',
      name: 'emailLabel',
      label: 'Email label',
      showWhen: { field: 'askEmail', equals: true },
    },
    { type: 'text', name: 'addressLabel', label: 'Address label' },
    { type: 'text', name: 'addressPlaceholder', label: 'Address placeholder' },
    { type: 'text', name: 'cityLabel', label: 'City label' },
    { type: 'text', name: 'zoneLabel', label: 'Delivery-area label' },
    { type: 'boolean', name: 'askNote', label: 'Ask for a note' },
    {
      type: 'text',
      name: 'noteLabel',
      label: 'Note label',
      showWhen: { field: 'askNote', equals: true },
    },
    { type: 'text', name: 'couponLabel', label: 'Discount-code label' },
    {
      type: 'text',
      name: 'couponPlaceholder',
      label: 'Discount-code placeholder',
    },
    { type: 'text', name: 'couponHint', label: 'Discount-code hint' },
    { type: 'text', name: 'deliveryLabel', label: 'Delivery row label' },
    { type: 'text', name: 'totalLabel', label: 'Total row label' },
    { type: 'text', name: 'submitText', label: 'Button text' },
    { type: 'text', name: 'trustPrimary', label: 'Reassurance, left' },
    { type: 'text', name: 'trustSecondary', label: 'Reassurance, right' },

    { type: 'heading', name: 'divider:success', label: 'After the order' },
    { type: 'richtext', name: 'successTitle', label: 'Thank-you heading' },
    {
      type: 'richtext',
      name: 'successMessage',
      label: 'Thank-you message',
      multiline: true,
    },
    { type: 'text', name: 'orderNumberLabel', label: 'Order-number label' },
    { type: 'text', name: 'amountLabel', label: 'Amount-due label' },

    { type: 'heading', name: 'divider:advanced', label: 'Advanced' },
    { type: 'text', name: 'countryCode', label: 'Country code' },
  ],
  /**
   * Every visible piece of this block, addressable.
   *
   * These used to stop at the heading and the button, on the reasoning that the
   * machinery which takes the order should not be restylable — a merchant who
   * turned a field label invisible would break the one thing the page exists to
   * do. That reasoning protected the wrong thing. The order form is where a
   * page's design most obviously ends: a merchant would brand the hero and the
   * features and then hit a white box with somebody else's border radius, and
   * they had no way through it.
   *
   * So the whole form is open now, and the guard moved to where it belongs:
   * nothing here can be *deleted* (only added elements can), the block is a
   * singleton so a page cannot end up with two of them, and every control keeps
   * its own behaviour whatever it is painted like. A merchant can still hide a
   * label — on their own page, which is theirs to get wrong, and one undo away.
   *
   * Keys that end in a repeated list carry `repeated`, so styling "the offer
   * cards" is one edit and card three is an explicit choice on top of it.
   */
  elements: [
    // Heading area
    { key: 'header', label: 'Heading area', kind: 'container', slot: true },
    { key: 'title', label: 'Heading', kind: 'heading', contentField: 'title' },
    {
      key: 'subtitle',
      label: 'Subheading',
      kind: 'text',
      contentField: 'subtitle',
    },

    // The panel
    { key: 'form', label: 'Form panel', kind: 'container' },

    // Package picker
    {
      key: 'packageLabel',
      label: 'Package heading',
      kind: 'text',
      contentField: 'packageLabel',
    },
    { key: 'offers', label: 'Package grid', kind: 'container' },
    {
      key: 'offerCard',
      label: 'Package card',
      kind: 'container',
      repeated: true,
    },
    {
      key: 'offerImage',
      label: 'Package photo',
      kind: 'image',
      repeated: true,
    },
    { key: 'offerName', label: 'Package name', kind: 'text', repeated: true },
    {
      key: 'offerDescription',
      label: 'Package description',
      kind: 'text',
      repeated: true,
    },
    { key: 'offerPrice', label: 'Package price', kind: 'text', repeated: true },
    {
      key: 'offerGift',
      label: 'Package gift line',
      kind: 'text',
      repeated: true,
    },
    { key: 'offerBadge', label: 'Package badge', kind: 'text', repeated: true },

    // What the buyer is picking
    { key: 'items', label: 'Item picker', kind: 'container' },
    { key: 'line', label: 'Item row', kind: 'container', repeated: true },
    { key: 'lineImage', label: 'Item photo', kind: 'image', repeated: true },
    { key: 'lineName', label: 'Item name', kind: 'text', repeated: true },
    { key: 'linePrice', label: 'Item price', kind: 'text', repeated: true },
    {
      key: 'lineOptions',
      label: 'Option chips',
      kind: 'container',
      repeated: true,
    },
    { key: 'option', label: 'Option chip', kind: 'button', repeated: true },
    { key: 'tierChips', label: 'Quantity tiers', kind: 'container' },
    { key: 'tier', label: 'Quantity tier', kind: 'text', repeated: true },
    { key: 'poolHint', label: 'Pool instruction', kind: 'text' },
    { key: 'poolCount', label: 'Pool running total', kind: 'text' },
    {
      key: 'stepper',
      label: 'Quantity stepper',
      kind: 'container',
      repeated: true,
    },

    // Delivery details
    { key: 'fields', label: 'Delivery details', kind: 'container' },
    {
      key: 'nameLabel',
      label: 'Name label',
      kind: 'text',
      contentField: 'nameLabel',
    },
    {
      key: 'phoneLabel',
      label: 'Phone label',
      kind: 'text',
      contentField: 'phoneLabel',
    },
    {
      key: 'emailLabel',
      label: 'Email label',
      kind: 'text',
      contentField: 'emailLabel',
    },
    {
      key: 'addressLabel',
      label: 'Address label',
      kind: 'text',
      contentField: 'addressLabel',
    },
    {
      key: 'cityLabel',
      label: 'City label',
      kind: 'text',
      contentField: 'cityLabel',
    },
    {
      key: 'zoneLabel',
      label: 'Delivery-area label',
      kind: 'text',
      contentField: 'zoneLabel',
    },
    {
      key: 'noteLabel',
      label: 'Note label',
      kind: 'text',
      contentField: 'noteLabel',
    },
    // One key for every text box, so "make the inputs rounder" is one edit.
    { key: 'input', label: 'Input box', kind: 'container', repeated: true },
    {
      key: 'zoneOption',
      label: 'Delivery-area button',
      kind: 'button',
      repeated: true,
    },

    // Discount code
    {
      key: 'couponLabel',
      label: 'Discount-code label',
      kind: 'text',
      contentField: 'couponLabel',
    },
    {
      key: 'couponHint',
      label: 'Discount-code hint',
      kind: 'text',
      contentField: 'couponHint',
    },

    // Summary
    { key: 'summary', label: 'Summary', kind: 'container' },
    {
      key: 'summaryRow',
      label: 'Summary row',
      kind: 'container',
      repeated: true,
    },
    {
      key: 'deliveryLabel',
      label: 'Delivery row label',
      kind: 'text',
      contentField: 'deliveryLabel',
    },
    { key: 'totalRow', label: 'Total row', kind: 'container' },
    {
      key: 'totalLabel',
      label: 'Total label',
      kind: 'text',
      contentField: 'totalLabel',
    },
    { key: 'totalValue', label: 'Total amount', kind: 'text' },
    {
      key: 'submit',
      label: 'Confirm button',
      kind: 'button',
      contentField: 'submitText',
    },
    { key: 'trust', label: 'Reassurance row', kind: 'container' },
    {
      key: 'trustPrimary',
      label: 'Reassurance, left',
      kind: 'text',
      contentField: 'trustPrimary',
    },
    {
      key: 'trustSecondary',
      label: 'Reassurance, right',
      kind: 'text',
      contentField: 'trustSecondary',
    },

    // After the order
    { key: 'successPanel', label: 'Thank-you panel', kind: 'container' },
    { key: 'successIcon', label: 'Thank-you icon', kind: 'icon' },
    {
      key: 'successTitle',
      label: 'Thank-you heading',
      kind: 'heading',
      contentField: 'successTitle',
    },
    {
      key: 'successMessage',
      label: 'Thank-you message',
      kind: 'text',
      contentField: 'successMessage',
    },
    { key: 'receipt', label: 'Receipt box', kind: 'container' },
    {
      key: 'orderNumberLabel',
      label: 'Order-number label',
      kind: 'text',
      contentField: 'orderNumberLabel',
    },
    { key: 'orderNumber', label: 'Order number', kind: 'text' },
    {
      key: 'amountLabel',
      label: 'Amount-due label',
      kind: 'text',
      contentField: 'amountLabel',
    },
    { key: 'amountValue', label: 'Amount due', kind: 'text' },

    { key: 'emptyNote', label: 'Nothing-to-sell note', kind: 'text' },
  ],
  slots: [{ key: 'header', label: 'Under the heading' }],
  Renderer: OrderformRenderer,
}
