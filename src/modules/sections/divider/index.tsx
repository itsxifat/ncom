import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { SPACING } from '../blockPrimitives'
import { El, Extras } from '../elements'

export const dividerContentSchema = z.object({
  rule: z.boolean().default(true),
  size: z.enum(['small', 'medium', 'large']).default('medium'),
})

export type DividerContent = z.infer<typeof dividerContentSchema>

export const dividerDefaultContent: DividerContent = dividerContentSchema.parse(
  {}
)

function DividerRenderer({
  content,
  config,
}: SectionRendererProps<DividerContent>) {
  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <El
        as="div"
        part="space"
        className={SPACING[content.size] || SPACING.medium}
      >
        {content.rule !== false && (
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <El as="hr" part="rule" className="border-black/[0.08]" />
          </div>
        )}
        <Extras config={config} slot="content" />
      </El>
    </SectionWrapper>
  )
}

export const dividerSection: SectionDefinition<DividerContent> = {
  key: 'divider',
  name: 'Divider',
  category: 'Layout',
  description: 'Whitespace or a horizontal rule.',
  schema: dividerContentSchema,
  defaultContent: dividerDefaultContent,
  editorFields: [
    { type: 'boolean', name: 'rule', label: 'Show a line' },
    {
      type: 'select',
      name: 'size',
      label: 'Spacing',
      options: ['small', 'medium', 'large'],
    },
  ],
  elements: [
    { key: 'space', label: 'Spacing', kind: 'spacer', slot: true },
    { key: 'rule', label: 'Line', kind: 'divider' },
  ],
  slots: [{ key: 'content', label: 'Divider area' }],
  Renderer: DividerRenderer,
}
