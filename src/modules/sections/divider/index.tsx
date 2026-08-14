import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { SPACING } from '../blockPrimitives'

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
      <div className={SPACING[content.size] || SPACING.medium}>
        {content.rule !== false && (
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <hr className="border-black/[0.08]" />
          </div>
        )}
      </div>
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
  Renderer: DividerRenderer,
}
