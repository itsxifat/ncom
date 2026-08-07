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
import { cn } from '@/lib/utils'

export const pricingContentSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  heading: z.string().max(150).optional(),
  plans: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        price: z.string().min(1).max(30),
        period: z.string().max(20).optional(),
        features: z.array(z.string().max(100)).max(12),
        ctaLabel: z.string().max(40).optional(),
        ctaHref: z.string().optional(),
        highlighted: z.boolean().default(false),
      })
    )
    .min(1)
    .max(4),
})

export type PricingContent = z.infer<typeof pricingContentSchema>

export const pricingDefaultContent: PricingContent = {
  eyebrow: 'Pricing',
  heading: 'Simple, transparent pricing',
  plans: [
    {
      name: 'Starter',
      price: '$0',
      period: '/mo',
      features: ['1 project', 'Basic sections', 'NCOM subdomain'],
      ctaLabel: 'Get started',
      ctaHref: '#',
      highlighted: false,
    },
    {
      name: 'Pro',
      price: '$29',
      period: '/mo',
      features: ['Unlimited projects', 'All sections', 'Custom domain'],
      ctaLabel: 'Get started',
      ctaHref: '#',
      highlighted: true,
    },
  ],
}

function PricingRenderer({
  content,
  config,
  theme,
}: SectionRendererProps<PricingContent>) {
  const variant = resolveButtonVariant(theme.buttonStyle)

  return (
    <SectionWrapper config={config}>
      <SectionContainer
        className={config?.alignment === 'center' ? undefined : 'text-center'}
      >
        {content.eyebrow && <PageEyebrow>{content.eyebrow}</PageEyebrow>}
        {content.heading && (
          <PageHeading className="mx-auto mt-3 max-w-xl text-3xl">
            {content.heading}
          </PageHeading>
        )}
        <div className="mx-auto mt-10 grid max-w-4xl gap-6 text-left sm:grid-cols-2">
          {content.plans.map((plan, i) => (
            <div
              key={i}
              style={{ borderRadius: 'var(--page-radius)' }}
              className={cn(
                'border p-6',
                plan.highlighted
                  ? 'border-[var(--page-primary)]'
                  : 'border-[color-mix(in_oklab,var(--page-text)_12%,transparent)]'
              )}
            >
              <PageHeading as="h3" className="text-lg">
                {plan.name}
              </PageHeading>
              <p className="mt-2">
                <span className="text-3xl font-semibold">{plan.price}</span>
                {plan.period && (
                  <span className="ml-1 text-sm opacity-60">{plan.period}</span>
                )}
              </p>
              <ul className="mt-4 space-y-2 text-sm opacity-80">
                {plan.features.map((feature, j) => (
                  <li key={j}>{feature}</li>
                ))}
              </ul>
              {plan.ctaLabel && (
                <PageButton
                  href={plan.ctaHref}
                  variant={plan.highlighted ? variant : 'outline'}
                  className="mt-6 w-full"
                >
                  {plan.ctaLabel}
                </PageButton>
              )}
            </div>
          ))}
        </div>
      </SectionContainer>
    </SectionWrapper>
  )
}

export const pricingSection: SectionDefinition<PricingContent> = {
  key: 'pricing',
  name: 'Pricing',
  category: 'Content',
  schema: pricingContentSchema,
  defaultContent: pricingDefaultContent,
  editorFields: [
    { type: 'text', name: 'eyebrow', label: 'Eyebrow' },
    { type: 'text', name: 'heading', label: 'Heading' },
    {
      type: 'array',
      name: 'plans',
      label: 'Plans',
      itemFields: [
        { type: 'text', name: 'name', label: 'Name' },
        { type: 'text', name: 'price', label: 'Price' },
        { type: 'text', name: 'period', label: 'Period (e.g. /mo)' },
        { type: 'stringArray', name: 'features', label: 'Features' },
        { type: 'text', name: 'ctaLabel', label: 'Button label' },
        { type: 'text', name: 'ctaHref', label: 'Button link' },
        { type: 'boolean', name: 'highlighted', label: 'Highlighted' },
      ],
    },
  ],
  Renderer: PricingRenderer,
}
