import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { ALIGN, BlockSection } from '../blockPrimitives'
import { cn } from '@/lib/utils'

export const ctaContentSchema = z.object({
  text: z.string().max(120).default('Order now — cash on delivery'),
  note: z.string().max(200).default(''),
  align: z.enum(['left', 'center', 'right']).default('center'),
  size: z.enum(['medium', 'large']).default('large'),
  style: z.enum(['solid', 'outline']).default('solid'),
})

export type CtaContent = z.infer<typeof ctaContentSchema>

export const ctaDefaultContent: CtaContent = ctaContentSchema.parse({})

/**
 * A call-to-action that jumps to the order form.
 *
 * A page can carry as many of these as it likes — on a long lander the buyer
 * should never have to scroll back to find the one thing they came to do.
 */
function CtaRenderer({ content, config }: SectionRendererProps<CtaContent>) {
  if (!content.text) return null
  const big = content.size !== 'medium'
  const outline = content.style === 'outline'

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <BlockSection className="py-6">
        <div
          className={cn('flex flex-col', ALIGN[content.align] || ALIGN.center)}
        >
          <a
            href="#order"
            className={cn(
              'inline-flex w-fit items-center justify-center rounded-full font-semibold tracking-wide shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.99]',
              big ? 'px-9 py-4 text-[15px]' : 'px-6 py-2.5 text-[13px]'
            )}
            style={
              outline
                ? {
                    border: '2px solid var(--lp-accent)',
                    color: 'var(--lp-accent)',
                    background: 'transparent',
                  }
                : { background: 'var(--lp-accent)', color: '#fff' }
            }
          >
            {content.text}
          </a>
          {content.note && (
            <p className="mt-2.5 text-[12px] text-[color:var(--lp-text)]/55">
              {content.note}
            </p>
          )}
        </div>
      </BlockSection>
    </SectionWrapper>
  )
}

export const ctaSection: SectionDefinition<CtaContent> = {
  key: 'cta',
  name: 'Order button',
  category: 'Commerce',
  description:
    'A call-to-action button that jumps to the order form. Add as many as you like.',
  schema: ctaContentSchema,
  defaultContent: ctaDefaultContent,
  editorFields: [
    { type: 'text', name: 'text', label: 'Button text' },
    { type: 'text', name: 'note', label: 'Small note under the button' },
    {
      type: 'select',
      name: 'align',
      label: 'Alignment',
      options: ['left', 'center', 'right'],
    },
    {
      type: 'select',
      name: 'size',
      label: 'Size',
      options: ['medium', 'large'],
    },
    {
      type: 'select',
      name: 'style',
      label: 'Style',
      options: ['solid', 'outline'],
    },
  ],
  Renderer: CtaRenderer,
}
