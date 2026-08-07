import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionContainer, SectionWrapper, PageHeading } from '../primitives'

export const contactContentSchema = z.object({
  heading: z.string().max(150).optional(),
  subheading: z.string().max(300).optional(),
  email: z.string().max(200).optional(),
  phone: z.string().max(60).optional(),
  address: z.string().max(300).optional(),
})

export type ContactContent = z.infer<typeof contactContentSchema>

export const contactDefaultContent: ContactContent = {
  heading: 'Get in touch',
  subheading: "We'd love to hear from you.",
  email: 'hello@example.com',
  phone: '',
  address: '',
}

function ContactRenderer({
  content,
  config,
}: SectionRendererProps<ContactContent>) {
  return (
    <SectionWrapper config={config}>
      <SectionContainer className="max-w-xl">
        {content.heading && (
          <PageHeading className="text-3xl">{content.heading}</PageHeading>
        )}
        {content.subheading && (
          <p className="mt-3 opacity-80">{content.subheading}</p>
        )}
        <dl className="mt-6 space-y-2 text-sm">
          {content.email && (
            <div className="flex gap-2">
              <dt className="opacity-60">Email</dt>
              <dd>
                <a
                  href={`mailto:${content.email}`}
                  className="underline underline-offset-4"
                >
                  {content.email}
                </a>
              </dd>
            </div>
          )}
          {content.phone && (
            <div className="flex gap-2">
              <dt className="opacity-60">Phone</dt>
              <dd>{content.phone}</dd>
            </div>
          )}
          {content.address && (
            <div className="flex gap-2">
              <dt className="opacity-60">Address</dt>
              <dd>{content.address}</dd>
            </div>
          )}
        </dl>
      </SectionContainer>
    </SectionWrapper>
  )
}

export const contactSection: SectionDefinition<ContactContent> = {
  key: 'contact',
  name: 'Contact',
  category: 'Conversion',
  schema: contactContentSchema,
  defaultContent: contactDefaultContent,
  Renderer: ContactRenderer,
}
