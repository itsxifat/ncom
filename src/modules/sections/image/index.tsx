import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionContainer, SectionWrapper } from '../primitives'
import { ratioClass, RATIO_OPTIONS } from '../variants'
import { cn } from '@/lib/utils'

export const imageContentSchema = z.object({
  /** Design options; optional so older saved sections render unchanged. */
  imageRatio: z.string().max(20).optional(),
  width: z.string().max(20).optional(),
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
      <SectionContainer
        className={
          content.width === 'narrow'
            ? 'max-w-2xl'
            : content.width === 'full'
              ? 'max-w-none px-0'
              : undefined
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={content.imageUrl}
          alt={content.altText ?? ''}
          className={cn(
            'w-full rounded-[var(--page-radius)] object-cover',
            ratioClass(content.imageRatio)
          )}
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
  editorFields: [
    {
      type: 'select',
      name: 'imageRatio',
      label: 'Image shape',
      options: [...RATIO_OPTIONS],
    },
    {
      type: 'select',
      name: 'width',
      label: 'Width',
      options: ['contained', 'narrow', 'full'],
    },
    { type: 'image', name: 'imageUrl', label: 'Image' },
    { type: 'text', name: 'altText', label: 'Alt text' },
    { type: 'text', name: 'caption', label: 'Caption' },
  ],
  Renderer: ImageRenderer,
}
