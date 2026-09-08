import { z } from 'zod'
import { Check } from 'lucide-react'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { BlockHeading, BlockSection } from '../blockPrimitives'
import { El, Extras } from '../elements'

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
        <BlockHeading
          part="title"
          html={content.title}
          className="mb-8 text-center"
        />
        <El
          as="div"
          part="grid"
          className={
            isGrid
              ? 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3'
              : 'mx-auto max-w-2xl space-y-4'
          }
        >
          {items.map((item, index) => (
            // Every element inside a card carries the same key at every index,
            // so styling "the cards" is one edit. The index rides along in
            // `data-el-i` for the merchant who genuinely wants card three to
            // differ — same mechanism, one more attribute in the selector.
            <El
              key={index}
              as="div"
              part="card"
              index={index}
              className={
                isGrid
                  ? 'rounded-xl border border-black/[0.07] bg-white/60 p-5'
                  : 'flex items-start gap-3'
              }
            >
              <El
                as="span"
                part="icon"
                index={index}
                className="mb-3 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--lp-accent)]"
              >
                <Check size={13} strokeWidth={3} className="text-white" />
              </El>
              <div>
                {item.title && (
                  <El
                    as="p"
                    part="cardTitle"
                    index={index}
                    html={item.title}
                    className="text-[15px] font-semibold text-[color:var(--lp-text)]"
                  />
                )}
                {item.text && (
                  <El
                    as="p"
                    part="cardText"
                    index={index}
                    html={item.text}
                    className="mt-1 text-[13px] leading-relaxed text-[color:var(--lp-text)]/65"
                  />
                )}
              </div>
            </El>
          ))}
        </El>
        <Extras config={config} slot="content" />
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
    { type: 'richtext', name: 'title', label: 'Heading' },
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
        { type: 'richtext', name: 'title', label: 'Title' },
        {
          type: 'richtext',
          name: 'text',
          label: 'Description',
          multiline: true,
        },
      ],
    },
  ],
  elements: [
    { key: 'title', label: 'Heading', kind: 'heading', contentField: 'title' },
    { key: 'grid', label: 'Grid', kind: 'container' },
    { key: 'card', label: 'Card', kind: 'container', repeated: true },
    { key: 'icon', label: 'Tick', kind: 'icon', repeated: true },
    { key: 'cardTitle', label: 'Card title', kind: 'heading', repeated: true },
    { key: 'cardText', label: 'Card text', kind: 'text', repeated: true },
  ],
  slots: [{ key: 'content', label: 'Below the grid' }],
  Renderer: FeaturesRenderer,
}
