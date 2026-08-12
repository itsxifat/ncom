import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionContainer, SectionWrapper, PageHeading } from '../primitives'
import { cn } from '@/lib/utils'

export const faqContentSchema = z.object({
  /** Design options; optional so older saved sections render unchanged. */
  listStyle: z.string().max(20).optional(),
  density: z.string().max(20).optional(),
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

/**
 * How the list is framed. `divided` is the original hairline-separated look and
 * stays the default, so a page saved before this option existed is unchanged.
 */
function listWrapperClass(style: string | undefined): string {
  switch (style) {
    case 'cards':
      return 'flex flex-col gap-3'
    case 'bordered':
      return 'flex flex-col gap-3'
    case 'plain':
      return 'flex flex-col gap-1'
    default:
      return 'divide-y divide-[color-mix(in_oklab,var(--page-text)_12%,transparent)] border-t border-b border-[color-mix(in_oklab,var(--page-text)_12%,transparent)]'
  }
}

function listItemClass(style: string | undefined): string {
  switch (style) {
    case 'cards':
      return 'rounded-[var(--page-radius)] bg-[color-mix(in_oklab,var(--page-text)_4%,transparent)] px-4'
    case 'bordered':
      return 'rounded-[var(--page-radius)] border border-[color-mix(in_oklab,var(--page-text)_14%,transparent)] px-4'
    default:
      return ''
  }
}

function FaqRenderer({ content, config }: SectionRendererProps<FaqContent>) {
  return (
    <SectionWrapper config={config}>
      <SectionContainer className="max-w-2xl">
        {content.heading && (
          <PageHeading className="text-3xl">{content.heading}</PageHeading>
        )}
        <div className={cn('mt-8', listWrapperClass(content.listStyle))}>
          {content.items.map((item, i) => (
            <details
              key={i}
              className={cn('group py-4', listItemClass(content.listStyle))}
            >
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
  editorFields: [
    {
      type: 'select' as const,
      name: 'listStyle',
      label: 'List design',
      options: ['divided', 'cards', 'bordered', 'plain'],
    },
    {
      type: 'select' as const,
      name: 'density',
      label: 'Spacing',
      options: ['tight', 'snug', 'normal', 'loose'],
    },
    { type: 'text', name: 'heading', label: 'Heading' },
    {
      type: 'array',
      name: 'items',
      label: 'Questions',
      itemFields: [
        { type: 'text', name: 'question', label: 'Question' },
        { type: 'textarea', name: 'answer', label: 'Answer' },
      ],
    },
  ],
  Renderer: FaqRenderer,
}
