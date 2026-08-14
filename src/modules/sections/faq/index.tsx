import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { BlockHeading, BlockSection } from '../blockPrimitives'
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
        <BlockHeading className="mb-6 text-center">
          {content.title}
        </BlockHeading>
        <FaqList items={items} />
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
    { type: 'text', name: 'title', label: 'Heading' },
    {
      type: 'array',
      name: 'items',
      label: 'Questions',
      itemFields: [
        { type: 'text', name: 'q', label: 'Question' },
        { type: 'textarea', name: 'a', label: 'Answer' },
      ],
    },
  ],
  Renderer: FaqRenderer,
}
