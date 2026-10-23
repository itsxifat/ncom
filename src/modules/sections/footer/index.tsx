import { z } from 'zod'
import { Mail, MapPin, Phone } from 'lucide-react'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { El, Extras } from '../elements'
import { storeHref } from '../storefront'
import { safeHref } from '../sanitizeHtml'
import { storeText } from '@/modules/storefront/i18n'
import {
  SOCIAL_LABELS,
  SOCIAL_NETWORKS,
  SocialGlyph,
  socialHref,
} from './SocialGlyph'

const linkSchema = z.object({
  label: z.string().max(60).default(''),
  href: z.string().max(500).default('/'),
})

export const footerContentSchema = z.object({
  about: z
    .string()
    .max(600)
    .default('Quality products, delivered to your door across Bangladesh.'),
  showLogo: z.boolean().default(true),
  columns: z
    .array(
      z.object({
        title: z.string().max(60).default(''),
        links: z.array(linkSchema).max(10).default([]),
      })
    )
    .max(4)
    .default([
      {
        title: 'Shop',
        links: [
          { label: 'All products', href: '/products' },
          { label: 'Search', href: '/search' },
        ],
      },
      {
        title: 'Help',
        links: [
          { label: 'Track my order', href: '/account' },
          { label: 'Contact us', href: '/contact' },
        ],
      },
    ]),
  contactTitle: z.string().max(60).default('Get in touch'),
  phone: z.string().max(40).default(''),
  email: z.string().max(120).default(''),
  address: z.string().max(300).default(''),
  social: z
    .array(
      z.object({
        network: z.enum(SOCIAL_NETWORKS).default('facebook'),
        url: z.string().max(500).default(''),
      })
    )
    .max(8)
    .default([]),
  paymentText: z.string().max(120).default('Cash on delivery · bKash · Nagad'),
  /** Empty means "© this year, the store's name". */
  copyright: z.string().max(160).default(''),
})

export type FooterContent = z.infer<typeof footerContentSchema>

export const footerDefaultContent: FooterContent = footerContentSchema.parse({})

/** Body copy in the footer, a step quieter than the headings above it. */
const QUIET = 'text-[color-mix(in_oklab,var(--page-text)_68%,transparent)]'

/**
 * The bottom of every page of an online store.
 *
 * It is where a shopper looks for the things that make a shop feel real
 * before they hand over a phone number: who runs it, how to reach them, how
 * they can pay. So the contact column only appears once there is something to
 * contact — an empty "Get in touch" heading is worse than none — and the
 * payment line says in words what a cash-on-delivery shopper most wants to
 * read.
 *
 * Like the header it lives on the layout page, so it is written once for the
 * whole store. The logo is the theme's, for the same reason the header's is: a
 * brand has one logo.
 */
function FooterRenderer({
  content,
  config,
  theme,
  storefront,
}: SectionRendererProps<FooterContent>) {
  const linkBase = storefront?.linkBase ?? ''
  const storeName = storefront?.storeName ?? 'Your store'
  // Every merchant link passes the same check, so nothing typed into a footer
  // can become a `javascript:` link on every page of the shop.
  const href = (value: string) => safeHref(storeHref(value, linkBase)) ?? '#'

  // Links are numbered across the whole footer rather than per column, so
  // each one is its own instance on the canvas: styling "the third link"
  // means one link, not the third of every column.
  let linkNumber = 0
  const columns = content.columns
    .map((column, index) => ({
      index,
      title: column.title.trim(),
      links: column.links
        .filter((link) => link.label.trim())
        .map((link) => ({ ...link, number: linkNumber++ })),
    }))
    .filter((column) => column.title || column.links.length > 0)

  const phone = content.phone.trim()
  const email = content.email.trim()
  const address = content.address.trim()
  const contact: { icon: typeof Phone; text: string; href: string | null }[] =
    []
  if (phone) {
    contact.push({
      icon: Phone,
      text: phone,
      href: `tel:${phone.replace(/[^\d+]/g, '')}`,
    })
  }
  if (email) contact.push({ icon: Mail, text: email, href: `mailto:${email}` })
  if (address) contact.push({ icon: MapPin, text: address, href: null })

  const social = content.social.flatMap((item, index) => {
    const target = socialHref(item.network, item.url)
    const safe = target ? safeHref(target) : undefined
    return safe ? [{ index, network: item.network, href: safe }] : []
  })

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <El
        as="footer"
        part="frame"
        className="bg-[color-mix(in_oklab,var(--page-text)_4%,var(--page-background))] text-[var(--page-text)]"
      >
        <div className="mx-auto max-w-[var(--page-container-width)] px-4 pt-14 pb-8 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
            <El as="div" part="brand" className="flex max-w-sm flex-col gap-4">
              {content.showLogo && (
                <El
                  as="a"
                  part="logo"
                  href={storeHref('/', linkBase)}
                  className="w-fit [font-family:var(--page-font-heading)] text-xl font-bold tracking-tight"
                >
                  {theme.logoUrl ? (
                    <El
                      as="img"
                      part="logoImage"
                      src={theme.logoUrl}
                      alt={storeName}
                      className="h-auto max-h-12 w-[var(--page-logo-width)] object-contain"
                    />
                  ) : (
                    <El as="span" part="logoText">
                      {storeName}
                    </El>
                  )}
                </El>
              )}
              {content.about && (
                <El
                  as="p"
                  part="about"
                  html={content.about}
                  className={`text-sm leading-relaxed ${QUIET}`}
                />
              )}
              {social.length > 0 && (
                <El as="div" part="social" className="flex flex-wrap gap-2">
                  {social.map((item) => (
                    <El
                      key={item.index}
                      as="a"
                      part="socialIcon"
                      index={item.index}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={SOCIAL_LABELS[item.network]}
                      className="flex size-9 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--page-text)_16%,transparent)] transition hover:border-[var(--page-primary)] hover:bg-[var(--page-primary)] hover:text-[var(--page-on-primary)]"
                    >
                      <SocialGlyph network={item.network} className="size-4" />
                    </El>
                  ))}
                </El>
              )}
            </El>

            <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
              {columns.map((column) => (
                <El
                  key={column.index}
                  as="div"
                  part="column"
                  index={column.index}
                  className="flex flex-col gap-3"
                >
                  {column.title && (
                    <El
                      as="h3"
                      part="columnTitle"
                      index={column.index}
                      className="[font-family:var(--page-font-heading)] text-sm font-semibold"
                    >
                      {column.title}
                    </El>
                  )}
                  <ul className="flex flex-col gap-2.5">
                    {column.links.map((link) => (
                      <li key={link.number}>
                        <El
                          as="a"
                          part="columnLink"
                          index={link.number}
                          href={href(link.href)}
                          className={`text-sm transition-colors hover:text-[var(--page-text)] ${QUIET}`}
                        >
                          {link.label}
                        </El>
                      </li>
                    ))}
                  </ul>
                </El>
              ))}

              {contact.length > 0 && (
                <El
                  as="div"
                  part="contact"
                  className="col-span-2 flex flex-col gap-3 sm:col-span-1"
                >
                  {content.contactTitle && (
                    <El
                      as="h3"
                      part="contactTitle"
                      className="[font-family:var(--page-font-heading)] text-sm font-semibold"
                    >
                      {content.contactTitle}
                    </El>
                  )}
                  <ul className="flex flex-col gap-2.5">
                    {contact.map((line, index) => {
                      const Icon = line.icon
                      return (
                        <li key={index}>
                          <El
                            as={line.href ? 'a' : 'p'}
                            part="contactLine"
                            index={index}
                            href={line.href ?? undefined}
                            className={`flex items-start gap-2 text-sm whitespace-pre-line ${QUIET} ${line.href ? 'transition-colors hover:text-[var(--page-text)]' : ''}`}
                          >
                            <Icon className="mt-0.5 size-4 shrink-0 opacity-70" />
                            <span className="min-w-0 break-words">
                              {line.text}
                            </span>
                          </El>
                        </li>
                      )
                    })}
                  </ul>
                </El>
              )}
            </div>
          </div>

          <Extras config={config} slot="content" />

          <El
            as="div"
            part="bottom"
            className={`mt-12 flex flex-col gap-2 border-t border-[color-mix(in_oklab,var(--page-text)_12%,transparent)] pt-6 text-xs sm:flex-row sm:items-center sm:justify-between ${QUIET}`}
          >
            <El as="p" part="copyright">
              {content.copyright ||
                storeText(theme).words.copyright(
                  new Date().getFullYear(),
                  storeName
                )}
            </El>
            {content.paymentText && (
              <El as="p" part="payment">
                {content.paymentText}
              </El>
            )}
          </El>
        </div>
      </El>
    </SectionWrapper>
  )
}

export const footerSection: SectionDefinition<FooterContent> = {
  key: 'footer',
  name: 'Footer',
  category: 'Layout',
  description: 'Links, contact details and payment methods — under every page.',
  sites: ['STORE'],
  pageRoles: ['LAYOUT'],
  placement: 'bottom',
  singleton: true,
  keywords: ['links', 'contact', 'social', 'copyright', 'bottom'],
  schema: footerContentSchema,
  defaultContent: footerDefaultContent,
  translations: {
    bn: {
      about: 'মানসম্মত পণ্য, সারা বাংলাদেশে আপনার দোরগোড়ায়।',
      columns: [
        {
          title: 'শপ',
          links: [
            { label: 'সব পণ্য', href: '/products' },
            { label: 'খুঁজুন', href: '/search' },
          ],
        },
        {
          title: 'সাহায্য',
          links: [
            { label: 'অর্ডার ট্র্যাক করুন', href: '/account' },
            { label: 'যোগাযোগ', href: '/contact' },
          ],
        },
      ],
      contactTitle: 'যোগাযোগ করুন',
      paymentText: 'ক্যাশ অন ডেলিভারি · বিকাশ · নগদ',
    },
  },
  editorFields: [
    {
      type: 'richtext',
      name: 'about',
      label: 'About your shop',
      multiline: true,
    },
    {
      type: 'boolean',
      name: 'showLogo',
      label: 'Show logo',
      description: 'Your logo from Design, or your shop’s name.',
    },
    {
      type: 'array',
      name: 'columns',
      label: 'Link columns',
      itemFields: [
        { type: 'text', name: 'title', label: 'Column heading' },
        {
          type: 'array',
          name: 'links',
          label: 'Links',
          itemFields: [
            { type: 'text', name: 'label', label: 'Text' },
            { type: 'link', name: 'href', label: 'Goes to' },
          ],
        },
      ],
    },
    { type: 'heading', name: 'contactHeading', label: 'Contact' },
    {
      type: 'text',
      name: 'contactTitle',
      label: 'Heading',
      description: 'Shown once you add a phone, email or address.',
    },
    {
      type: 'text',
      name: 'phone',
      label: 'Phone',
      placeholder: '01XXXXXXXXX',
    },
    { type: 'text', name: 'email', label: 'Email', placeholder: 'hello@…' },
    { type: 'textarea', name: 'address', label: 'Address' },
    { type: 'heading', name: 'socialHeading', label: 'Social media' },
    {
      type: 'array',
      name: 'social',
      label: 'Social links',
      itemFields: [
        {
          type: 'select',
          name: 'network',
          label: 'Network',
          options: SOCIAL_NETWORKS.map((network) => ({
            value: network,
            label: network === 'x' ? 'X (Twitter)' : SOCIAL_LABELS[network],
          })),
        },
        {
          type: 'text',
          name: 'url',
          label: 'Page address',
          placeholder: 'facebook.com/yourshop',
          description: 'For WhatsApp, your phone number is enough.',
        },
      ],
    },
    { type: 'heading', name: 'bottomHeading', label: 'Bottom line' },
    {
      type: 'text',
      name: 'paymentText',
      label: 'Ways to pay',
      description: 'A short line, like “Cash on delivery · bKash”.',
    },
    {
      type: 'text',
      name: 'copyright',
      label: 'Copyright',
      description: 'Leave empty for “© this year” and your shop’s name.',
    },
  ],
  elements: [
    { key: 'frame', label: 'Footer', kind: 'container', slot: true },
    { key: 'brand', label: 'About column', kind: 'container' },
    { key: 'logo', label: 'Logo link', kind: 'container' },
    { key: 'logoImage', label: 'Logo', kind: 'image' },
    { key: 'logoText', label: 'Shop name', kind: 'heading' },
    { key: 'about', label: 'About text', kind: 'text', contentField: 'about' },
    { key: 'social', label: 'Social icons', kind: 'container' },
    { key: 'socialIcon', label: 'Social icon', kind: 'icon', repeated: true },
    { key: 'column', label: 'Link column', kind: 'container', repeated: true },
    {
      key: 'columnTitle',
      label: 'Column heading',
      kind: 'heading',
      repeated: true,
      contentField: 'columns[].title',
    },
    { key: 'columnLink', label: 'Footer link', kind: 'text', repeated: true },
    { key: 'contact', label: 'Contact column', kind: 'container' },
    {
      key: 'contactTitle',
      label: 'Contact heading',
      kind: 'heading',
      contentField: 'contactTitle',
    },
    {
      key: 'contactLine',
      label: 'Contact detail',
      kind: 'text',
      repeated: true,
    },
    { key: 'bottom', label: 'Bottom line', kind: 'container' },
    {
      key: 'copyright',
      label: 'Copyright',
      kind: 'text',
      contentField: 'copyright',
    },
    {
      key: 'payment',
      label: 'Ways to pay',
      kind: 'text',
      contentField: 'paymentText',
    },
  ],
  slots: [{ key: 'content', label: 'Footer' }],
  Renderer: FooterRenderer,
}
