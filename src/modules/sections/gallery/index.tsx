import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionContainer, SectionWrapper, PageHeading } from '../primitives'

export const galleryContentSchema = z.object({
  heading: z.string().max(150).optional(),
  images: z
    .array(
      z.object({ url: z.string().min(1), alt: z.string().max(200).optional() })
    )
    .min(1)
    .max(20),
})

export type GalleryContent = z.infer<typeof galleryContentSchema>

export const galleryDefaultContent: GalleryContent = {
  heading: 'Gallery',
  images: [],
}

function GalleryRenderer({
  content,
  config,
}: SectionRendererProps<GalleryContent>) {
  if (content.images.length === 0) return null

  return (
    <SectionWrapper config={config}>
      <SectionContainer>
        {content.heading && (
          <PageHeading className="max-w-xl text-3xl">
            {content.heading}
          </PageHeading>
        )}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {content.images.map((image, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={image.url}
              alt={image.alt ?? ''}
              style={{ borderRadius: 'var(--page-radius)' }}
              className="aspect-square w-full object-cover"
            />
          ))}
        </div>
      </SectionContainer>
    </SectionWrapper>
  )
}

export const gallerySection: SectionDefinition<GalleryContent> = {
  key: 'gallery',
  name: 'Gallery',
  category: 'Content',
  schema: galleryContentSchema,
  defaultContent: galleryDefaultContent,
  Renderer: GalleryRenderer,
}
