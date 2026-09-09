import { z } from 'zod'
import { Star } from 'lucide-react'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { BlockHeading, BlockSection, FillImg } from '../blockPrimitives'
import { El, Extras } from '../elements'

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
        <BlockHeading
          part="title"
          html={content.title}
          className="mb-8 text-center"
        />
        <El
          as="div"
          part="grid"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {items.map((it, i) => (
            <El
              key={i}
              as="div"
              part="card"
              index={i}
              className="rounded-xl border border-black/[0.07] bg-white/60 p-5"
            >
              <El as="div" part="stars" index={i} className="mb-3 flex gap-0.5">
                {Array.from({
                  length: Math.min(5, Math.max(1, Number(it.rating) || 5)),
                }).map((_, k) => (
                  <Star
                    key={k}
                    size={13}
                    className="fill-amber-400 text-amber-400"
                  />
                ))}
              </El>
              <El
                as="p"
                part="quote"
                index={i}
                html={it.text}
                className="text-[13px] leading-relaxed text-[color:var(--lp-text)]/75"
              />
              <El
                as="div"
                part="byline"
                index={i}
                className="mt-4 flex items-center gap-2.5"
              >
                {it.image ? (
                  <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full">
                    <FillImg part="avatar" index={i} src={it.image} />
                  </div>
                ) : (
                  // The initial stands in for a photo the merchant did not
                  // upload. It is the same element key either way, so styling
                  // "the avatar" reaches both and a card with a photo and a
                  // card without still match each other.
                  <El
                    as="div"
                    part="avatar"
                    index={i}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--lp-accent)] text-[11px] font-bold text-white"
                  >
                    {(it.name || '?').charAt(0).toUpperCase()}
                  </El>
                )}
                <El
                  as="p"
                  part="name"
                  index={i}
                  html={it.name || 'Verified buyer'}
                  className="text-[12px] font-medium text-[color:var(--lp-text)]"
                />
              </El>
            </El>
          ))}
        </El>
        <Extras config={config} slot="content" />
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
    { type: 'richtext', name: 'title', label: 'Heading' },
    {
      type: 'array',
      name: 'items',
      label: 'Reviews',
      itemFields: [
        { type: 'richtext', name: 'name', label: 'Name' },
        { type: 'richtext', name: 'text', label: 'Review', multiline: true },
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
  elements: [
    { key: 'title', label: 'Heading', kind: 'heading', contentField: 'title' },
    { key: 'grid', label: 'Grid', kind: 'container' },
    { key: 'card', label: 'Review card', kind: 'container', repeated: true },
    { key: 'stars', label: 'Stars', kind: 'icon', repeated: true },
    {
      key: 'quote',
      label: 'Review text',
      kind: 'text',
      repeated: true,
      contentField: 'items[].text',
    },
    { key: 'byline', label: 'Byline row', kind: 'container', repeated: true },
    { key: 'avatar', label: 'Avatar', kind: 'image', repeated: true },
    {
      key: 'name',
      label: 'Name',
      kind: 'text',
      repeated: true,
      contentField: 'items[].name',
    },
  ],
  slots: [{ key: 'content', label: 'Below the reviews' }],
  Renderer: TestimonialsRenderer,
}
