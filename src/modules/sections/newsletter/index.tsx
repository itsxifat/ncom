import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import {
  SectionContainer,
  SectionWrapper,
  PageHeading,
  resolveButtonVariant,
} from '../primitives'

export const newsletterContentSchema = z.object({
  heading: z.string().min(1).max(150),
  subheading: z.string().max(300).optional(),
  placeholder: z.string().max(60).default('you@example.com'),
  ctaLabel: z.string().max(40).default('Subscribe'),
})

export type NewsletterContent = z.infer<typeof newsletterContentSchema>

export const newsletterDefaultContent: NewsletterContent = {
  heading: 'Get updates in your inbox',
  subheading: 'No spam. Unsubscribe anytime.',
  placeholder: 'you@example.com',
  ctaLabel: 'Subscribe',
}

function NewsletterRenderer({
  content,
  config,
  theme,
}: SectionRendererProps<NewsletterContent>) {
  const variant = resolveButtonVariant(theme.buttonStyle)

  return (
    <SectionWrapper config={{ alignment: 'center', ...config }}>
      <SectionContainer className="flex flex-col items-center">
        <PageHeading className="max-w-md text-3xl">
          {content.heading}
        </PageHeading>
        {content.subheading && (
          <p className="mt-3 max-w-sm opacity-80">{content.subheading}</p>
        )}
        {/* Presentational only — no email-capture provider is wired up yet. */}
        <div className="mt-6 flex w-full max-w-sm gap-2">
          <input
            type="email"
            placeholder={content.placeholder}
            disabled
            style={{ borderRadius: 'var(--page-radius)' }}
            className="min-w-0 flex-1 border border-[color-mix(in_oklab,var(--page-text)_20%,transparent)] bg-transparent px-4 py-2.5 text-sm placeholder:opacity-50"
          />
          <span
            style={{
              borderRadius: 'var(--page-radius)',
              backgroundColor:
                variant === 'solid' ? 'var(--page-primary)' : undefined,
              borderColor:
                variant !== 'solid' ? 'var(--page-primary)' : undefined,
              color: variant === 'solid' ? '#fff' : 'var(--page-primary)',
            }}
            className={
              'shrink-0 px-5 py-2.5 text-sm font-medium ' +
              (variant !== 'solid' ? 'border' : '')
            }
          >
            {content.ctaLabel}
          </span>
        </div>
      </SectionContainer>
    </SectionWrapper>
  )
}

export const newsletterSection: SectionDefinition<NewsletterContent> = {
  key: 'newsletter',
  name: 'Newsletter',
  category: 'Conversion',
  schema: newsletterContentSchema,
  defaultContent: newsletterDefaultContent,
  editorFields: [
    { type: 'text', name: 'heading', label: 'Heading' },
    { type: 'textarea', name: 'subheading', label: 'Subheading' },
    { type: 'text', name: 'placeholder', label: 'Input placeholder' },
    { type: 'text', name: 'ctaLabel', label: 'Button label' },
  ],
  Renderer: NewsletterRenderer,
}
