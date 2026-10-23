import type { SiteKind } from '../sections/storefront'
import { LANDING_TEMPLATES } from './landings'
import { STORE_TEMPLATES } from './stores'
import { catalogPage, layoutPage, productPage } from './store-pages'
import type { SiteTemplate } from './types'
import { L } from './localize'

export type { SiteTemplate, TemplatePage, TemplateSection } from './types'

/**
 * Every starter design, landing pages first.
 *
 * The blank starts are templates too — the fewest blocks a working site of
 * that kind needs — so "start from scratch" goes through exactly the same
 * creation path as everything else and cannot produce a store with no product
 * page or a landing page with no way to order.
 */
export const BLANK_LANDING: SiteTemplate = {
  key: 'landing-blank',
  kind: 'LANDING',
  name: 'Blank',
  description: 'A headline and an order form. Build the rest yourself.',
  bestFor: 'Starting from scratch',
  theme: {
    primaryColor: '#1a1a1a',
    secondaryColor: '#008060',
    backgroundColor: '#ffffff',
    textColor: '#202223',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    bangla: { headingFont: 'Google Sans', bodyFont: 'Google Sans' },
  },
  pages: [
    {
      title: L('Home', 'হোম'),
      slug: 'home',
      isHome: true,
      sections: [{ type: 'hero' }, { type: 'orderform' }],
    },
  ],
}

export const BLANK_STORE: SiteTemplate = {
  key: 'store-blank',
  kind: 'STORE',
  name: 'Blank',
  description: 'A header, a grid of your products and a footer.',
  bestFor: 'Starting from scratch',
  theme: {
    primaryColor: '#1a1a1a',
    secondaryColor: '#008060',
    backgroundColor: '#ffffff',
    textColor: '#202223',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    bangla: { headingFont: 'Google Sans', bodyFont: 'Google Sans' },
  },
  pages: [
    layoutPage([{ type: 'header' }, { type: 'footer' }]),
    {
      title: L('Home', 'হোম'),
      slug: 'home',
      isHome: true,
      sections: [
        {
          type: 'products',
          content: { title: L('Our products', 'আমাদের পণ্য') },
        },
      ],
    },
    productPage({}),
    catalogPage({}),
  ],
}

export const SITE_TEMPLATES: SiteTemplate[] = [
  ...LANDING_TEMPLATES,
  BLANK_LANDING,
  ...STORE_TEMPLATES,
  BLANK_STORE,
]

export function templatesFor(kind: SiteKind): SiteTemplate[] {
  return SITE_TEMPLATES.filter((template) => template.kind === kind)
}

export function getTemplate(
  key: string | null | undefined
): SiteTemplate | null {
  return SITE_TEMPLATES.find((template) => template.key === key) ?? null
}

/** The page of a template a gallery thumbnail shows: its home page. */
export function templateHome(template: SiteTemplate) {
  return template.pages.find((page) => page.isHome) ?? template.pages[0]!
}
