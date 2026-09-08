import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { ALIGN, BlockSection } from '../blockPrimitives'
import { El, Extras } from '../elements'
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
        <El
          as="div"
          part="stack"
          className={cn('flex flex-col', ALIGN[content.align] || ALIGN.center)}
        >
          {/*
            Both looks are classes rather than an inline `style` object. An
            inline declaration outranks every selector, so the solid button's
            background would have beaten whatever colour the merchant chose for
            this element in the design panel.
          */}
          <El
            as="a"
            part="button"
            href="#order"
            html={content.text}
            className={cn(
              'inline-flex w-fit items-center justify-center rounded-full font-semibold tracking-wide shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.99]',
              big ? 'px-9 py-4 text-[15px]' : 'px-6 py-2.5 text-[13px]',
              outline
                ? 'border-2 border-[var(--lp-accent)] bg-transparent text-[color:var(--lp-accent)]'
                : 'bg-[var(--lp-accent)] text-white'
            )}
          />
          {content.note && (
            <El
              as="p"
              part="note"
              html={content.note}
              className="mt-2.5 text-[12px] text-[color:var(--lp-text)]/55"
            />
          )}
          <Extras config={config} slot="content" />
        </El>
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
    { type: 'richtext', name: 'text', label: 'Button text' },
    { type: 'richtext', name: 'note', label: 'Small note under the button' },
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
  elements: [
    { key: 'stack', label: 'Layout', kind: 'container', slot: true },
    { key: 'button', label: 'Button', kind: 'button', contentField: 'text' },
    { key: 'note', label: 'Note', kind: 'text', contentField: 'note' },
  ],
  slots: [{ key: 'content', label: 'Button area' }],
  Renderer: CtaRenderer,
}
