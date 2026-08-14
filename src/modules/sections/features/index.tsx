import { z } from 'zod'
import { Check } from 'lucide-react'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { BlockHeading, BlockSection } from '../blockPrimitives'

export const featuresContentSchema = z.object({
  title: z.string().max(200).default("Why you'll love it"),
  layout: z.enum(['grid', 'list']).default('grid'),
  items: z
    .array(
      z.object({
        title: z.string().max(150).default(''),
        text: z.string().max(600).default(''),
      })
    )
    .max(24)
    .default([]),
})

export type FeaturesContent = z.infer<typeof featuresContentSchema>

export const featuresDefaultContent: FeaturesContent = {
  title: "Why you'll love it",
  layout: 'grid',
  items: [
    {
      title: 'Premium fabric',
      text: 'Soft, breathable and built to last.',
    },
  ],
}

function FeaturesRenderer({
  content,
  config,
}: SectionRendererProps<FeaturesContent>) {
  const items = (content.items || []).filter((i) => i?.title || i?.text)
  if (!items.length) return null
  const isGrid = content.layout !== 'list'

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <BlockSection className="py-12">
        <BlockHeading className="mb-8 text-center">
          {content.title}
        </BlockHeading>
        <div
          className={
            isGrid
              ? 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3'
              : 'mx-auto max-w-2xl space-y-4'
          }
        >
          {items.map((it, i) => (
            <div
              key={i}
              className={
                isGrid
                  ? 'rounded-xl border border-black/[0.07] bg-white/60 p-5'
                  : 'flex items-start gap-3'
              }
            >
              <span
                className="mb-3 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
                style={{ background: 'var(--lp-accent)' }}
              >
                <Check size={13} strokeWidth={3} className="text-white" />
              </span>
              <div>
                {it.title && (
                  <p className="text-[15px] font-semibold text-[color:var(--lp-text)]">
                    {it.title}
                  </p>
                )}
                {it.text && (
                  <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--lp-text)]/65">
                    {it.text}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </BlockSection>
    </SectionWrapper>
  )
}

export const featuresSection: SectionDefinition<FeaturesContent> = {
  key: 'features',
  name: 'Features',
  category: 'Content',
  description: 'Selling points as a tick-list or icon grid.',
  schema: featuresContentSchema,
  defaultContent: featuresDefaultContent,
  editorFields: [
    { type: 'text', name: 'title', label: 'Heading' },
    {
      type: 'select',
      name: 'layout',
      label: 'Layout',
      options: ['grid', 'list'],
    },
    {
      type: 'array',
      name: 'items',
      label: 'Points',
      itemFields: [
        { type: 'text', name: 'title', label: 'Title' },
        { type: 'textarea', name: 'text', label: 'Description' },
      ],
    },
  ],
  Renderer: FeaturesRenderer,
}
