import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionContainer, SectionWrapper, PageHeading } from '../primitives'

export const statisticsContentSchema = z.object({
  heading: z.string().max(150).optional(),
  items: z
    .array(
      z.object({
        value: z.string().min(1).max(20),
        label: z.string().min(1).max(80),
      })
    )
    .min(1)
    .max(6),
})

export type StatisticsContent = z.infer<typeof statisticsContentSchema>

export const statisticsDefaultContent: StatisticsContent = {
  heading: 'By the numbers',
  items: [
    { value: '10k+', label: 'Pages published' },
    { value: '99.9%', label: 'Uptime' },
    { value: '4.9/5', label: 'Average rating' },
  ],
}

function StatisticsRenderer({
  content,
  config,
}: SectionRendererProps<StatisticsContent>) {
  return (
    <SectionWrapper config={config}>
      <SectionContainer>
        {content.heading && (
          <PageHeading className="max-w-xl text-3xl">
            {content.heading}
          </PageHeading>
        )}
        <div className="mt-10 grid grid-cols-2 gap-8 sm:grid-cols-3">
          {content.items.map((item, i) => (
            <div key={i}>
              <PageHeading as="h3" className="text-4xl">
                {item.value}
              </PageHeading>
              <p className="mt-1 text-sm opacity-70">{item.label}</p>
            </div>
          ))}
        </div>
      </SectionContainer>
    </SectionWrapper>
  )
}

export const statisticsSection: SectionDefinition<StatisticsContent> = {
  key: 'statistics',
  name: 'Statistics',
  category: 'Social proof',
  schema: statisticsContentSchema,
  defaultContent: statisticsDefaultContent,
  Renderer: StatisticsRenderer,
}
