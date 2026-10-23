import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { El, Extras } from '../elements'
import { storePaths, type StoreListing } from '../storefront'
import { cn } from '@/lib/utils'
import { ProductCard } from '@/modules/storefront/ProductCard'
import { SortMenu } from './SortMenu'
import { storeText } from '@/modules/storefront/i18n'

export const productListingContentSchema = z.object({
  showBanner: z.boolean().default(true),
  showDescription: z.boolean().default(true),
  showSubcategories: z.boolean().default(true),
  showSort: z.boolean().default(true),
  showCount: z.boolean().default(true),
  columns: z.enum(['2', '3', '4', '5']).default('4'),
  imageRatio: z.enum(['portrait', 'square', 'landscape']).default('portrait'),
  perPage: z.number().int().min(4).max(60).default(24),
  showButton: z.boolean().default(true),
  countText: z.string().max(60).default('{count} products'),
  emptyText: z
    .string()
    .max(200)
    .default('Nothing here yet — have a look at everything else we sell.'),
  addText: z.string().max(40).default('Add to cart'),
  chooseText: z.string().max(40).default('Choose options'),
  soldOutText: z.string().max(40).default('Sold out'),
  saleText: z.string().max(20).default('Sale'),
})

export type ProductListingContent = z.infer<typeof productListingContentSchema>

export const productListingDefaultContent: ProductListingContent =
  productListingContentSchema.parse({})

const COLUMNS: Record<ProductListingContent['columns'], string> = {
  '2': 'lg:grid-cols-2',
  '3': 'lg:grid-cols-3',
  '4': 'lg:grid-cols-4',
  '5': 'lg:grid-cols-5',
}

/** The address of another page of the same list, keeping its sort and query. */
function pageHref(listing: StoreListing, linkBase: string, page: number) {
  const paths = storePaths(linkBase)
  const base =
    listing.kind === 'category' && listing.handle
      ? paths.category(listing.handle)
      : listing.kind === 'collection' && listing.handle
        ? paths.collection(listing.handle)
        : listing.kind === 'search'
          ? paths.search()
          : paths.allProducts
  const params = new URLSearchParams()
  if (listing.query) params.set('q', listing.query)
  if (listing.sort !== 'featured') params.set('sort', listing.sort)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `${base}?${query}` : base
}

/**
 * A list of products: a category, a collection, a search, the whole shop.
 *
 * The one block a store's catalogue page cannot do without. Every list on the
 * site is drawn by it, so a merchant designs "how my shop's shelves look" once
 * and every category follows. What it lists comes from the address; how many
 * per page comes from here (`perPage`), which the route reads before asking
 * the catalogue.
 */
function ProductListingRenderer({
  content,
  config,
  theme,
  storefront,
  editing,
}: SectionRendererProps<ProductListingContent>) {
  const listing = storefront?.listing
  const text = storeText(theme)
  if (!listing) {
    return editing ? (
      <SectionWrapper config={config} defaultPadding={false}>
        <El
          as="div"
          part="grid"
          className="mx-auto my-12 max-w-[var(--page-container-width)] px-6 py-16 text-center text-sm opacity-70"
        >
          Your products appear here, a category at a time.
        </El>
      </SectionWrapper>
    ) : null
  }

  const linkBase = storefront.linkBase
  const paths = storePaths(linkBase)
  const labels = {
    add: content.addText,
    choose: content.chooseText,
    soldOut: content.soldOutText,
    sale: content.saleText,
  }

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <div className="mx-auto max-w-[var(--page-container-width)] px-4 pt-8 pb-14 sm:px-6 sm:pt-12">
        <El as="header" part="header" className="mb-8 flex flex-col gap-4">
          {/* The category's picture sits beside its name. Category pictures
              are made for a category grid — square, cropped close — and a
              full-width banner cut from one is a blurry stripe of it. */}
          <div className="flex items-center gap-4 sm:gap-5">
            {content.showBanner && listing.imageUrl && (
              <El
                as="img"
                part="banner"
                src={listing.imageUrl}
                alt=""
                className="size-16 shrink-0 rounded-[min(var(--page-radius),1rem)] object-cover sm:size-20"
              />
            )}
            <div className="flex min-w-0 flex-col gap-2">
              <El
                as="h1"
                part="title"
                className="[font-family:var(--page-font-heading)] text-3xl [font-weight:var(--page-heading-weight)] tracking-tight sm:text-4xl"
              >
                {
                  // The shop-wide and search lists are named by NCOM, not by
                  // the merchant, so they are named in the shop's language.
                  listing.kind === 'all'
                    ? text.words.allProducts
                    : listing.kind === 'search'
                      ? listing.query
                        ? text.words.searchResults(listing.query)
                        : text.words.search
                      : listing.title
                }
              </El>
              {content.showDescription && listing.description && (
                <El
                  as="p"
                  part="description"
                  className="max-w-2xl text-[15px] leading-relaxed opacity-75"
                >
                  {listing.description}
                </El>
              )}
            </div>
          </div>
          {content.showSubcategories && listing.subcategories.length > 0 && (
            <El
              as="nav"
              part="subcategories"
              aria-label={text.words.narrowDown}
              className="flex flex-wrap gap-2"
            >
              {listing.subcategories.map((category, index) => (
                <El
                  key={category.id}
                  as="a"
                  part="subcategory"
                  index={index}
                  href={paths.category(category.handle)}
                  className="rounded-full border border-[color-mix(in_oklab,var(--page-text)_18%,transparent)] px-4 py-2 text-sm font-medium transition hover:border-[var(--page-text)]"
                >
                  {category.name}
                </El>
              ))}
            </El>
          )}
          {listing.kind === 'search' && (
            <form
              action={paths.search()}
              method="get"
              role="search"
              className="flex max-w-xl gap-2"
            >
              <input
                name="q"
                type="search"
                defaultValue={listing.query ?? ''}
                placeholder={text.words.searchProducts}
                className="h-11 min-w-0 flex-1 rounded-[min(var(--page-radius),0.75rem)] border border-[color-mix(in_oklab,var(--page-text)_18%,transparent)] bg-transparent px-4 text-[15px] outline-none focus:border-[var(--page-primary)]"
              />
              <button
                type="submit"
                className="h-11 rounded-[min(var(--page-radius),0.75rem)] bg-[var(--page-primary)] px-5 text-sm font-semibold text-[var(--page-on-primary)]"
              >
                {text.words.search}
              </button>
            </form>
          )}
        </El>

        {(content.showCount || content.showSort) &&
          listing.products.length > 0 && (
            <El
              as="div"
              part="toolbar"
              className="mb-6 flex items-center justify-between gap-4 border-b border-[color-mix(in_oklab,var(--page-text)_10%,transparent)] pb-4"
            >
              {content.showCount ? (
                <El as="p" part="count" className="text-sm opacity-70">
                  {content.countText.replace(
                    '{count}',
                    text.number(listing.total ?? listing.products.length)
                  )}
                </El>
              ) : (
                <span />
              )}
              {content.showSort && (
                <SortMenu sort={listing.sort} editing={editing} />
              )}
            </El>
          )}

        {listing.products.length === 0 ? (
          <El
            as="div"
            part="empty"
            className="flex flex-col items-center gap-4 rounded-[min(var(--page-radius),1rem)] bg-[color-mix(in_oklab,var(--page-text)_4%,var(--page-background))] px-6 py-16 text-center"
          >
            <p className="max-w-md text-[15px] opacity-75">
              {storefront.catalogUnavailable
                ? text.words.ourProductsBackSoon
                : content.emptyText}
            </p>
            <a
              href={paths.allProducts}
              className="rounded-[min(var(--page-radius),0.75rem)] bg-[var(--page-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--page-on-primary)]"
            >
              {text.words.seeAllProducts}
            </a>
          </El>
        ) : (
          <El
            as="div"
            part="grid"
            className={cn(
              'grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-x-6 md:grid-cols-3',
              COLUMNS[content.columns]
            )}
          >
            {listing.products.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                index={index}
                currencyCode={storefront.currencyCode}
                linkBase={linkBase}
                imageRatio={content.imageRatio}
                showButton={content.showButton}
                labels={labels}
                text={text}
              />
            ))}
          </El>
        )}

        {listing.pageCount > 1 && (
          <El
            as="nav"
            part="pagination"
            aria-label={text.words.pages}
            className="mt-12 flex flex-wrap items-center justify-center gap-2"
          >
            {Array.from({ length: listing.pageCount }, (_, i) => i + 1).map(
              (page) => (
                <El
                  key={page}
                  as="a"
                  part="pageLink"
                  index={page - 1}
                  href={pageHref(listing, linkBase, page)}
                  aria-current={page === listing.page ? 'page' : undefined}
                  className={cn(
                    'flex size-10 items-center justify-center rounded-full text-sm font-semibold transition',
                    page === listing.page
                      ? 'bg-[var(--page-text)] text-[var(--page-background)]'
                      : 'hover:bg-[color-mix(in_oklab,var(--page-text)_8%,transparent)]'
                  )}
                >
                  {text.number(page)}
                </El>
              )
            )}
          </El>
        )}
        <Extras config={config} slot="content" />
      </div>
    </SectionWrapper>
  )
}

export const productListingSection: SectionDefinition<ProductListingContent> = {
  key: 'productlisting',
  name: 'Product list',
  category: 'Store',
  description: 'The products in a category, a collection or a search.',
  sites: ['STORE'],
  pageRoles: ['CATALOG'],
  requiredOn: 'CATALOG',
  singleton: true,
  keywords: ['category', 'collection', 'shop', 'catalogue', 'search results'],
  schema: productListingContentSchema,
  defaultContent: productListingDefaultContent,
  translations: {
    bn: {
      countText: '{count}টি পণ্য',
      emptyText: 'এখানে এখনো কিছু নেই — আমাদের অন্য পণ্যগুলো দেখে নিন।',
      addText: 'কার্টে যোগ করুন',
      chooseText: 'অপশন বেছে নিন',
      soldOutText: 'স্টক নেই',
      saleText: 'অফার',
    },
  },
  editorFields: [
    {
      type: 'boolean',
      name: 'showBanner',
      label: 'Show the category’s picture',
    },
    {
      type: 'boolean',
      name: 'showDescription',
      label: 'Show the category’s description',
    },
    {
      type: 'boolean',
      name: 'showSubcategories',
      label: 'Show its subcategories',
    },
    { type: 'boolean', name: 'showSort', label: 'Let shoppers sort' },
    { type: 'boolean', name: 'showCount', label: 'Show how many products' },
    { type: 'heading', name: 'layoutHeading', label: 'Layout' },
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
      type: 'number',
      name: 'perPage',
      label: 'Products per page',
      min: 4,
      max: 60,
    },
    {
      type: 'boolean',
      name: 'showButton',
      label: 'Show an “Add to cart” button',
    },
    { type: 'heading', name: 'wordsHeading', label: 'Words' },
    {
      type: 'text',
      name: 'countText',
      label: 'Product count',
      description: '{count} becomes the number.',
    },
    { type: 'text', name: 'emptyText', label: 'When a category is empty' },
    { type: 'text', name: 'addText', label: 'Add to cart button' },
    { type: 'text', name: 'chooseText', label: 'Button when there are sizes' },
    { type: 'text', name: 'soldOutText', label: 'Sold out' },
    { type: 'text', name: 'saleText', label: 'Sale badge' },
  ],
  elements: [
    { key: 'header', label: 'Top of the list', kind: 'container' },
    { key: 'banner', label: 'Category picture', kind: 'image' },
    { key: 'title', label: 'Category name', kind: 'heading' },
    { key: 'description', label: 'Description', kind: 'text' },
    { key: 'subcategories', label: 'Subcategories', kind: 'container' },
    {
      key: 'subcategory',
      label: 'Subcategory',
      kind: 'button',
      repeated: true,
    },
    { key: 'toolbar', label: 'Sort bar', kind: 'container' },
    { key: 'count', label: 'Product count', kind: 'text' },
    { key: 'sort', label: 'Sort menu', kind: 'container' },
    { key: 'grid', label: 'Product grid', kind: 'container' },
    { key: 'empty', label: 'Empty message', kind: 'container' },
    { key: 'card', label: 'Product card', kind: 'container', repeated: true },
    { key: 'cardImage', label: 'Product photo', kind: 'image', repeated: true },
    { key: 'cardBadge', label: 'Sale badge', kind: 'text', repeated: true },
    { key: 'cardTitle', label: 'Product name', kind: 'text', repeated: true },
    { key: 'cardPrice', label: 'Price', kind: 'text', repeated: true },
    { key: 'cardButton', label: 'Card button', kind: 'button', repeated: true },
    { key: 'pagination', label: 'Page numbers', kind: 'container' },
    { key: 'pageLink', label: 'Page number', kind: 'button', repeated: true },
  ],
  slots: [{ key: 'content', label: 'Under the products' }],
  Renderer: ProductListingRenderer,
}
