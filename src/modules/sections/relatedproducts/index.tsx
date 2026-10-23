import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { El, Extras } from '../elements'
import { cn } from '@/lib/utils'
import { ProductCard } from '@/modules/storefront/ProductCard'
import { storeText } from '@/modules/storefront/i18n'

export const relatedProductsContentSchema = z.object({
  title: z.string().max(200).default('You may also like'),
  limit: z.number().int().min(2).max(12).default(4),
  columns: z.enum(['2', '3', '4', '5']).default('4'),
  imageRatio: z.enum(['portrait', 'square', 'landscape']).default('portrait'),
  showButton: z.boolean().default(false),
})

export type RelatedProductsContent = z.infer<
  typeof relatedProductsContentSchema
>

export const relatedProductsDefaultContent: RelatedProductsContent =
  relatedProductsContentSchema.parse({})

const COLUMNS: Record<RelatedProductsContent['columns'], string> = {
  '2': 'lg:grid-cols-2',
  '3': 'lg:grid-cols-3',
  '4': 'lg:grid-cols-4',
  '5': 'lg:grid-cols-5',
}

/**
 * More from the same shelf, under a product.
 *
 * Products from the viewed product's own category first — "more like this" is
 * what the shopper is looking at — then the newest, so a product alone in its
 * category still gets a row. The page resolves which; this only draws them.
 */
function RelatedProductsRenderer({
  content,
  config,
  theme,
  sectionId,
  storefront,
  editing,
}: SectionRendererProps<RelatedProductsContent>) {
  const products = (sectionId && storefront?.sectionProducts[sectionId]) || []
  if (products.length === 0 && !editing) return null
  const text = storeText(theme)
  const labels = {
    add: text.words.addToCart,
    choose: text.words.chooseOptions,
    soldOut: text.words.soldOut,
    sale: text.words.sale,
  }

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <div className="mx-auto max-w-[var(--page-container-width)] px-4 py-12 sm:px-6 sm:py-16">
        {content.title && (
          <El
            as="h2"
            part="title"
            html={content.title}
            className="mb-8 [font-family:var(--page-font-heading)] text-2xl [font-weight:var(--page-heading-weight)] tracking-tight"
          />
        )}
        {products.length === 0 ? (
          <El
            as="div"
            part="grid"
            className="rounded-[min(var(--page-radius),1rem)] border border-dashed border-[color-mix(in_oklab,var(--page-text)_22%,transparent)] px-6 py-12 text-center text-sm opacity-70"
          >
            Products from the same category appear here.
          </El>
        ) : (
          <El
            as="div"
            part="grid"
            className={cn(
              'grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3',
              COLUMNS[content.columns]
            )}
          >
            {products.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                index={index}
                currencyCode={storefront?.currencyCode ?? 'BDT'}
                linkBase={storefront?.linkBase ?? ''}
                imageRatio={content.imageRatio}
                showButton={content.showButton}
                labels={labels}
                text={text}
              />
            ))}
          </El>
        )}
        <Extras config={config} slot="content" />
      </div>
    </SectionWrapper>
  )
}

export const relatedProductsSection: SectionDefinition<RelatedProductsContent> =
  {
    key: 'relatedproducts',
    name: 'Related products',
    category: 'Store',
    description: 'More from the same category, under a product.',
    sites: ['STORE'],
    pageRoles: ['PRODUCT'],
    keywords: ['you may also like', 'similar', 'recommendations'],
    schema: relatedProductsContentSchema,
    defaultContent: relatedProductsDefaultContent,
    translations: { bn: { title: 'আপনার আরও পছন্দ হতে পারে' } },
    productQuery: (content) => ({ source: 'related', limit: content.limit }),
    editorFields: [
      { type: 'richtext', name: 'title', label: 'Heading' },
      { type: 'number', name: 'limit', label: 'How many', min: 2, max: 12 },
      {
        type: 'select',
        name: 'columns',
        label: 'Products per row on a computer',
        options: ['2', '3', '4', '5'],
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
    ],
    elements: [
      {
        key: 'title',
        label: 'Heading',
        kind: 'heading',
        contentField: 'title',
      },
      { key: 'grid', label: 'Product grid', kind: 'container' },
      { key: 'card', label: 'Product card', kind: 'container', repeated: true },
      {
        key: 'cardImage',
        label: 'Product photo',
        kind: 'image',
        repeated: true,
      },
      { key: 'cardBadge', label: 'Sale badge', kind: 'text', repeated: true },
      { key: 'cardTitle', label: 'Product name', kind: 'text', repeated: true },
      { key: 'cardPrice', label: 'Price', kind: 'text', repeated: true },
      {
        key: 'cardButton',
        label: 'Card button',
        kind: 'button',
        repeated: true,
      },
    ],
    slots: [{ key: 'content', label: 'Under the products' }],
    Renderer: RelatedProductsRenderer,
  }
