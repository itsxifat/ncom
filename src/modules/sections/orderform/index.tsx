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
  noteLabel: z.string().max(80).default('Notes (optional)'),

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
    { type: 'text', name: 'submitText', label: 'Button text' },
    { type: 'boolean', name: 'askEmail', label: 'Ask for an email' },
    { type: 'boolean', name: 'askNote', label: 'Ask for a note' },
    { type: 'text', name: 'noteLabel', label: 'Note label' },
    { type: 'richtext', name: 'successTitle', label: 'Thank-you heading' },
    {
      type: 'richtext',
      name: 'successMessage',
      label: 'Thank-you message',
      multiline: true,
    },
    { type: 'text', name: 'countryCode', label: 'Country code' },
  ],
  // Only the wording and the frame. The offer picker, the address fields and
  // the totals are deliberately absent: they are the machinery that takes the
  // order, and a merchant who could restyle a field label into invisibility
  // would be able to break the one thing the page exists to do.
  elements: [
    { key: 'header', label: 'Heading area', kind: 'container', slot: true },
    { key: 'title', label: 'Heading', kind: 'heading', contentField: 'title' },
    {
      key: 'subtitle',
      label: 'Subheading',
      kind: 'text',
      contentField: 'subtitle',
    },
    { key: 'form', label: 'Form panel', kind: 'container' },
    {
      key: 'submit',
      label: 'Confirm button',
      kind: 'button',
      contentField: 'submitText',
    },
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
  ],
  slots: [{ key: 'header', label: 'Under the heading' }],
  Renderer: OrderformRenderer,
}
