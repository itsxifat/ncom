import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { BlockHeading, BlockSection } from '../blockPrimitives'

export const richtextContentSchema = z.object({
  title: z.string().max(200).default(''),
  body: z.string().max(5000).default(''),
  align: z.enum(['left', 'center']).default('left'),
})

export type RichtextContent = z.infer<typeof richtextContentSchema>

export const richtextDefaultContent: RichtextContent =
  richtextContentSchema.parse({})

function RichtextRenderer({
  content,
  config,
}: SectionRendererProps<RichtextContent>) {
  // A blank line starts a new paragraph — the one piece of formatting a plain
  // textarea can express, and the only one merchants reach for.
  const paragraphs = String(content.body || '')
    .split(/\n{2,}/)
    .filter(Boolean)

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <BlockSection className="py-10">
        <div
          className={
            content.align === 'center' ? 'mx-auto max-w-2xl text-center' : ''
          }
        >
          <BlockHeading className="mb-4">{content.title}</BlockHeading>
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className="mb-3 text-[15px] leading-relaxed whitespace-pre-line text-[color:var(--lp-text)]/75"
            >
              {p}
            </p>
          ))}
        </div>
      </BlockSection>
    </SectionWrapper>
  )
}

export const richtextSection: SectionDefinition<RichtextContent> = {
  key: 'richtext',
  name: 'Text',
  category: 'Content',
  description: 'A heading and paragraphs of copy.',
  schema: richtextContentSchema,
  defaultContent: richtextDefaultContent,
  editorFields: [
    { type: 'text', name: 'title', label: 'Heading' },
    { type: 'textarea', name: 'body', label: 'Body' },
    {
      type: 'select',
      name: 'align',
      label: 'Alignment',
      options: ['left', 'center'],
    },
  ],
  Renderer: RichtextRenderer,
}
