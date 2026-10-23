import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { FillImg } from '../blockPrimitives'
import { El, Extras } from '../elements'
import { safeHref } from '../sanitizeHtml'
import { storeHref } from '../storefront'
import { cn } from '@/lib/utils'

const tileSchema = z.object({
  image: z.string().default(''),
  eyebrow: z.string().max(120).default(''),
  title: z.string().max(200).default(''),
  buttonText: z.string().max(80).default('Shop now'),
  href: z.string().max(500).default('/products'),
  tone: z.enum(['light', 'dark']).default('light'),
})

export const promosContentSchema = z.object({
  tiles: z
    .array(tileSchema)
    .max(4)
    .default([
      {
        image: '',
        eyebrow: 'Men',
        title: 'Shop the edit',
        buttonText: 'Shop now',
        href: '/products',
        tone: 'light',
      },
      {
        image: '',
        eyebrow: 'Women',
        title: 'New arrivals',
        buttonText: 'Shop now',
        href: '/products',
        tone: 'dark',
      },
    ]),
  layout: z.enum(['auto', 'stacked']).default('auto'),
  height: z.enum(['small', 'medium', 'large']).default('medium'),
})

export type PromosContent = z.infer<typeof promosContentSchema>

export const promosDefaultContent: PromosContent = promosContentSchema.parse({})

const HEIGHTS: Record<PromosContent['height'], string> = {
  small: 'min-h-[200px] sm:min-h-[240px]',
  medium: 'min-h-[260px] sm:min-h-[340px]',
  large: 'min-h-[320px] sm:min-h-[440px]',
}

/** Side by side, as many to a row as there are tiles — up to a point. */
const SIDE_BY_SIDE: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
}

/**
 * What a tile with no picture is painted with, per tone.
 *
 * Light text needs a deep background and dark text a pale one, so the wash is
 * chosen by the tone the merchant set, and varied by position so two empty
 * tiles side by side do not read as one long banner.
 */
const FALLBACKS: Record<PromosContent['tiles'][number]['tone'], string[]> = {
  light: [
    'bg-[linear-gradient(135deg,var(--page-primary)_0%,color-mix(in_oklab,var(--page-primary)_62%,var(--page-text))_100%)]',
    'bg-[linear-gradient(160deg,color-mix(in_oklab,var(--page-primary)_75%,var(--page-text))_0%,var(--page-primary)_100%)]',
  ],
  dark: [
    'bg-[linear-gradient(135deg,color-mix(in_oklab,var(--page-primary)_20%,var(--page-background))_0%,color-mix(in_oklab,var(--page-primary)_6%,var(--page-background))_100%)]',
    'bg-[linear-gradient(160deg,color-mix(in_oklab,var(--page-text)_6%,var(--page-background))_0%,color-mix(in_oklab,var(--page-primary)_16%,var(--page-background))_100%)]',
  ],
}

/**
 * Two to four big picture banners side by side — "Men" and "Women", "New in"
 * and "Sale", this week's offer beside the bestsellers.
 *
 * Each tile is one link, so a shopper can tap anywhere on it rather than
 * hunting for the button; the button is there to say what tapping does. Light
 * text sits on a darkened photo and dark text on a bare one, which is the one
 * thing a merchant has to decide per tile: it depends on the photo they chose.
 */
function PromosRenderer({
  content,
  config,
  storefront,
  editing,
}: SectionRendererProps<PromosContent>) {
  const tiles = content.tiles
  if (tiles.length === 0 && !editing) return null

  const linkBase = storefront?.linkBase ?? ''
  const height = HEIGHTS[content.height] ?? HEIGHTS.medium

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <div className="mx-auto max-w-[var(--page-container-width)] px-4 py-8 sm:px-6 sm:py-12">
        <El
          as="div"
          part="grid"
          className={cn(
            'grid gap-4 sm:gap-5',
            content.layout === 'stacked'
              ? 'grid-cols-1'
              : (SIDE_BY_SIDE[Math.min(tiles.length, 4)] ?? SIDE_BY_SIDE[2])
          )}
        >
          {tiles.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-[color-mix(in_oklab,currentColor_25%,transparent)] px-6 py-10 text-center">
              <p className="text-[13px] font-semibold opacity-75">
                Promo banners — no banners yet
              </p>
              <p className="mt-1 text-[12px] opacity-55">
                Add a banner in the Content tab. This block is hidden on your
                live site until it has one.
              </p>
            </div>
          ) : (
            tiles.map((tile, index) => {
              const light = tile.tone !== 'dark'
              const hasImage = Boolean(tile.image)
              const fallbacks = FALLBACKS[light ? 'light' : 'dark']
              const href =
                safeHref(storeHref(tile.href, linkBase)) ??
                storeHref('/', linkBase)

              return (
                <El
                  key={index}
                  as="a"
                  part="tile"
                  index={index}
                  href={href}
                  className={cn(
                    'group/tile relative flex flex-col justify-end overflow-hidden rounded-[min(var(--page-radius),1.25rem)] p-6 sm:p-8',
                    height,
                    !hasImage && fallbacks[index % fallbacks.length],
                    // On a brand wash the text takes the colour drawn for
                    // that brand colour; on a photo, plain white or near-black.
                    light
                      ? hasImage
                        ? 'text-white'
                        : 'text-[var(--page-on-primary)]'
                      : hasImage
                        ? 'text-neutral-900'
                        : 'text-[var(--page-text)]'
                  )}
                >
                  {hasImage && (
                    <>
                      <FillImg
                        part="image"
                        index={index}
                        src={tile.image}
                        loading="lazy"
                        className="transition duration-700 group-hover/tile:scale-[1.04]"
                      />
                      {light && (
                        <El
                          as="div"
                          part="overlay"
                          index={index}
                          aria-hidden
                          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"
                        />
                      )}
                    </>
                  )}

                  <div className="relative flex max-w-md flex-col items-start gap-2">
                    {tile.eyebrow && (
                      <El
                        as="p"
                        part="eyebrow"
                        index={index}
                        html={tile.eyebrow}
                        className="text-xs font-semibold tracking-[0.2em] uppercase opacity-85"
                      />
                    )}
                    {tile.title && (
                      <El
                        as="h3"
                        part="title"
                        index={index}
                        html={tile.title}
                        className="[font-family:var(--page-font-heading)] text-2xl leading-tight [font-weight:var(--page-heading-weight)] tracking-tight sm:text-3xl"
                      />
                    )}
                    {tile.buttonText && (
                      // A span, not a link: the whole tile already is one,
                      // and a link inside a link is two targets under one
                      // finger.
                      <El
                        as="span"
                        part="button"
                        index={index}
                        html={tile.buttonText}
                        className={cn(
                          'mt-2 inline-flex min-h-10 items-center justify-center rounded-[var(--page-radius)] px-6 text-sm font-semibold transition group-hover/tile:opacity-90',
                          light
                            ? 'bg-white text-neutral-900'
                            : 'bg-[var(--page-primary)] text-[var(--page-on-primary)]'
                        )}
                      />
                    )}
                  </div>
                </El>
              )
            })
          )}
        </El>
        <Extras config={config} slot="content" />
      </div>
    </SectionWrapper>
  )
}

export const promosSection: SectionDefinition<PromosContent> = {
  key: 'promos',
  name: 'Promo banners',
  category: 'Store',
  description: 'Two to four picture banners side by side, each one a link.',
  sites: ['STORE'],
  keywords: ['offer', 'banner', 'deal', 'sale', 'image with text'],
  schema: promosContentSchema,
  defaultContent: promosDefaultContent,
  translations: {
    bn: {
      tiles: [
        {
          image: '',
          eyebrow: 'ছেলেদের',
          title: 'বাছাই করা কালেকশন',
          buttonText: 'এখনই কিনুন',
          href: '/products',
          tone: 'light',
        },
        {
          image: '',
          eyebrow: 'মেয়েদের',
          title: 'নতুন এসেছে',
          buttonText: 'এখনই কিনুন',
          href: '/products',
          tone: 'dark',
        },
      ],
    },
  },
  editorFields: [
    {
      type: 'array',
      name: 'tiles',
      label: 'Banners',
      itemFields: [
        { type: 'image', name: 'image', label: 'Picture' },
        { type: 'richtext', name: 'eyebrow', label: 'Small text above' },
        { type: 'richtext', name: 'title', label: 'Headline' },
        { type: 'richtext', name: 'buttonText', label: 'Button text' },
        { type: 'link', name: 'href', label: 'Goes to' },
        {
          type: 'select',
          name: 'tone',
          label: 'Text colour',
          description:
            'Light text for dark pictures, dark text for light ones.',
          options: [
            { value: 'light', label: 'Light text' },
            { value: 'dark', label: 'Dark text' },
          ],
        },
      ],
    },
    {
      type: 'select',
      name: 'layout',
      label: 'Layout',
      options: [
        { value: 'auto', label: 'Fit them side by side' },
        { value: 'stacked', label: 'One per row' },
      ],
    },
    {
      type: 'select',
      name: 'height',
      label: 'Height',
      options: ['small', 'medium', 'large'],
    },
  ],
  elements: [
    { key: 'grid', label: 'Banner row', kind: 'container' },
    { key: 'tile', label: 'Banner', kind: 'container', repeated: true },
    { key: 'image', label: 'Picture', kind: 'image', repeated: true },
    {
      key: 'overlay',
      label: 'Picture shade',
      kind: 'container',
      repeated: true,
    },
    {
      key: 'eyebrow',
      label: 'Small text above',
      kind: 'text',
      repeated: true,
      contentField: 'tiles[].eyebrow',
    },
    {
      key: 'title',
      label: 'Headline',
      kind: 'heading',
      repeated: true,
      contentField: 'tiles[].title',
    },
    {
      key: 'button',
      label: 'Button',
      kind: 'button',
      repeated: true,
      contentField: 'tiles[].buttonText',
    },
  ],
  slots: [{ key: 'content', label: 'Below the banners' }],
  Renderer: PromosRenderer,
}
