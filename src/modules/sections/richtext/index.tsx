import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { BlockHeading, BlockSection } from '../blockPrimitives'
import { El, Extras } from '../elements'

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
  // A blank line starts a new paragraph. Still the split, now that the body
  // carries formatting: bold and colour are inline decisions inside a
  // paragraph, and where one paragraph ends is a structural one the merchant
  // makes the same way they always have — by pressing return twice.
  const paragraphs = String(content.body || '')
    .split(/\n{2,}/)
    .filter(Boolean)

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <BlockSection className="py-10">
        <El
          as="div"
          part="column"
          className={
            content.align === 'center' ? 'mx-auto max-w-2xl text-center' : ''
          }
        >
          <BlockHeading part="title" html={content.title} className="mb-4" />
          {paragraphs.map((paragraph, index) => (
            <El
              key={index}
              as="p"
              part="body"
              index={index}
              html={paragraph}
              className="mb-3 text-[15px] leading-relaxed whitespace-pre-line text-[color:var(--lp-text)]/75"
            />
          ))}
          <Extras config={config} slot="content" />
        </El>
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
    { type: 'richtext', name: 'title', label: 'Heading' },
    { type: 'richtext', name: 'body', label: 'Body', multiline: true },
    {
      type: 'select',
      name: 'align',
      label: 'Alignment',
      options: ['left', 'center'],
    },
  ],
  elements: [
    { key: 'column', label: 'Text column', kind: 'container', slot: true },
    { key: 'title', label: 'Heading', kind: 'heading', contentField: 'title' },
    // No `contentField`. The paragraphs are a split of one body field on
    // blank lines, so there is no path that addresses the third one — writing
    // to `body` from a paragraph would replace the whole block's copy with
    // that paragraph. The body is edited as a whole, in the Content tab.
    { key: 'body', label: 'Paragraph', kind: 'text', repeated: true },
  ],
  slots: [{ key: 'content', label: 'Text column' }],
  Renderer: RichtextRenderer,
}
