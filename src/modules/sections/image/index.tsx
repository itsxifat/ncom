import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionContainer, SectionWrapper } from '../primitives'

export const imageContentSchema = z.object({
  imageUrl: z.string().min(1),
  altText: z.string().max(200).optional(),
  caption: z.string().max(200).optional(),
})

export type ImageContent = z.infer<typeof imageContentSchema>

export const imageDefaultContent: ImageContent = {
  imageUrl: '',
  altText: '',
  caption: '',
}

function ImageRenderer({
  content,
  config,
}: SectionRendererProps<ImageContent>) {
  if (!content.imageUrl) return null

  return (
    <SectionWrapper config={config}>
      <SectionContainer>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={content.imageUrl}
          alt={content.altText ?? ''}
          className="w-full rounded-[var(--page-radius)]"
        />
        {content.caption && (
          <p className="mt-3 text-center text-sm opacity-60">
            {content.caption}
          </p>
        )}
      </SectionContainer>
    </SectionWrapper>
  )
}

export const imageSection: SectionDefinition<ImageContent> = {
  key: 'image',
  name: 'Image',
  category: 'Content',
  schema: imageContentSchema,
  defaultContent: imageDefaultContent,
  Renderer: ImageRenderer,
}
