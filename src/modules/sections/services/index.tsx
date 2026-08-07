import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionContainer, SectionWrapper, PageHeading } from '../primitives'

export const servicesContentSchema = z.object({
  heading: z.string().max(150).optional(),
  items: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        description: z.string().max(300),
        priceLabel: z.string().max(40).optional(),
      })
    )
    .min(1)
    .max(12),
})

export type ServicesContent = z.infer<typeof servicesContentSchema>

export const servicesDefaultContent: ServicesContent = {
  heading: 'What we offer',
  items: [
    {
      title: 'Consulting',
      description: 'Strategy and planning for your project.',
      priceLabel: 'From $500',
    },
    {
      title: 'Design',
      description: 'Interfaces that look and feel considered.',
      priceLabel: 'From $1,200',
    },
    {
      title: 'Development',
      description: 'Production-ready builds, start to finish.',
      priceLabel: 'From $2,500',
    },
  ],
}

function ServicesRenderer({
  content,
  config,
}: SectionRendererProps<ServicesContent>) {
  return (
    <SectionWrapper config={config}>
      <SectionContainer>
        {content.heading && (
          <PageHeading className="max-w-xl text-3xl">
            {content.heading}
          </PageHeading>
        )}
        <div className="mt-10 divide-y divide-[color-mix(in_oklab,var(--page-text)_12%,transparent)] border-t border-b border-[color-mix(in_oklab,var(--page-text)_12%,transparent)]">
          {content.items.map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-6 py-5"
            >
              <div>
                <PageHeading as="h3" className="text-lg">
                  {item.title}
                </PageHeading>
                <p className="mt-1 text-sm opacity-70">{item.description}</p>
              </div>
              {item.priceLabel && (
                <span className="shrink-0 text-sm font-medium opacity-80">
                  {item.priceLabel}
                </span>
              )}
            </div>
          ))}
        </div>
      </SectionContainer>
    </SectionWrapper>
  )
}

export const servicesSection: SectionDefinition<ServicesContent> = {
  key: 'services',
  name: 'Services',
  category: 'Content',
  schema: servicesContentSchema,
  defaultContent: servicesDefaultContent,
  Renderer: ServicesRenderer,
}
