import { z } from 'zod'
import { Star } from 'lucide-react'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { BlockHeading, BlockSection, FillImg } from '../blockPrimitives'

export const testimonialsContentSchema = z.object({
  title: z.string().max(200).default('What customers say'),
  items: z
    .array(
      z.object({
        name: z.string().max(120).default(''),
        text: z.string().max(1000).default(''),
        rating: z.union([z.string(), z.number()]).default('5'),
        image: z.string().default(''),
      })
    )
    .max(30)
    .default([]),
})

export type TestimonialsContent = z.infer<typeof testimonialsContentSchema>

export const testimonialsDefaultContent: TestimonialsContent = {
  title: 'What customers say',
  items: [
    {
      name: 'Rahim',
      text: 'Exactly as shown. Fast delivery!',
      rating: '5',
      image: '',
    },
  ],
}

function TestimonialsRenderer({
  content,
  config,
}: SectionRendererProps<TestimonialsContent>) {
  const items = (content.items || []).filter((i) => i?.text)
  if (!items.length) return null

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <BlockSection className="py-12">
        <BlockHeading className="mb-8 text-center">
          {content.title}
        </BlockHeading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => (
            <div
              key={i}
              className="rounded-xl border border-black/[0.07] bg-white/60 p-5"
            >
              <div className="mb-3 flex gap-0.5">
                {Array.from({
                  length: Math.min(5, Math.max(1, Number(it.rating) || 5)),
                }).map((_, k) => (
                  <Star
                    key={k}
                    size={13}
                    className="fill-amber-400 text-amber-400"
                  />
                ))}
              </div>
              <p className="text-[13px] leading-relaxed text-[color:var(--lp-text)]/75">
                {it.text}
              </p>
              <div className="mt-4 flex items-center gap-2.5">
                {it.image ? (
                  <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full">
                    <FillImg src={it.image} />
                  </div>
                ) : (
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: 'var(--lp-accent)' }}
                  >
                    {(it.name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <p className="text-[12px] font-medium text-[color:var(--lp-text)]">
                  {it.name || 'Verified buyer'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </BlockSection>
    </SectionWrapper>
  )
}

export const testimonialsSection: SectionDefinition<TestimonialsContent> = {
  key: 'testimonials',
  name: 'Testimonials',
  category: 'Content',
  description: 'Customer reviews with star ratings.',
  schema: testimonialsContentSchema,
  defaultContent: testimonialsDefaultContent,
  editorFields: [
    { type: 'text', name: 'title', label: 'Heading' },
    {
      type: 'array',
      name: 'items',
      label: 'Reviews',
      itemFields: [
        { type: 'text', name: 'name', label: 'Name' },
        { type: 'textarea', name: 'text', label: 'Review' },
        {
          type: 'select',
          name: 'rating',
          label: 'Stars',
          options: ['5', '4', '3', '2', '1'],
        },
        // Rendered as a round avatar, so the frame is square.
        { type: 'image', name: 'image', label: 'Photo', aspect: 1 },
      ],
    },
  ],
  Renderer: TestimonialsRenderer,
}
