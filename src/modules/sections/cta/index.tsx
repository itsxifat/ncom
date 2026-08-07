import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import {
  SectionContainer,
  SectionWrapper,
  PageHeading,
  PageButton,
  resolveButtonVariant,
} from '../primitives'

export const ctaContentSchema = z.object({
  heading: z.string().min(1).max(150),
  subheading: z.string().max(300).optional(),
  ctaLabel: z.string().min(1).max(40),
  ctaHref: z.string().min(1),
})

export type CtaContent = z.infer<typeof ctaContentSchema>

export const ctaDefaultContent: CtaContent = {
  heading: 'Ready to get started?',
  subheading: 'Join today — no credit card required.',
  ctaLabel: 'Get started free',
  ctaHref: '#',
}

function CtaRenderer({
  content,
  config,
  theme,
}: SectionRendererProps<CtaContent>) {
  return (
    <SectionWrapper config={{ alignment: 'center', ...config }}>
      <SectionContainer className="flex flex-col items-center">
        <PageHeading className="max-w-xl text-3xl">
          {content.heading}
        </PageHeading>
        {content.subheading && (
          <p className="mt-3 max-w-md opacity-80">{content.subheading}</p>
        )}
        <PageButton
          href={content.ctaHref}
          variant={resolveButtonVariant(theme.buttonStyle)}
          className="mt-6"
        >
          {content.ctaLabel}
        </PageButton>
      </SectionContainer>
    </SectionWrapper>
  )
}

export const ctaSection: SectionDefinition<CtaContent> = {
  key: 'cta',
  name: 'Call to action',
  category: 'Structure',
  schema: ctaContentSchema,
  defaultContent: ctaDefaultContent,
  Renderer: CtaRenderer,
}
