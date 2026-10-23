import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { El } from '../elements'
import { ProductDetailsClient } from './ProductDetailsClient'

export const productDetailsContentSchema = z.object({
  gallery: z.enum(['below', 'side', 'stack']).default('below'),
  imageRatio: z.enum(['portrait', 'square']).default('portrait'),
  showVendor: z.boolean().default(false),
  optionStyle: z.enum(['buttons', 'dropdown']).default('buttons'),
  showQuantity: z.boolean().default(true),
  showBuyNow: z.boolean().default(true),
  showStock: z.boolean().default(true),
  stickyMobileBar: z.boolean().default(true),
  addToCartText: z.string().max(40).default('Add to cart'),
  buyNowText: z.string().max(40).default('Buy now'),
  soldOutText: z.string().max(40).default('Sold out'),
  inStockText: z.string().max(60).default('In stock'),
  lowStockText: z.string().max(60).default('Only {count} left'),
  highlights: z
    .array(z.object({ text: z.string().max(160).default('') }))
    .max(6)
    .default([
      { text: 'Cash on delivery available' },
      { text: 'Delivery in 2–5 days across the country' },
      { text: 'Easy exchange within 7 days' },
    ]),
  showDescription: z.boolean().default(true),
  descriptionTitle: z.string().max(80).default('Description'),
})

export type ProductDetailsContent = z.infer<typeof productDetailsContentSchema>

export const productDetailsDefaultContent: ProductDetailsContent =
  productDetailsContentSchema.parse({})

/**
 * The product, on its own page: photos, price, sizes, and the button.
 *
 * This is the one block a store's product page cannot do without, so it is
 * required there — it can be restyled and moved, and blocks can go above and
 * below it, but not removed. It draws whichever product the address names; the
 * design is the merchant's and the product is the catalogue's.
 *
 * Everything a shopper touches — choosing a size, the photo that follows it,
 * the quantity, adding to the cart — lives in the client half. What lives here
 * is the frame, so the page is readable before any script runs.
 */
function ProductDetailsRenderer({
  content,
  config,
  storefront,
  editing,
}: SectionRendererProps<ProductDetailsContent>) {
  const product = storefront?.product

  if (!product) {
    return editing ? (
      <SectionWrapper config={config} defaultPadding={false}>
        <El
          as="div"
          part="info"
          className="mx-auto my-12 max-w-[var(--page-container-width)] px-6 py-16 text-center text-sm opacity-70"
        >
          Your product’s photos, price and buttons appear here.
        </El>
      </SectionWrapper>
    ) : null
  }

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <div className="mx-auto max-w-[var(--page-container-width)] px-4 pt-6 pb-12 sm:px-6 lg:pt-10 lg:pb-16">
        <ProductDetailsClient
          product={product}
          content={content}
          config={config}
          currencyCode={storefront.currencyCode}
          linkBase={storefront.linkBase}
          editing={editing}
        />
      </div>
    </SectionWrapper>
  )
}

export const productDetailsSection: SectionDefinition<ProductDetailsContent> = {
  key: 'productdetails',
  name: 'Product details',
  category: 'Store',
  description: 'Photos, price, sizes and the Add to cart button.',
  sites: ['STORE'],
  pageRoles: ['PRODUCT'],
  requiredOn: 'PRODUCT',
  singleton: true,
  keywords: ['product', 'gallery', 'add to cart', 'buy', 'variants', 'sizes'],
  schema: productDetailsContentSchema,
  defaultContent: productDetailsDefaultContent,
  translations: {
    bn: {
      addToCartText: 'কার্টে যোগ করুন',
      buyNowText: 'এখনই কিনুন',
      soldOutText: 'স্টক নেই',
      inStockText: 'স্টকে আছে',
      lowStockText: 'মাত্র {count}টি বাকি',
      highlights: [
        { text: 'ক্যাশ অন ডেলিভারি সুবিধা' },
        { text: 'সারা দেশে ২–৫ দিনে ডেলিভারি' },
        { text: '৭ দিনের মধ্যে সহজ এক্সচেঞ্জ' },
      ],
      descriptionTitle: 'পণ্যের বিবরণ',
    },
  },
  editorFields: [
    {
      type: 'select',
      name: 'gallery',
      label: 'Photos',
      options: [
        { value: 'below', label: 'Big photo, small ones underneath' },
        { value: 'side', label: 'Big photo, small ones beside it' },
        { value: 'stack', label: 'All photos, one under another' },
      ],
    },
    {
      type: 'select',
      name: 'imageRatio',
      label: 'Photo shape',
      options: [
        { value: 'portrait', label: 'Tall (clothing)' },
        { value: 'square', label: 'Square' },
      ],
    },
    {
      type: 'select',
      name: 'optionStyle',
      label: 'Sizes and colours as',
      options: [
        { value: 'buttons', label: 'Buttons to tap' },
        { value: 'dropdown', label: 'A dropdown' },
      ],
    },
    { type: 'boolean', name: 'showVendor', label: 'Show the brand name' },
    {
      type: 'boolean',
      name: 'showQuantity',
      label: 'Let shoppers choose a quantity',
    },
    { type: 'boolean', name: 'showBuyNow', label: 'Show a “Buy now” button' },
    { type: 'boolean', name: 'showStock', label: 'Say when stock is low' },
    {
      type: 'boolean',
      name: 'stickyMobileBar',
      label: 'Keep the buy button on screen on phones',
    },
    {
      type: 'array',
      name: 'highlights',
      label: 'Highlights',
      itemFields: [{ type: 'text', name: 'text', label: 'Text' }],
    },
    { type: 'boolean', name: 'showDescription', label: 'Show the description' },
    { type: 'heading', name: 'wordsHeading', label: 'Words' },
    { type: 'text', name: 'addToCartText', label: 'Add to cart button' },
    {
      type: 'text',
      name: 'buyNowText',
      label: 'Buy now button',
      showWhen: { field: 'showBuyNow', equals: true },
    },
    { type: 'text', name: 'soldOutText', label: 'Sold out' },
    { type: 'text', name: 'inStockText', label: 'In stock' },
    {
      type: 'text',
      name: 'lowStockText',
      label: 'Low stock',
      description: '{count} becomes the number left.',
    },
    {
      type: 'text',
      name: 'descriptionTitle',
      label: 'Description heading',
      showWhen: { field: 'showDescription', equals: true },
    },
  ],
  elements: [
    { key: 'gallery', label: 'Photos', kind: 'container' },
    { key: 'mainImage', label: 'Main photo', kind: 'image' },
    { key: 'thumbnail', label: 'Small photo', kind: 'image', repeated: true },
    { key: 'info', label: 'Product info', kind: 'container', slot: true },
    { key: 'vendor', label: 'Brand', kind: 'text' },
    { key: 'title', label: 'Product name', kind: 'heading' },
    { key: 'price', label: 'Price', kind: 'text' },
    { key: 'saving', label: 'Saving badge', kind: 'text' },
    { key: 'optionLabel', label: 'Option name', kind: 'text', repeated: true },
    {
      key: 'optionValue',
      label: 'Option button',
      kind: 'button',
      repeated: true,
    },
    { key: 'stock', label: 'Stock message', kind: 'text' },
    {
      key: 'addButton',
      label: 'Add to cart button',
      kind: 'button',
      contentField: 'addToCartText',
    },
    {
      key: 'buyButton',
      label: 'Buy now button',
      kind: 'button',
      contentField: 'buyNowText',
    },
    { key: 'highlights', label: 'Highlights', kind: 'container' },
    {
      key: 'highlight',
      label: 'Highlight',
      kind: 'text',
      repeated: true,
      contentField: 'highlights[].text',
    },
    {
      key: 'descriptionTitle',
      label: 'Description heading',
      kind: 'heading',
      contentField: 'descriptionTitle',
    },
    { key: 'description', label: 'Description', kind: 'text' },
    { key: 'stickyBar', label: 'Phone buy bar', kind: 'container' },
  ],
  slots: [{ key: 'content', label: 'Beside the photos' }],
  Renderer: ProductDetailsRenderer,
}
