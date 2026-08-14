import { z } from 'zod'
import { Check } from 'lucide-react'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { BlockSection } from '../blockPrimitives'

export const trustContentSchema = z.object({
  items: z
    .array(z.object({ text: z.string().max(120).default('') }))
    .max(12)
    .default([]),
})

export type TrustContent = z.infer<typeof trustContentSchema>

export const trustDefaultContent: TrustContent = {
  items: [
    { text: 'Cash on delivery' },
    { text: '7-day easy return' },
    { text: 'Delivery all over Bangladesh' },
  ],
}

function TrustRenderer({
  content,
  config,
}: SectionRendererProps<TrustContent>) {
  const items = (content.items || []).filter((i) => i?.text)
  if (!items.length) return null

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <BlockSection className="py-6">
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
          {items.map((it, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-[13px] text-[color:var(--lp-text)]/70"
            >
              <Check
                size={15}
                strokeWidth={2.5}
                style={{ color: 'var(--lp-accent)' }}
              />
              {it.text}
            </div>
          ))}
        </div>
      </BlockSection>
    </SectionWrapper>
  )
}

export const trustSection: SectionDefinition<TrustContent> = {
  key: 'trust',
  name: 'Trust badges',
  category: 'Content',
  description: 'A strip of reassurance points (delivery, returns, COD).',
  schema: trustContentSchema,
  defaultContent: trustDefaultContent,
  editorFields: [
    {
      type: 'array',
      name: 'items',
      label: 'Badges',
      itemFields: [{ type: 'text', name: 'text', label: 'Text' }],
    },
  ],
  Renderer: TrustRenderer,
}
