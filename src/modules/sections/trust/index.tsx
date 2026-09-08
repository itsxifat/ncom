import { z } from 'zod'
import { Check } from 'lucide-react'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { BlockSection } from '../blockPrimitives'
import { El, Extras } from '../elements'

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
        <El
          as="div"
          part="strip"
          className="flex flex-wrap justify-center gap-x-8 gap-y-3"
        >
          {items.map((it, i) => (
            <El
              key={i}
              as="div"
              part="badge"
              index={i}
              className="flex items-center gap-2 text-[13px] text-[color:var(--lp-text)]/70"
            >
              <El
                as="span"
                part="tick"
                index={i}
                className="inline-flex text-[color:var(--lp-accent)]"
              >
                <Check size={15} strokeWidth={2.5} />
              </El>
              <El as="span" part="badgeText" index={i} html={it.text} />
            </El>
          ))}
          <Extras config={config} slot="content" />
        </El>
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
      itemFields: [{ type: 'richtext', name: 'text', label: 'Text' }],
    },
  ],
  elements: [
    { key: 'strip', label: 'Badge strip', kind: 'container', slot: true },
    { key: 'badge', label: 'Badge', kind: 'container', repeated: true },
    { key: 'tick', label: 'Tick', kind: 'icon', repeated: true },
    { key: 'badgeText', label: 'Badge text', kind: 'text', repeated: true },
  ],
  slots: [{ key: 'content', label: 'Badge strip' }],
  Renderer: TrustRenderer,
}
