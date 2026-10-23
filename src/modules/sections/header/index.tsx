import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { El, Extras } from '../elements'
import { storeHref } from '../storefront'
import { cn } from '@/lib/utils'
import { HeaderActions, MobileMenuButton } from './HeaderClient'
import { storeText } from '@/modules/storefront/i18n'

const linkSchema = z.object({
  label: z.string().max(60).default(''),
  href: z.string().max(500).default('/'),
})

export const headerContentSchema = z.object({
  /** Empty means the store's name. */
  logoText: z.string().max(80).default(''),
  layout: z.enum(['left', 'center']).default('left'),
  menu: z
    .array(linkSchema)
    .max(12)
    .default([
      { label: 'Home', href: '/' },
      { label: 'Shop', href: '/products' },
    ]),
  /** Add the store's top-level categories after the menu links. */
  showCategories: z.boolean().default(false),
  showSearch: z.boolean().default(true),
  showAccount: z.boolean().default(true),
  showCart: z.boolean().default(true),
  sticky: z.boolean().default(true),
  searchPlaceholder: z.string().max(80).default('Search products'),
})

export type HeaderContent = z.infer<typeof headerContentSchema>

export const headerDefaultContent: HeaderContent = headerContentSchema.parse({})

export interface HeaderLink {
  label: string
  href: string
  /**
   * Index into `content.menu` for a link the merchant typed, which is what
   * lets them retype it on the canvas. A category link has none — its words
   * are the category's name, edited where the category is.
   */
  menuIndex?: number
}

/**
 * The bar across the top of every page of an online store.
 *
 * It lives on the store's layout page, so it is designed once and shared by
 * the home page, every product, every category and the checkout. The logo is
 * the one set in the theme when there is one — a brand has one logo, and
 * asking for it again here would let the two drift — and the store's name in
 * the heading font when there is not.
 *
 * The menu is the merchant's links followed, if they ask, by their top-level
 * categories, so a shop whose categories change weekly does not need its
 * header edited weekly.
 */
function HeaderRenderer({
  content,
  config,
  theme,
  storefront,
  editing,
}: SectionRendererProps<HeaderContent>) {
  const linkBase = storefront?.linkBase ?? ''
  const name = content.logoText || storefront?.storeName || 'Your store'

  const links: HeaderLink[] = [
    ...content.menu
      .map((link, index) => ({ ...link, menuIndex: index }))
      .filter((link) => link.label.trim()),
    ...(content.showCategories && storefront
      ? storefront.categories
          .filter((category) => !category.parentId)
          .slice(0, 6)
          .map((category) => ({
            label: category.name,
            href: `/categories/${category.handle}`,
          }))
      : []),
  ].map((link) => ({ ...link, href: storeHref(link.href, linkBase) }))

  const centred = content.layout === 'center'

  const logo = (
    <El
      as="a"
      part="logo"
      href={storeHref('/', linkBase)}
      className={cn(
        'flex shrink-0 items-center gap-2 [font-family:var(--page-font-heading)] text-xl font-bold tracking-tight',
        centred && 'justify-center text-2xl'
      )}
    >
      {theme.logoUrl ? (
        <El
          as="img"
          part="logoImage"
          src={theme.logoUrl}
          alt={name}
          className="h-auto max-h-12 w-[var(--page-logo-width)] object-contain"
        />
      ) : (
        <El as="span" part="logoText">
          {name}
        </El>
      )}
    </El>
  )

  const nav = (
    <El
      as="nav"
      part="menu"
      aria-label={storeText(theme).words.mainMenu}
      className="hidden flex-wrap items-center justify-center gap-x-7 gap-y-1 text-[15px] font-medium lg:flex"
    >
      {links.map((link, index) =>
        link.menuIndex !== undefined ? (
          <El
            key={`menu-${index}`}
            as="a"
            part="menuLink"
            index={link.menuIndex}
            href={link.href}
            className="transition-opacity hover:opacity-60"
          >
            {link.label}
          </El>
        ) : (
          <El
            key={`category-${index}`}
            as="a"
            part="categoryLink"
            index={index}
            href={link.href}
            className="transition-opacity hover:opacity-60"
          >
            {link.label}
          </El>
        )
      )}
    </El>
  )

  const showAccount =
    content.showAccount && (storefront?.accountsEnabled ?? true)
  const menuButton = (
    <MobileMenuButton
      links={links}
      storeName={name}
      linkBase={linkBase}
      showAccount={showAccount}
      editing={editing}
    />
  )
  const actions = (
    <HeaderActions
      linkBase={linkBase}
      showSearch={content.showSearch}
      showAccount={showAccount}
      showCart={content.showCart}
      searchPlaceholder={content.searchPlaceholder}
      editing={editing}
    />
  )

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <El
        as="header"
        part="bar"
        className="relative border-b border-[color-mix(in_oklab,var(--page-text)_10%,transparent)] bg-[var(--page-background)]"
      >
        {centred ? (
          // The boutique arrangement: the name in the middle of its own row,
          // the menu on a row of its own underneath. Squeezing a menu beside a
          // centred logo only works for two or three links, and a boutique
          // that shows its categories has more.
          <div className="mx-auto max-w-[var(--page-container-width)] px-4 sm:px-6">
            <div className="grid min-h-16 grid-cols-[1fr_auto_1fr] items-center gap-4 sm:min-h-[4.5rem]">
              <div className="flex items-center">{menuButton}</div>
              {logo}
              {actions}
            </div>
            {links.length > 0 && (
              <div className="hidden pb-4 lg:block">{nav}</div>
            )}
          </div>
        ) : (
          <div className="mx-auto grid min-h-16 max-w-[var(--page-container-width)] grid-cols-[auto_1fr_auto] items-center gap-4 px-4 sm:min-h-[4.5rem] sm:px-6">
            <div className="flex items-center gap-2">
              {menuButton}
              {logo}
            </div>
            <div className="min-w-0">{nav}</div>
            {actions}
          </div>
        )}
        <Extras config={config} slot="content" />
      </El>
    </SectionWrapper>
  )
}

export const headerSection: SectionDefinition<HeaderContent> = {
  key: 'header',
  name: 'Header',
  category: 'Layout',
  description: 'Logo, menu, search and cart — at the top of every page.',
  sites: ['STORE'],
  pageRoles: ['LAYOUT'],
  placement: 'top',
  singleton: true,
  keywords: ['menu', 'navigation', 'logo', 'nav bar'],
  schema: headerContentSchema,
  defaultContent: headerDefaultContent,
  translations: {
    bn: {
      menu: [
        { label: 'হোম', href: '/' },
        { label: 'শপ', href: '/products' },
      ],
      searchPlaceholder: 'পণ্য খুঁজুন',
    },
  },
  wrapperClassName: (content) =>
    content.sticky ? 'sticky top-0 z-40' : undefined,
  editorFields: [
    {
      type: 'text',
      name: 'logoText',
      label: 'Shop name',
      placeholder: 'Your store’s name',
      description:
        'Shown when you have not uploaded a logo. Upload one under Design.',
    },
    {
      type: 'select',
      name: 'layout',
      label: 'Logo position',
      options: [
        { value: 'left', label: 'Left, menu in the middle' },
        { value: 'center', label: 'Centre, menu on the left' },
      ],
    },
    {
      type: 'array',
      name: 'menu',
      label: 'Menu links',
      itemFields: [
        { type: 'text', name: 'label', label: 'Text' },
        { type: 'link', name: 'href', label: 'Goes to' },
      ],
    },
    {
      type: 'boolean',
      name: 'showCategories',
      label: 'Add my categories to the menu',
      description: 'Top-level categories appear after your own links.',
    },
    { type: 'heading', name: 'iconsHeading', label: 'Icons' },
    { type: 'boolean', name: 'showSearch', label: 'Search' },
    { type: 'boolean', name: 'showAccount', label: 'Customer account' },
    { type: 'boolean', name: 'showCart', label: 'Cart' },
    {
      type: 'text',
      name: 'searchPlaceholder',
      label: 'Search box hint',
      showWhen: { field: 'showSearch', equals: true },
    },
    {
      type: 'boolean',
      name: 'sticky',
      label: 'Stay at the top while scrolling',
    },
  ],
  elements: [
    { key: 'bar', label: 'Header bar', kind: 'container', slot: true },
    { key: 'logo', label: 'Logo link', kind: 'container' },
    {
      key: 'logoText',
      label: 'Shop name',
      kind: 'heading',
      contentField: 'logoText',
    },
    { key: 'logoImage', label: 'Logo', kind: 'image' },
    { key: 'menu', label: 'Menu', kind: 'container' },
    {
      key: 'menuLink',
      label: 'Menu link',
      kind: 'text',
      repeated: true,
      contentField: 'menu[].label',
    },
    {
      key: 'categoryLink',
      label: 'Category link',
      kind: 'text',
      repeated: true,
    },
    { key: 'icons', label: 'Icons', kind: 'container' },
    { key: 'icon', label: 'Icon button', kind: 'icon', repeated: true },
    { key: 'cartCount', label: 'Cart count', kind: 'text' },
    { key: 'searchBar', label: 'Search bar', kind: 'container' },
    { key: 'mobileMenu', label: 'Mobile menu', kind: 'container' },
  ],
  slots: [{ key: 'content', label: 'Header bar' }],
  Renderer: HeaderRenderer,
}
