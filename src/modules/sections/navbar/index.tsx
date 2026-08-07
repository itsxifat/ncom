import { z } from 'zod'
import type { SectionDefinition } from '../registry'
import {
  SectionContainer,
  PageButton,
  resolveButtonVariant,
} from '../primitives'

export const navbarContentSchema = z.object({
  logoText: z.string().min(1).max(40),
  links: z
    .array(
      z.object({ label: z.string().min(1).max(40), href: z.string().min(1) })
    )
    .max(8),
  ctaLabel: z.string().max(40).optional(),
  ctaHref: z.string().optional(),
})

export type NavbarContent = z.infer<typeof navbarContentSchema>

export const navbarDefaultContent: NavbarContent = {
  logoText: 'Your Brand',
  links: [
    { label: 'Product', href: '#' },
    { label: 'Pricing', href: '#' },
    { label: 'About', href: '#' },
  ],
  ctaLabel: 'Get started',
  ctaHref: '#',
}

function NavbarRenderer({
  content,
  theme,
}: {
  content: NavbarContent
  theme: { buttonStyle: 'SOLID' | 'OUTLINE' | 'GHOST' }
}) {
  return (
    <header className="border-b border-[color-mix(in_oklab,var(--page-text)_12%,transparent)]">
      <SectionContainer className="flex items-center justify-between py-4">
        <span
          style={{ fontFamily: 'var(--page-font-heading)' }}
          className="text-lg font-semibold"
        >
          {content.logoText}
        </span>
        <nav className="hidden items-center gap-6 sm:flex">
          {content.links.map((link, i) => (
            <a
              key={i}
              href={link.href}
              className="text-sm opacity-80 hover:opacity-100"
            >
              {link.label}
            </a>
          ))}
        </nav>
        {content.ctaLabel && (
          <PageButton
            href={content.ctaHref}
            variant={resolveButtonVariant(theme.buttonStyle)}
          >
            {content.ctaLabel}
          </PageButton>
        )}
      </SectionContainer>
    </header>
  )
}

export const navbarSection: SectionDefinition<NavbarContent> = {
  key: 'navbar',
  name: 'Navbar',
  category: 'Structure',
  schema: navbarContentSchema,
  defaultContent: navbarDefaultContent,
  Renderer: NavbarRenderer,
}
