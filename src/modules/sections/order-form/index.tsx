import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { OrderFormClient } from './OrderFormClient'

/**
 * Cash-on-delivery order form.
 *
 * The section that turns a landing page into a shop. A one- or two-product
 * lander in a COD market does not use a cart or a checkout flow: the buyer
 * reads the page, picks an offer, fills in name / phone / address, and taps
 * once. This renders that form and posts it to the storefront order endpoint,
 * which creates a real Order — visible in the merchant's admin, counted in
 * their stock, priced by the same engine as every other order.
 *
 * What it sells is *not* configured here. The offers live on the page (see the
 * Offers tab in the builder and the Offer model), because a page sells the same
 * bundles whether the buyer reaches the form through this section, a bundle
 * card or the sticky bar — three sections quoting three independently-typed
 * prices is exactly the bug this design removes. Everything here is wording and
 * appearance, and it ships with Bengali defaults because the buyers this serves
 * mostly do not read English.
 *
 * This module must stay server-safe. A SectionDefinition is read by server
 * components — PageRenderer pulls `schema`, `defaultContent` and `editorFields`
 * off it — and a `'use client'` module's exports become client-reference
 * proxies on the server, so `definition.schema` would be undefined and every
 * page carrying this section would crash. The interactive form therefore lives
 * in OrderFormClient and this file only wires it up.
 */
export const orderFormContentSchema = z.object({
  heading: z.string().max(200).default('অর্ডার করতে ফর্মটি পূরণ করুন'),
  subheading: z
    .string()
    .max(400)
    .default('সঠিক তথ্য দিন, আমাদের প্রতিনিধি ফোন করে অর্ডার কনফার্ম করবেন।'),

  offersLabel: z.string().max(80).default('আপনার প্যাকেজ বেছে নিন'),
  nameLabel: z.string().max(80).default('আপনার নাম'),
  phoneLabel: z.string().max(80).default('মোবাইল নম্বর'),
  addressLabel: z.string().max(80).default('সম্পূর্ণ ঠিকানা'),
  cityLabel: z.string().max(80).default('এলাকা / জেলা'),
  zoneLabel: z.string().max(80).default('ডেলিভারি এলাকা'),
  noteLabel: z.string().max(80).default('অতিরিক্ত তথ্য'),
  buttonLabel: z.string().max(80).default('ক্যাশ অন ডেলিভারিতে অর্ডার করুন'),

  subtotalLabel: z.string().max(60).default('সাবটোটাল'),
  discountLabel: z.string().max(60).default('ছাড়'),
  deliveryLabel: z.string().max(60).default('ডেলিভারি চার্জ'),
  totalLabel: z.string().max(60).default('সর্বমোট'),

  successMessage: z
    .string()
    .max(400)
    .default('ধন্যবাদ! আপনার অর্ডার গ্রহণ করা হয়েছে। আমরা শীঘ্রই কল করব।'),

  showNote: z.boolean().default(false),
  /** Off by default: COD buyers are reached by phone, and an extra required
   *  field is the most common reason a mobile form is abandoned. */
  showEmail: z.boolean().default(false),
  /** The running order summary above the button. Off for the shortest form. */
  showSummary: z.boolean().default(true),

  /** How the offer choices are presented. */
  offerStyle: z.enum(['cards', 'rows', 'tiles', 'radio']).default('cards'),

  buttonColor: z.string().max(30).default('#16a34a'),
  countryCode: z.string().max(2).default('BD'),
})

export type OrderFormContent = z.infer<typeof orderFormContentSchema>

export const orderFormDefaultContent: OrderFormContent =
  orderFormContentSchema.parse({})

/**
 * Server-safe wrapper. Everything interactive lives in OrderFormClient — see
 * the note there for why this module must not be `'use client'`.
 */
function OrderFormRenderer({
  content,
  config,
  storeId,
  commerce,
}: SectionRendererProps<OrderFormContent>) {
  return (
    <OrderFormClient
      content={content}
      config={config}
      storeId={storeId}
      commerce={commerce}
    />
  )
}

export const orderFormSection: SectionDefinition<OrderFormContent> = {
  key: 'order-form',
  name: 'Order form (COD)',
  category: 'Commerce',
  schema: orderFormContentSchema,
  defaultContent: orderFormDefaultContent,
  editorFields: [
    { type: 'text', name: 'heading', label: 'Heading' },
    { type: 'textarea', name: 'subheading', label: 'Subheading' },
    {
      type: 'select',
      name: 'offerStyle',
      label: 'Offer picker style',
      options: ['cards', 'rows', 'tiles', 'radio'],
    },
    { type: 'text', name: 'offersLabel', label: 'Offer picker label' },
    { type: 'text', name: 'nameLabel', label: 'Name label' },
    { type: 'text', name: 'phoneLabel', label: 'Phone label' },
    { type: 'text', name: 'addressLabel', label: 'Address label' },
    { type: 'text', name: 'cityLabel', label: 'City label' },
    { type: 'text', name: 'zoneLabel', label: 'Delivery area label' },
    { type: 'text', name: 'noteLabel', label: 'Note label' },
    { type: 'text', name: 'buttonLabel', label: 'Button label' },
    { type: 'boolean', name: 'showSummary', label: 'Show the order summary' },
    { type: 'text', name: 'subtotalLabel', label: 'Summary: subtotal' },
    { type: 'text', name: 'discountLabel', label: 'Summary: discount' },
    { type: 'text', name: 'deliveryLabel', label: 'Summary: delivery' },
    { type: 'text', name: 'totalLabel', label: 'Summary: total' },
    { type: 'textarea', name: 'successMessage', label: 'Thank-you message' },
    { type: 'boolean', name: 'showNote', label: 'Ask for a note' },
    { type: 'boolean', name: 'showEmail', label: 'Ask for an email' },
    { type: 'color', name: 'buttonColor', label: 'Button colour' },
    { type: 'text', name: 'countryCode', label: 'Country code' },
  ],
  Renderer: OrderFormRenderer,
}
