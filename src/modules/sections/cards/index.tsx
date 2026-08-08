import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionContainer, SectionWrapper, PageHeading } from '../primitives'

export const cardsContentSchema = z.object({
  heading: z.string().max(150).optional(),
  items: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        description: z.string().max(300),
        imageUrl: z.string().optional(),
        href: z.string().optional(),
      })
    )
    .min(1)
    .max(12),
})

export type CardsContent = z.infer<typeof cardsContentSchema>

export const cardsDefaultContent: CardsContent = {
  heading: 'Browse by category',
  items: [
    { title: 'Card one', description: 'A short description of this item.' },
    { title: 'Card two', description: 'A short description of this item.' },
    { title: 'Card three', description: 'A short description of this item.' },
  ],
}

function CardsRenderer({
  content,
  config,
}: SectionRendererProps<CardsContent>) {
  return (
    <SectionWrapper config={config}>
      <SectionContainer>
        {content.heading && (
          <PageHeading className="max-w-xl text-3xl">
            {content.heading}
          </PageHeading>
        )}
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {content.items.map((item, i) => {
            const card = (
              <div
                style={{ borderRadius: 'var(--page-radius)' }}
                className="overflow-hidden border border-[color-mix(in_oklab,var(--page-text)_12%,transparent)]"
              >
                {item.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="aspect-video w-full object-cover"
                  />
                )}
                <div className="p-5">
                  <PageHeading as="h3" className="text-base">
                    {item.title}
                  </PageHeading>
                  <p className="mt-2 text-sm opacity-70">{item.description}</p>
                </div>
              </div>
            )
            return item.href ? (
              <a key={i} href={item.href}>
                {card}
              </a>
            ) : (
              <div key={i}>{card}</div>
            )
          })}
        </div>
      </SectionContainer>
    </SectionWrapper>
  )
}

export const cardsSection: SectionDefinition<CardsContent> = {
  key: 'cards',
  name: 'Cards',
  category: 'Content',
  schema: cardsContentSchema,
  defaultContent: cardsDefaultContent,
  editorFields: [
    { type: 'text', name: 'heading', label: 'Heading' },
    {
      type: 'array',
      name: 'items',
      label: 'Cards',
      itemFields: [
        { type: 'text', name: 'title', label: 'Title' },
        { type: 'textarea', name: 'description', label: 'Description' },
        { type: 'image', name: 'imageUrl', label: 'Image' },
        { type: 'text', name: 'href', label: 'Link' },
      ],
    },
  ],
  Renderer: CardsRenderer,
}
