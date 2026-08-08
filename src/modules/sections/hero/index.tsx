import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import {
  SectionContainer,
  SectionWrapper,
  PageHeading,
  PageEyebrow,
  PageButton,
  resolveButtonVariant,
} from '../primitives'

export const heroContentSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().min(1).max(150),
  subheadline: z.string().max(300).optional(),
  primaryCtaLabel: z.string().max(40).optional(),
  primaryCtaHref: z.string().optional(),
  secondaryCtaLabel: z.string().max(40).optional(),
  secondaryCtaHref: z.string().optional(),
  imageUrl: z.string().optional(),
})

export type HeroContent = z.infer<typeof heroContentSchema>

export const heroDefaultContent: HeroContent = {
  eyebrow: 'New',
  headline: 'A headline that says what you do',
  subheadline: 'One or two sentences on the outcome your visitor gets.',
  primaryCtaLabel: 'Get started',
  primaryCtaHref: '#',
  secondaryCtaLabel: 'Learn more',
  secondaryCtaHref: '#',
}

function HeroRenderer({
  content,
  config,
  theme,
}: SectionRendererProps<HeroContent>) {
  const variant = resolveButtonVariant(theme.buttonStyle)

  return (
    <SectionWrapper config={config}>
      <SectionContainer
        className={
          config?.alignment === 'center'
            ? 'flex flex-col items-center'
            : undefined
        }
      >
        {content.imageUrl && (
          // Rendered content images: not a build-time Next.js optimization
          // target since the source can be any project's uploaded asset.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={content.imageUrl}
            alt=""
            className="mb-8 w-full max-w-3xl rounded-[var(--page-radius)]"
          />
        )}
        {content.eyebrow && <PageEyebrow>{content.eyebrow}</PageEyebrow>}
        <PageHeading as="h1" className="mt-4 max-w-2xl text-5xl leading-[1.05]">
          {content.headline}
        </PageHeading>
        {content.subheadline && (
          <p className="mt-6 max-w-xl text-lg opacity-80">
            {content.subheadline}
          </p>
        )}
        {(content.primaryCtaLabel || content.secondaryCtaLabel) && (
          <div className="mt-8 flex flex-wrap gap-3">
            {content.primaryCtaLabel && (
              <PageButton href={content.primaryCtaHref} variant={variant}>
                {content.primaryCtaLabel}
              </PageButton>
            )}
            {content.secondaryCtaLabel && (
              <PageButton href={content.secondaryCtaHref} variant="outline">
                {content.secondaryCtaLabel}
              </PageButton>
            )}
          </div>
        )}
      </SectionContainer>
    </SectionWrapper>
  )
}

export const heroSection: SectionDefinition<HeroContent> = {
  key: 'hero',
  name: 'Hero',
  category: 'Structure',
  schema: heroContentSchema,
  defaultContent: heroDefaultContent,
  editorFields: [
    { type: 'text', name: 'eyebrow', label: 'Eyebrow' },
    { type: 'text', name: 'headline', label: 'Headline' },
    { type: 'textarea', name: 'subheadline', label: 'Subheadline' },
    { type: 'text', name: 'primaryCtaLabel', label: 'Primary button label' },
    { type: 'text', name: 'primaryCtaHref', label: 'Primary button link' },
    {
      type: 'text',
      name: 'secondaryCtaLabel',
      label: 'Secondary button label',
    },
    { type: 'text', name: 'secondaryCtaHref', label: 'Secondary button link' },
    { type: 'image', name: 'imageUrl', label: 'Image' },
  ],
  Renderer: HeroRenderer,
}
