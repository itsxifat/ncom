import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { El, Extras } from '../elements'
import { storePaths, type StoreCategory } from '../storefront'
import { cn } from '@/lib/utils'
import { storeText } from '@/modules/storefront/i18n'

const pickedSchema = z.object({
  category: z.string().max(200).default(''),
  /** A picture for this tile only, over the category's own. */
  image: z.string().default(''),
  /** A name for this tile only — "Sarees" where the category says "Saree". */
  label: z.string().max(60).default(''),
})

export const categoriesContentSchema = z.object({
  title: z.string().max(200).default('Shop by category'),
  subtitle: z.string().max(400).default(''),
  source: z.enum(['top', 'picked']).default('top'),
  picked: z.array(pickedSchema).max(12).default([]),
  style: z.enum(['tiles', 'circles', 'cards']).default('tiles'),
  columns: z.enum(['3', '4', '5', '6']).default('4'),
  limit: z.number().min(2).max(12).default(8),
  showCount: z.boolean().default(false),
  countSuffix: z.string().max(30).default('products'),
})

export type CategoriesContent = z.infer<typeof categoriesContentSchema>

export const categoriesDefaultContent: CategoriesContent =
  categoriesContentSchema.parse({})

// Literal class names, one per choice, because Tailwind only generates the
// classes it can find written out in the source.
const COLUMNS: Record<CategoriesContent['columns'], string> = {
  '3': 'lg:grid-cols-3',
  '4': 'lg:grid-cols-4',
  '5': 'lg:grid-cols-5',
  '6': 'lg:grid-cols-6',
}

interface Tile {
  category: StoreCategory
  name: string
  imageUrl: string | null
}

/**
 * The tiles that send a shopper into a part of the shop.
 *
 * By default it shows the merchant's top-level categories, so a shop that adds
 * a "Winter" category next month gets a "Winter" tile without anyone opening
 * the builder. A merchant who wants a particular four, in a particular order,
 * with their own photos, picks them instead.
 *
 * Names and pictures come from the categories themselves. That keeps one name
 * per category across the menu, the tiles and the category page, and a tile
 * that wants a different one sets it on the tile rather than renaming the
 * category everywhere.
 */
function CategoriesRenderer({
  content,
  config,
  theme,
  storefront,
  editing,
}: SectionRendererProps<CategoriesContent>) {
  const text = storeText(theme)
  const categories = storefront?.categories ?? []
  const linkBase = storefront?.linkBase ?? ''
  const paths = storePaths(linkBase)

  const tiles: Tile[] =
    content.source === 'picked'
      ? content.picked.flatMap((entry) => {
          const category = categories.find((c) => c.id === entry.category)
          if (!category) return []
          return [
            {
              category,
              name: entry.label.trim() || category.name,
              imageUrl: entry.image || category.imageUrl,
            },
          ]
        })
      : categories
          .filter((category) => !category.parentId)
          .slice(0, content.limit)
          .map((category) => ({
            category,
            name: category.name,
            imageUrl: category.imageUrl,
          }))

  // Nothing to show a shopper means nothing on the live page — an empty
  // "Shop by category" heading reads as a shop with no departments. In the
  // builder it stays, with a note saying where the tiles come from.
  if (tiles.length === 0 && !editing) return null

  const style = content.style
  const columns = COLUMNS[content.columns] ?? COLUMNS['4']

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <div className="mx-auto max-w-[var(--page-container-width)] px-4 py-12 sm:px-6 sm:py-16">
        {(content.title || content.subtitle) && (
          <div className="mb-8 flex flex-col gap-2">
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
                className="max-w-2xl text-[15px] text-[color-mix(in_oklab,var(--page-text)_68%,transparent)]"
              />
            )}
          </div>
        )}

        <El
          as="div"
          part="grid"
          className={cn(
            'grid gap-4 sm:gap-5',
            style === 'circles'
              ? 'grid-cols-3 sm:grid-cols-4'
              : 'grid-cols-2 sm:grid-cols-3',
            tiles.length > 0 && columns
          )}
        >
          {tiles.length === 0 ? (
            <div className="col-span-full rounded-2xl border-2 border-dashed border-[color-mix(in_oklab,currentColor_25%,transparent)] px-6 py-10 text-center">
              <p className="text-[13px] font-semibold opacity-75">
                Your categories will appear here.
              </p>
              <p className="mt-1 text-[12px] opacity-55">
                {content.source === 'picked'
                  ? 'Choose categories in the Content tab.'
                  : 'Add some under Products → Categories.'}{' '}
                This block is hidden on your live site until it has some.
              </p>
            </div>
          ) : (
            tiles.map((tile, index) => (
              <El
                key={tile.category.id}
                as="a"
                part="tile"
                index={index}
                href={paths.category(tile.category.handle)}
                className={cn(
                  'group/tile relative flex flex-col',
                  style === 'tiles' &&
                    'aspect-[4/5] justify-end overflow-hidden rounded-[min(var(--page-radius),1.25rem)] p-4 sm:p-5',
                  style === 'circles' && 'items-center gap-3 text-center',
                  style === 'cards' &&
                    'overflow-hidden rounded-[min(var(--page-radius),1rem)] border border-[color-mix(in_oklab,var(--page-text)_12%,transparent)] transition hover:shadow-md'
                )}
              >
                <TileImage tile={tile} index={index} style={style} />

                <div
                  className={cn(
                    'flex flex-col',
                    style === 'tiles' && 'relative gap-0.5 text-white',
                    style === 'cards' && 'gap-0.5 px-4 py-3'
                  )}
                >
                  <El
                    as="span"
                    part="tileName"
                    index={index}
                    className={cn(
                      'leading-snug font-semibold',
                      style === 'tiles'
                        ? '[font-family:var(--page-font-heading)] text-lg'
                        : 'text-[15px]'
                    )}
                  >
                    {tile.name}
                  </El>
                  {content.showCount && tile.category.productCount !== null && (
                    <El
                      as="span"
                      part="tileCount"
                      index={index}
                      className={cn(
                        'text-xs',
                        style === 'tiles'
                          ? 'text-white/80'
                          : 'text-[color-mix(in_oklab,var(--page-text)_60%,transparent)]'
                      )}
                    >
                      {text.number(tile.category.productCount)}{' '}
                      {content.countSuffix}
                    </El>
                  )}
                </div>
              </El>
            ))
          )}
        </El>
        <Extras config={config} slot="content" />
      </div>
    </SectionWrapper>
  )
}

/**
 * The picture on a tile, or the category's initial when it has none.
 *
 * A grid where three tiles have photos and one is blank looks broken; a soft
 * tile with a big letter looks deliberate, and is a nudge to add the photo.
 *
 * The shape — round, landscape, full-bleed — is on the picture element itself
 * rather than on a clipping wrapper around it, so when a merchant selects the
 * picture and changes its corners, the corners they see are the ones that
 * change.
 */
function TileImage({
  tile,
  index,
  style,
}: {
  tile: Tile
  index: number
  style: CategoriesContent['style']
}) {
  const shape = cn(
    'bg-[color-mix(in_oklab,var(--page-primary)_12%,var(--page-background))] transition duration-500',
    style === 'tiles' &&
      'absolute inset-0 size-full group-hover/tile:scale-[1.04]',
    style === 'circles' &&
      'aspect-square w-full rounded-full group-hover/tile:scale-[1.03]',
    style === 'cards' && 'aspect-[4/3] w-full group-hover/tile:scale-[1.03]'
  )

  return (
    <>
      {tile.imageUrl ? (
        <El
          as="img"
          part="tileImage"
          index={index}
          src={tile.imageUrl}
          alt=""
          loading="lazy"
          className={cn(shape, 'object-cover')}
        />
      ) : (
        <El
          as="div"
          part="tileImage"
          index={index}
          aria-hidden
          className={cn(
            shape,
            'flex items-center justify-center [font-family:var(--page-font-heading)] text-4xl [font-weight:var(--page-heading-weight)] text-[color-mix(in_oklab,var(--page-primary)_70%,var(--page-text))]'
          )}
        >
          {tile.name.trim().charAt(0).toUpperCase()}
        </El>
      )}
      {/* The name sits on the photo in the tiles style, so the bottom of the
          photo is darkened for it to stay readable on any picture. */}
      {style === 'tiles' && (
        <El
          as="div"
          part="tileShade"
          index={index}
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"
        />
      )}
    </>
  )
}

export const categoriesSection: SectionDefinition<CategoriesContent> = {
  key: 'categories',
  name: 'Shop by category',
  category: 'Store',
  description: 'Picture tiles that take shoppers straight into a category.',
  sites: ['STORE'],
  keywords: ['collections', 'departments', 'browse'],
  schema: categoriesContentSchema,
  defaultContent: categoriesDefaultContent,
  translations: {
    bn: { title: 'ক্যাটাগরি অনুযায়ী কিনুন', countSuffix: 'পণ্য' },
  },
  editorFields: [
    { type: 'richtext', name: 'title', label: 'Heading' },
    {
      type: 'richtext',
      name: 'subtitle',
      label: 'Text under the heading',
      multiline: true,
    },
    {
      type: 'select',
      name: 'source',
      label: 'Which categories',
      options: [
        { value: 'top', label: 'My top-level categories' },
        { value: 'picked', label: 'Categories I choose' },
      ],
    },
    {
      type: 'number',
      name: 'limit',
      label: 'How many to show',
      min: 2,
      max: 12,
      showWhen: { field: 'source', equals: 'top' },
    },
    {
      type: 'array',
      name: 'picked',
      label: 'Categories',
      showWhen: { field: 'source', equals: 'picked' },
      itemFields: [
        { type: 'category', name: 'category', label: 'Category' },
        {
          type: 'image',
          name: 'image',
          label: 'Picture',
          description: 'Optional. Leave empty to use the category’s own.',
        },
        {
          type: 'text',
          name: 'label',
          label: 'Name on the tile',
          placeholder: 'Leave empty to use the category name',
        },
      ],
    },
    {
      type: 'select',
      name: 'style',
      label: 'Look',
      options: [
        { value: 'tiles', label: 'Photo tiles' },
        { value: 'circles', label: 'Round images' },
        { value: 'cards', label: 'Cards with names under' },
      ],
    },
    {
      type: 'select',
      name: 'columns',
      label: 'Per row on a computer',
      options: ['3', '4', '5', '6'],
    },
    {
      type: 'boolean',
      name: 'showCount',
      label: 'Show how many products each has',
    },
    {
      type: 'text',
      name: 'countSuffix',
      label: 'Word after the number',
      placeholder: 'products',
      showWhen: { field: 'showCount', equals: true },
    },
  ],
  elements: [
    { key: 'title', label: 'Heading', kind: 'heading', contentField: 'title' },
    {
      key: 'subtitle',
      label: 'Text under the heading',
      kind: 'text',
      contentField: 'subtitle',
    },
    { key: 'grid', label: 'Grid', kind: 'container' },
    { key: 'tile', label: 'Category tile', kind: 'container', repeated: true },
    { key: 'tileImage', label: 'Tile picture', kind: 'image', repeated: true },
    {
      key: 'tileShade',
      label: 'Photo shade',
      kind: 'container',
      repeated: true,
    },
    { key: 'tileName', label: 'Category name', kind: 'text', repeated: true },
    {
      key: 'tileCount',
      label: 'Product count',
      kind: 'text',
      repeated: true,
    },
  ],
  slots: [{ key: 'content', label: 'Below the grid' }],
  Renderer: CategoriesRenderer,
}
