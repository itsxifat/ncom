import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionContainer, SectionWrapper, PageHeading } from '../primitives'

export const faqContentSchema = z.object({
  heading: z.string().max(150).optional(),
  items: z
    .array(
      z.object({
        question: z.string().min(1).max(200),
        answer: z.string().min(1).max(1000),
      })
    )
    .min(1)
    .max(20),
})

export type FaqContent = z.infer<typeof faqContentSchema>

export const faqDefaultContent: FaqContent = {
  heading: 'Frequently asked questions',
  items: [
    {
      question: 'How does billing work?',
      answer: 'You are billed monthly, and can cancel anytime.',
    },
    {
      question: 'Can I use my own domain?',
      answer: 'Yes, custom domains are supported on paid plans.',
    },
  ],
}

function FaqRenderer({ content, config }: SectionRendererProps<FaqContent>) {
  return (
    <SectionWrapper config={config}>
      <SectionContainer className="max-w-2xl">
        {content.heading && (
          <PageHeading className="text-3xl">{content.heading}</PageHeading>
        )}
        <div className="mt-8 divide-y divide-[color-mix(in_oklab,var(--page-text)_12%,transparent)] border-t border-b border-[color-mix(in_oklab,var(--page-text)_12%,transparent)]">
          {content.items.map((item, i) => (
            <details key={i} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                {item.question}
                <span className="ml-4 opacity-50 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm opacity-70">{item.answer}</p>
            </details>
          ))}
        </div>
      </SectionContainer>
    </SectionWrapper>
  )
}

export const faqSection: SectionDefinition<FaqContent> = {
  key: 'faq',
  name: 'FAQ',
  category: 'Content',
  schema: faqContentSchema,
  defaultContent: faqDefaultContent,
  Renderer: FaqRenderer,
}
