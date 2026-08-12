import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionContainer, SectionWrapper, PageHeading } from '../primitives'

export const textContentSchema = z.object({
  /** Design option; optional so older saved sections render unchanged. */
  width: z.string().max(20).optional(),
  heading: z.string().max(150).optional(),
  body: z.string().min(1).max(4000),
})

export type TextContent = z.infer<typeof textContentSchema>

export const textDefaultContent: TextContent = {
  heading: 'A section heading',
  body: 'Write a paragraph or two here. This section is for longer-form copy — an introduction, a story, an explanation — anywhere a page needs to slow down and talk to the reader directly.',
}

/**
 * Column width. The historical value stays the default so an existing page is
 * unchanged; the other options are what make one section read as a dense sales
 * block and another as airy editorial.
 */
function widthClass(width: string | undefined, fallback: string): string {
  switch (width) {
    case 'narrow':
      return 'max-w-md'
    case 'medium':
      return 'max-w-2xl'
    case 'wide':
      return 'max-w-4xl'
    case 'full':
      return 'max-w-none'
    default:
      return fallback
  }
}

function TextRenderer({ content, config }: SectionRendererProps<TextContent>) {
  return (
    <SectionWrapper config={config}>
      <SectionContainer className={widthClass(content.width, 'max-w-2xl')}>
        {content.heading && (
          <PageHeading className="text-3xl">{content.heading}</PageHeading>
        )}
        <p className="mt-4 text-lg leading-relaxed whitespace-pre-line opacity-80">
          {content.body}
        </p>
      </SectionContainer>
    </SectionWrapper>
  )
}

export const textSection: SectionDefinition<TextContent> = {
  key: 'text',
  name: 'Text',
  category: 'Content',
  schema: textContentSchema,
  defaultContent: textDefaultContent,
  editorFields: [
    {
      type: 'select' as const,
      name: 'width',
      label: 'Content width',
      options: ['narrow', 'medium', 'wide', 'full'],
    },
    { type: 'text', name: 'heading', label: 'Heading' },
    { type: 'textarea', name: 'body', label: 'Body' },
  ],
  Renderer: TextRenderer,
}
