import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionContainer, SectionWrapper, PageHeading } from '../primitives'

export const textContentSchema = z.object({
  heading: z.string().max(150).optional(),
  body: z.string().min(1).max(4000),
})

export type TextContent = z.infer<typeof textContentSchema>

export const textDefaultContent: TextContent = {
  heading: 'A section heading',
  body: 'Write a paragraph or two here. This section is for longer-form copy — an introduction, a story, an explanation — anywhere a page needs to slow down and talk to the reader directly.',
}

function TextRenderer({ content, config }: SectionRendererProps<TextContent>) {
  return (
    <SectionWrapper config={config}>
      <SectionContainer className="max-w-2xl">
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
    { type: 'text', name: 'heading', label: 'Heading' },
    { type: 'textarea', name: 'body', label: 'Body' },
  ],
  Renderer: TextRenderer,
}
