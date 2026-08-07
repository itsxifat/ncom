import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import {
  SectionContainer,
  SectionWrapper,
  PageHeading,
  PageButton,
  resolveButtonVariant,
} from '../primitives'
import { cn } from '@/lib/utils'

export const imageTextContentSchema = z.object({
  imageUrl: z.string().min(1),
  altText: z.string().max(200).optional(),
  heading: z.string().min(1).max(150),
  body: z.string().max(1000),
  imagePosition: z.enum(['left', 'right']).default('left'),
  ctaLabel: z.string().max(40).optional(),
  ctaHref: z.string().optional(),
})

export type ImageTextContent = z.infer<typeof imageTextContentSchema>

export const imageTextDefaultContent: ImageTextContent = {
  imageUrl: '',
  altText: '',
  heading: 'A heading that pairs with the image',
  body: 'Explain the feature or idea the image illustrates, in two or three sentences.',
  imagePosition: 'left',
  ctaLabel: 'Learn more',
  ctaHref: '#',
}

function ImageTextRenderer({
  content,
  config,
  theme,
}: SectionRendererProps<ImageTextContent>) {
  return (
    <SectionWrapper config={config}>
      <SectionContainer
        className={cn(
          'grid items-center gap-10 sm:grid-cols-2',
          content.imagePosition === 'right' && 'sm:[&>*:first-child]:order-2'
        )}
      >
        <div>
          {content.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={content.imageUrl}
              alt={content.altText ?? ''}
              className="w-full rounded-[var(--page-radius)]"
            />
          ) : (
            <div className="aspect-4/3 rounded-[var(--page-radius)] bg-[color-mix(in_oklab,var(--page-text)_8%,transparent)]" />
          )}
        </div>
        <div>
          <PageHeading className="text-3xl">{content.heading}</PageHeading>
          {content.body && <p className="mt-4 opacity-80">{content.body}</p>}
          {content.ctaLabel && (
            <PageButton
              href={content.ctaHref}
              variant={resolveButtonVariant(theme.buttonStyle)}
              className="mt-6"
            >
              {content.ctaLabel}
            </PageButton>
          )}
        </div>
      </SectionContainer>
    </SectionWrapper>
  )
}

export const imageTextSection: SectionDefinition<ImageTextContent> = {
  key: 'image-text',
  name: 'Image + Text',
  category: 'Content',
  schema: imageTextContentSchema,
  defaultContent: imageTextDefaultContent,
  editorFields: [
    { type: 'text', name: 'imageUrl', label: 'Image URL' },
    { type: 'text', name: 'altText', label: 'Alt text' },
    { type: 'text', name: 'heading', label: 'Heading' },
    { type: 'textarea', name: 'body', label: 'Body' },
    {
      type: 'select',
      name: 'imagePosition',
      label: 'Image position',
      options: ['left', 'right'],
    },
    { type: 'text', name: 'ctaLabel', label: 'Button label' },
    { type: 'text', name: 'ctaHref', label: 'Button link' },
  ],
  Renderer: ImageTextRenderer,
}
