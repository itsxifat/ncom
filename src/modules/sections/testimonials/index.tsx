import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionContainer, SectionWrapper, PageHeading } from '../primitives'

export const testimonialsContentSchema = z.object({
  heading: z.string().max(150).optional(),
  items: z
    .array(
      z.object({
        quote: z.string().min(1).max(500),
        authorName: z.string().min(1).max(80),
        authorRole: z.string().max(100).optional(),
        avatarUrl: z.string().optional(),
      })
    )
    .min(1)
    .max(9),
})

export type TestimonialsContent = z.infer<typeof testimonialsContentSchema>

export const testimonialsDefaultContent: TestimonialsContent = {
  heading: 'What people are saying',
  items: [
    {
      quote:
        'This made shipping our landing page take an afternoon instead of a month.',
      authorName: 'Jordan Lee',
      authorRole: 'Founder, Acme Co.',
    },
    {
      quote: 'The result looked like we hired a design agency.',
      authorName: 'Priya Shah',
      authorRole: 'Marketing Lead',
    },
  ],
}

function TestimonialsRenderer({
  content,
  config,
}: SectionRendererProps<TestimonialsContent>) {
  return (
    <SectionWrapper config={config}>
      <SectionContainer>
        {content.heading && (
          <PageHeading className="max-w-xl text-3xl">
            {content.heading}
          </PageHeading>
        )}
        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          {content.items.map((item, i) => (
            <figure key={i}>
              <blockquote className="text-lg leading-relaxed text-balance">
                “{item.quote}”
              </blockquote>
              <figcaption className="mt-4 flex items-center gap-3">
                {item.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.avatarUrl}
                    alt=""
                    className="size-9 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex size-9 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--page-text)_10%,transparent)] text-xs font-medium">
                    {item.authorName.slice(0, 1)}
                  </span>
                )}
                <div className="text-sm">
                  <p className="font-medium">{item.authorName}</p>
                  {item.authorRole && (
                    <p className="opacity-60">{item.authorRole}</p>
                  )}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </SectionContainer>
    </SectionWrapper>
  )
}

export const testimonialsSection: SectionDefinition<TestimonialsContent> = {
  key: 'testimonials',
  name: 'Testimonials',
  category: 'Social proof',
  schema: testimonialsContentSchema,
  defaultContent: testimonialsDefaultContent,
  editorFields: [
    { type: 'text', name: 'heading', label: 'Heading' },
    {
      type: 'array',
      name: 'items',
      label: 'Testimonials',
      itemFields: [
        { type: 'textarea', name: 'quote', label: 'Quote' },
        { type: 'text', name: 'authorName', label: 'Author name' },
        { type: 'text', name: 'authorRole', label: 'Author role' },
        { type: 'text', name: 'avatarUrl', label: 'Avatar URL' },
      ],
    },
  ],
  Renderer: TestimonialsRenderer,
}
