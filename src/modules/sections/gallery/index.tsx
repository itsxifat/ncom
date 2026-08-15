import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { BlockHeading, BlockSection, FillImg } from '../blockPrimitives'
import { cn } from '@/lib/utils'

export const galleryContentSchema = z.object({
  title: z.string().max(200).default(''),
  columns: z.enum(['2', '3', '4']).default('3'),
  images: z
    .array(z.object({ image: z.string().default('') }))
    .max(24)
    .default([]),
})

export type GalleryContent = z.infer<typeof galleryContentSchema>

export const galleryDefaultContent: GalleryContent = galleryContentSchema.parse(
  {}
)

const COLS: Record<string, string> = {
  '2': 'grid-cols-2',
  '3': 'grid-cols-2 sm:grid-cols-3',
  '4': 'grid-cols-2 sm:grid-cols-4',
}

function GalleryRenderer({
  content,
  config,
}: SectionRendererProps<GalleryContent>) {
  const images = (content.images || []).filter((i) => i?.image)
  if (!images.length) return null

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <BlockSection className="py-10">
        <BlockHeading className="mb-6 text-center">
          {content.title}
        </BlockHeading>
        <div
          className={cn(
            'grid gap-3',
            COLS[String(content.columns)] || COLS['3']
          )}
        >
          {images.map((it, i) => (
            <div
              key={i}
              className="relative aspect-square overflow-hidden rounded-xl bg-black/5"
            >
              <FillImg src={it.image} />
            </div>
          ))}
        </div>
      </BlockSection>
    </SectionWrapper>
  )
}

export const gallerySection: SectionDefinition<GalleryContent> = {
  key: 'gallery',
  name: 'Gallery',
  category: 'Content',
  description: 'A grid of product or lifestyle photos.',
  schema: galleryContentSchema,
  defaultContent: galleryDefaultContent,
  editorFields: [
    { type: 'text', name: 'title', label: 'Heading' },
    {
      type: 'select',
      name: 'columns',
      label: 'Columns',
      options: ['2', '3', '4'],
    },
    {
      type: 'array',
      name: 'images',
      label: 'Images',
      // Tiles render in an `aspect-square` box with object-cover.
      itemFields: [{ type: 'image', name: 'image', label: 'Image', aspect: 1 }],
    },
  ],
  Renderer: GalleryRenderer,
}
