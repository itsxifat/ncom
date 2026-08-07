import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionContainer } from '../primitives'

export const footerContentSchema = z.object({
  logoText: z.string().max(40).optional(),
  columns: z
    .array(
      z.object({
        title: z.string().min(1).max(40),
        links: z
          .array(
            z.object({
              label: z.string().min(1).max(40),
              href: z.string().min(1),
            })
          )
          .max(8),
      })
    )
    .max(5),
  bottomText: z.string().max(200).optional(),
})

export type FooterContent = z.infer<typeof footerContentSchema>

export const footerDefaultContent: FooterContent = {
  logoText: 'Your Brand',
  columns: [
    {
      title: 'Product',
      links: [
        { label: 'Features', href: '#' },
        { label: 'Pricing', href: '#' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'About', href: '#' },
        { label: 'Contact', href: '#' },
      ],
    },
  ],
  bottomText: `© ${new Date().getFullYear()} Your Brand. All rights reserved.`,
}

function FooterRenderer({ content }: SectionRendererProps<FooterContent>) {
  return (
    <footer className="border-t border-[color-mix(in_oklab,var(--page-text)_12%,transparent)]">
      <SectionContainer className="py-12">
        <div className="flex flex-wrap justify-between gap-10">
          {content.logoText && (
            <span
              style={{ fontFamily: 'var(--page-font-heading)' }}
              className="text-lg font-semibold"
            >
              {content.logoText}
            </span>
          )}
          <div className="flex flex-wrap gap-12">
            {content.columns.map((column, i) => (
              <div key={i}>
                <p className="text-sm font-medium opacity-60">{column.title}</p>
                <ul className="mt-3 space-y-2">
                  {column.links.map((link, j) => (
                    <li key={j}>
                      <a
                        href={link.href}
                        className="text-sm opacity-80 hover:opacity-100"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        {content.bottomText && (
          <p className="mt-10 text-xs opacity-50">{content.bottomText}</p>
        )}
      </SectionContainer>
    </footer>
  )
}

export const footerSection: SectionDefinition<FooterContent> = {
  key: 'footer',
  name: 'Footer',
  category: 'Structure',
  schema: footerContentSchema,
  defaultContent: footerDefaultContent,
  editorFields: [
    { type: 'text', name: 'logoText', label: 'Logo text' },
    {
      type: 'array',
      name: 'columns',
      label: 'Columns',
      itemFields: [
        { type: 'text', name: 'title', label: 'Column title' },
        {
          type: 'array',
          name: 'links',
          label: 'Links',
          itemFields: [
            { type: 'text', name: 'label', label: 'Label' },
            { type: 'text', name: 'href', label: 'Link' },
          ],
        },
      ],
    },
    { type: 'text', name: 'bottomText', label: 'Bottom text' },
  ],
  Renderer: FooterRenderer,
}
