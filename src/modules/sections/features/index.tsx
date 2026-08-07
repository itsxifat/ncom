import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import {
  SectionContainer,
  SectionWrapper,
  PageHeading,
  PageEyebrow,
} from '../primitives'

export const featuresContentSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  heading: z.string().max(150).optional(),
  items: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        description: z.string().max(300),
      })
    )
    .min(1)
    .max(12),
})

export type FeaturesContent = z.infer<typeof featuresContentSchema>

export const featuresDefaultContent: FeaturesContent = {
  eyebrow: 'Features',
  heading: 'Everything you need',
  items: [
    { title: 'Fast', description: 'Ships in minutes, not weeks.' },
    {
      title: 'Flexible',
      description: 'Adjust every section to fit your brand.',
    },
    {
      title: 'Reliable',
      description: 'Built on infrastructure that scales with you.',
    },
  ],
}

function FeaturesRenderer({
  content,
  config,
}: SectionRendererProps<FeaturesContent>) {
  return (
    <SectionWrapper config={config}>
      <SectionContainer>
        {(content.eyebrow || content.heading) && (
          <div className="max-w-xl">
            {content.eyebrow && <PageEyebrow>{content.eyebrow}</PageEyebrow>}
            {content.heading && (
              <PageHeading className="mt-3 text-3xl">
                {content.heading}
              </PageHeading>
            )}
          </div>
        )}
        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {content.items.map((item, i) => (
            <div key={i}>
              <PageHeading as="h3" className="text-lg">
                {item.title}
              </PageHeading>
              <p className="mt-2 text-sm opacity-70">{item.description}</p>
            </div>
          ))}
        </div>
      </SectionContainer>
    </SectionWrapper>
  )
}

export const featuresSection: SectionDefinition<FeaturesContent> = {
  key: 'features',
  name: 'Features',
  category: 'Content',
  schema: featuresContentSchema,
  defaultContent: featuresDefaultContent,
  Renderer: FeaturesRenderer,
}
