import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { BlockHeading, BlockSection } from '../blockPrimitives'
import { Extras } from '../elements'
import { FaqList } from './FaqList'

export const faqContentSchema = z.object({
  title: z.string().max(200).default('Frequently asked questions'),
  items: z
    .array(
      z.object({
        q: z.string().max(300).default(''),
        a: z.string().max(2000).default(''),
      })
    )
    .max(40)
    .default([]),
})

export type FaqContent = z.infer<typeof faqContentSchema>

export const faqDefaultContent: FaqContent = {
  title: 'Frequently asked questions',
  items: [
    {
      q: 'How long does delivery take?',
      a: '2–3 days inside Dhaka, 3–5 days outside.',
    },
  ],
}

function FaqRenderer({ content, config }: SectionRendererProps<FaqContent>) {
  const items = (content.items || []).filter((i) => i?.q)
  if (!items.length) return null

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <BlockSection className="py-12">
        <BlockHeading
          part="title"
          html={content.title}
          className="mb-6 text-center"
        />
        <FaqList items={items} />
        <Extras config={config} slot="content" />
      </BlockSection>
    </SectionWrapper>
  )
}

export const faqSection: SectionDefinition<FaqContent> = {
  key: 'faq',
  name: 'FAQ',
  category: 'Content',
  description: 'Expandable questions and answers.',
  schema: faqContentSchema,
  defaultContent: faqDefaultContent,
  editorFields: [
    { type: 'richtext', name: 'title', label: 'Heading' },
    {
      type: 'array',
      name: 'items',
      label: 'Questions',
      itemFields: [
        { type: 'richtext', name: 'q', label: 'Question' },
        { type: 'richtext', name: 'a', label: 'Answer', multiline: true },
      ],
    },
  ],
  elements: [
    { key: 'title', label: 'Heading', kind: 'heading', contentField: 'title' },
    { key: 'list', label: 'Question list', kind: 'container' },
    { key: 'row', label: 'Question row', kind: 'container', repeated: true },
    {
      key: 'question',
      label: 'Question',
      kind: 'text',
      repeated: true,
      contentField: 'items[].q',
    },
    { key: 'chevron', label: 'Arrow', kind: 'icon', repeated: true },
    {
      key: 'answer',
      label: 'Answer',
      kind: 'text',
      repeated: true,
      contentField: 'items[].a',
    },
  ],
  slots: [{ key: 'content', label: 'Below the list' }],
  Renderer: FaqRenderer,
}
