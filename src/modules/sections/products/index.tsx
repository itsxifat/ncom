import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { El, Extras } from '../elements'
import { storePaths } from '../storefront'
import { cn } from '@/lib/utils'
import { ProductCard } from '@/modules/storefront/ProductCard'
import { storeText } from '@/modules/storefront/i18n'

export const productsContentSchema = z.object({
  title: z.string().max(200).default('Featured products'),
  subtitle: z.string().max(400).default(''),
  source: z
    .enum(['newest', 'category', 'collection', 'picked'])
    .default('newest'),
  category: z.string().max(200).default(''),
  collection: z.string().max(200).default(''),
  products: z.array(z.string().max(200)).max(24).default([]),
  limit: z.number().int().min(1).max(24).default(8),
  layout: z.enum(['grid', 'carousel']).default('grid'),
  columns: z.enum(['2', '3', '4', '5']).default('4'),
  imageRatio: z.enum(['portrait', 'square', 'landscape']).default('portrait'),
  showButton: z.boolean().default(true),
  showViewAll: z.boolean().default(true),
  viewAllText: z.string().max(60).default('View all'),
  addText: z.string().max(40).default('Add to cart'),
  chooseText: z.string().max(40).default('Choose options'),
  soldOutText: z.string().max(40).default('Sold out'),
  saleText: z.string().max(20).default('Sale'),
  emptyText: z.string().max(200).default('New products are on their way.'),
})

export type ProductsContent = z.infer<typeof productsContentSchema>

export const productsDefaultContent: ProductsContent =
  productsContentSchema.parse({})

const COLUMNS: Record<ProductsContent['columns'], string> = {
  '2': 'lg:grid-cols-2',
  '3': 'lg:grid-cols-3',
  '4': 'lg:grid-cols-4',
  '5': 'lg:grid-cols-5',
}

const CAROUSEL_WIDTH: Record<ProductsContent['columns'], string> = {
  '2': 'lg:w-[calc((100%-1.5rem)/2)]',
  '3': 'lg:w-[calc((100%-3rem)/3)]',
  '4': 'lg:w-[calc((100%-4.5rem)/4)]',
  '5': 'lg:w-[calc((100%-6rem)/5)]',
}

/**
 * A row or grid of products — the newest, a category, a collection, or ones
 * the merchant picked.
 *
 * The block says which products it wants (`productQuery`) and the page loads
 * them before rendering; the block itself never fetches. That is what lets the
 * same component draw from the server on the live site and from the builder's
 * own copy on the canvas, and lets two grids asking the same question share
 * one read of the merchant's catalogue.
 */
function ProductsRenderer({
  content,
  config,
  theme,
  sectionId,
  storefront,
  editing,
}: SectionRendererProps<ProductsContent>) {
  const text = storeText(theme)
  const products = (sectionId && storefront?.sectionProducts[sectionId]) || []
  const linkBase = storefront?.linkBase ?? ''
  const paths = storePaths(linkBase)
  const currencyCode = storefront?.currencyCode ?? 'BDT'

  const viewAllHref =
    content.source === 'category'
      ? (() => {
          const category = storefront?.categories.find(
            (candidate) => candidate.id === content.category
          )
          return category ? paths.category(category.handle) : paths.allProducts
        })()
      : content.source === 'collection'
        ? (() => {
            const collection = storefront?.collections.find(
              (candidate) => candidate.id === content.collection
            )
            return collection
              ? paths.collection(collection.handle)
              : paths.allProducts
          })()
        : paths.allProducts

  const labels = {
    add: content.addText,
    choose: content.chooseText,
    soldOut: content.soldOutText,
    sale: content.saleText,
  }

  const carousel = content.layout === 'carousel'

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <div className="mx-auto max-w-[var(--page-container-width)] px-4 py-12 sm:px-6 sm:py-16">
        {(content.title || content.subtitle || content.showViewAll) && (
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div className="flex max-w-2xl flex-col gap-2">
              {content.title && (
                <El
                  as="h2"
                  part="title"
                  html={content.title}
                  className="[font-family:var(--page-font-heading)] text-2xl [font-weight:var(--page-heading-weight)] tracking-tight sm:text-3xl"
                />
              )}
              {content.subtitle && (
                <El
                  as="p"
                  part="subtitle"
                  html={content.subtitle}
                  className="text-[15px] opacity-70"
                />
              )}
            </div>
            {content.showViewAll && products.length > 0 && (
              <El
                as="a"
                part="viewAll"
                href={viewAllHref}
                className="text-sm font-semibold underline-offset-4 hover:underline"
              >
                {content.viewAllText} →
              </El>
            )}
          </div>
        )}

        {products.length === 0 ? (
          editing || storefront?.catalogUnavailable ? (
            <El
              as="div"
              part="empty"
              className="rounded-[min(var(--page-radius),1rem)] border border-dashed border-[color-mix(in_oklab,var(--page-text)_22%,transparent)] px-6 py-14 text-center text-sm opacity-70"
            >
              {storefront?.catalogUnavailable
                ? text.words.productsBackSoon
                : editing
                  ? 'Products you choose will appear here. Pick where they come from on the right.'
                  : content.emptyText}
            </El>
          ) : null
        ) : (
          <El
            as="div"
            part="grid"
            className={cn(
              carousel
                ? '-mx-4 flex snap-x snap-mandatory scroll-px-4 [scrollbar-width:thin] gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:scroll-px-6 sm:gap-6 sm:px-6'
                : cn(
                    'grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3',
                    COLUMNS[content.columns]
                  )
            )}
          >
            {products.map((product, index) =>
              carousel ? (
                <div
                  key={product.id}
                  className={cn(
                    'w-[70%] shrink-0 snap-start sm:w-[calc((100%-3rem)/3)]',
                    CAROUSEL_WIDTH[content.columns]
                  )}
                >
                  <ProductCard
                    product={product}
                    index={index}
                    currencyCode={currencyCode}
                    linkBase={linkBase}
                    imageRatio={content.imageRatio}
                    showButton={content.showButton}
                    labels={labels}
                    text={text}
                  />
                </div>
              ) : (
                <ProductCard
                  key={product.id}
                  product={product}
                  index={index}
                  currencyCode={currencyCode}
                  linkBase={linkBase}
                  imageRatio={content.imageRatio}
                  showButton={content.showButton}
                  labels={labels}
                  text={text}
                />
              )
            )}
          </El>
        )}
        <Extras config={config} slot="content" />
      </div>
    </SectionWrapper>
  )
}

export const productsSection: SectionDefinition<ProductsContent> = {
  key: 'products',
  name: 'Product grid',
  category: 'Store',
  description:
    'Your products in a grid or a row — newest, a category, or ones you pick.',
  sites: ['STORE'],
  keywords: [
    'products',
    'featured',
    'best sellers',
    'new arrivals',
    'carousel',
    'collection',
  ],
  schema: productsContentSchema,
  defaultContent: productsDefaultContent,
  translations: {
    bn: {
      title: 'বাছাই করা পণ্য',
      viewAllText: 'সব দেখুন',
      addText: 'কার্টে যোগ করুন',
      chooseText: 'অপশন বেছে নিন',
      soldOutText: 'স্টক নেই',
      saleText: 'অফার',
      emptyText: 'নতুন পণ্য শীঘ্রই আসছে।',
    },
  },
  productQuery: (content) => ({
    source: content.source,
    categoryId: content.category || null,
    collectionId: content.collection || null,
    productIds: content.products,
    limit: content.limit,
  }),
  editorFields: [
    { type: 'richtext', name: 'title', label: 'Heading' },
    { type: 'richtext', name: 'subtitle', label: 'Text under the heading' },
    {
      type: 'select',
      name: 'source',
      label: 'Which products',
      options: [
        { value: 'newest', label: 'My newest products' },
        { value: 'category', label: 'From a category' },
        { value: 'collection', label: 'From a collection' },
        { value: 'picked', label: 'Ones I choose' },
      ],
    },
    {
      type: 'category',
      name: 'category',
      label: 'Category',
      showWhen: { field: 'source', equals: 'category' },
    },
    {
      type: 'collection',
      name: 'collection',
      label: 'Collection',
      showWhen: { field: 'source', equals: 'collection' },
    },
    {
      type: 'products',
      name: 'products',
      label: 'Products',
      max: 24,
      showWhen: { field: 'source', equals: 'picked' },
    },
    {
      type: 'number',
      name: 'limit',
      label: 'How many to show',
      min: 1,
      max: 24,
    },
    { type: 'heading', name: 'layoutHeading', label: 'Layout' },
    {
      type: 'select',
      name: 'layout',
      label: 'Show as',
      options: [
        { value: 'grid', label: 'A grid' },
        { value: 'carousel', label: 'A row you can swipe' },
      ],
    },
    {
      type: 'select',
      name: 'columns',
      label: 'Products per row on a computer',
      options: ['2', '3', '4', '5'],
      description:
        'Phones always show two, so each product stays big enough to tap.',
    },
    {
      type: 'select',
      name: 'imageRatio',
      label: 'Photo shape',
      options: [
        { value: 'portrait', label: 'Tall (clothing)' },
        { value: 'square', label: 'Square' },
        { value: 'landscape', label: 'Wide' },
      ],
    },
    {
      type: 'boolean',
      name: 'showButton',
      label: 'Show an “Add to cart” button',
    },
    { type: 'boolean', name: 'showViewAll', label: 'Show a “View all” link' },
    { type: 'heading', name: 'wordsHeading', label: 'Words' },
    {
      type: 'text',
      name: 'viewAllText',
      label: '“View all” link',
      showWhen: { field: 'showViewAll', equals: true },
    },
    { type: 'text', name: 'addText', label: 'Add to cart button' },
    { type: 'text', name: 'chooseText', label: 'Button when there are sizes' },
    { type: 'text', name: 'soldOutText', label: 'Sold out' },
    { type: 'text', name: 'saleText', label: 'Sale badge' },
    { type: 'text', name: 'emptyText', label: 'When there is nothing to show' },
  ],
  elements: [
    { key: 'title', label: 'Heading', kind: 'heading', contentField: 'title' },
    { key: 'subtitle', label: 'Text', kind: 'text', contentField: 'subtitle' },
    { key: 'viewAll', label: 'View all link', kind: 'text' },
    { key: 'grid', label: 'Product grid', kind: 'container' },
    { key: 'empty', label: 'Empty message', kind: 'text' },
    { key: 'card', label: 'Product card', kind: 'container', repeated: true },
    { key: 'cardImage', label: 'Product photo', kind: 'image', repeated: true },
    { key: 'cardBadge', label: 'Sale badge', kind: 'text', repeated: true },
    { key: 'cardTitle', label: 'Product name', kind: 'text', repeated: true },
    { key: 'cardPrice', label: 'Price', kind: 'text', repeated: true },
    { key: 'cardButton', label: 'Card button', kind: 'button', repeated: true },
  ],
  slots: [{ key: 'content', label: 'Under the products' }],
  Renderer: ProductsRenderer,
}
