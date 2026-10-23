import { FONT_GROUPS } from '@/lib/fonts'
import type { SiteLanguage } from '../sections/language'
import type { PageRole, SiteKind } from '../sections/storefront'
import { getSectionDefinition } from '../sections/registry'
import { HOOK_REFERENCE } from '../sections/customcode/hooks'
import { catalogText } from './catalog'
import { PAGE_FORMAT, SITE_FORMAT } from './format'
import { STYLE_KEYS } from './style-keys'

/**
 * The instructions every AI that designs for NCOM works from.
 *
 * One text, three readers: our own AI builder (as its system prompt), the
 * merchant's chat assistant (pasted, from the "use your own AI" screens), and
 * an AI code editor connected over MCP (as the server's instructions and its
 * `get_design_guide` tool). They are the same words on purpose — a rule that
 * keeps our builder from inventing prices has to keep ChatGPT from inventing
 * them too — and they are written for a model: what to send back, exactly,
 * and the handful of rules that make a page work in a Bangladeshi
 * cash-on-delivery shop.
 *
 * Everything here is derived from the block registry and the font catalogue,
 * so it describes the blocks that actually exist today.
 */

export type GuideScope = 'site' | 'page'

export interface GuideOptions {
  kind: SiteKind
  scope: GuideScope
  /** For a page: which kind of page. Defaults to an ordinary page. */
  role?: PageRole
  /**
   * How the answer travels. `chat` is pasted into and out of a chat window,
   * so a code fence is welcome; `api` is read by code, so it must be bare JSON;
   * `mcp` is passed as a tool argument by an AI code editor.
   */
  channel: 'chat' | 'api' | 'mcp'
}

const KIND_NAME: Record<SiteKind, string> = {
  LANDING: 'landing page',
  STORE: 'online store',
}

function fontList(): string {
  return FONT_GROUPS.map(
    (group) =>
      `- ${group.label}: ${group.fonts.map((font) => font.name).join(', ')}`
  ).join('\n')
}

/**
 * How to choose a font. The catalogue is listed because it is what loads
 * fastest and what the editor leads with, but it is not a limit: any Google
 * Fonts family is served through NCOM's font proxy, and `normalize.ts`
 * accepts one by its name.
 */
function fontRules(): string[] {
  return [
    'For a Bangla site, use "Google Sans" for both headingFont and bodyFont unless the owner asks for a particular look. Its Bangla and English letters are drawn together, so a Bangla headline next to an English product name or a price reads as one font.',
    'The fonts listed below are bundled with every site and load fastest. Any other family on Google Fonts (fonts.google.com) may be used as well — write its exact name, e.g. "Lexend" or "Josefin Sans". A name that is not a Google Fonts family is dropped.',
    'A font without Bangla letters still works on a Bangla site, for headings especially: its Bangla letters are set in a Bangla face automatically.',
    'Set fonts only in the theme ("headingFont", "bodyFont") or in a section’s "style" ("headingFont", "bodyFont" for that section alone). Never name a font anywhere else — not as style="font-family: …" in rich text, and not in a `customcode` block’s CSS (use var(--page-font-heading) and var(--page-font-body) there): only fonts set in those fields are loaded, so a font named elsewhere shows as a plain fallback.',
  ]
}

function hasBlock(type: string) {
  return Boolean(getSectionDefinition(type))
}

function shapeExample(options: GuideOptions): string {
  // A block that belongs on that kind of site: a store's hero button would
  // lead nowhere (see pageAdvice).
  const section = `{ "type": "${options.kind === 'STORE' ? 'categories' : 'hero'}", "content": { "title": "…" }, "style": { "backgroundVariant": "muted" } }`
  if (options.scope === 'page') {
    return [
      '{',
      `  "format": "${PAGE_FORMAT}",`,
      '  "title": "Page title",',
      '  "seo": { "title": "≤ 60 characters", "description": "≤ 155 characters" },',
      `  "sections": [ ${section}, … ]`,
      '}',
    ].join('\n')
  }
  return [
    '{',
    `  "format": "${SITE_FORMAT}",`,
    '  "name": "The shop’s name",',
    '  "language": "bn" or "en",',
    '  "theme": { "primaryColor": "#…", "secondaryColor": "#…", "backgroundColor": "#…", "textColor": "#…", "headingFont": "…", "bodyFont": "…", "buttonStyle": "SOLID", "borderRadius": "md", "headingWeight": "700" },',
    ...(options.kind === 'STORE'
      ? [
          '  "layout": { "sections": [ announcement (optional), header, footer ] },',
        ]
      : []),
    '  "pages": [',
    `    { "title": "Home", "seo": { "title": "…", "description": "…" }, "sections": [ ${section}, … ] }${options.kind === 'STORE' ? ',' : ''}`,
    ...(options.kind === 'STORE'
      ? ['    { "title": "About us", "slug": "about", "sections": [ … ] }']
      : []),
    '  ]',
    '}',
  ].join('\n')
}

function pageAdvice(kind: SiteKind): string[] {
  if (kind === 'LANDING') {
    return [
      'A landing page sells one product, a combo or one category to someone who tapped an ad and will decide in a minute. It is ONE page and it must contain exactly one `orderform` block — that is where the order is placed (name, phone, address, cash on delivery). Put it near the end.',
      'A landing site has nothing but that page: no product pages, no category pages, no shared header or footer. Every block below goes on the page itself, and a design for it has no "layout", "productPage" or "catalogPage".',
      'A proven order for a Bangladeshi landing page: `hero` (the main benefit + a button) → `trust` (cash on delivery, delivery time, exchange) → `features` (why it is worth it) → photos (`gallery`/`image`, only with real image URLs) or `video` → `testimonials` (only real reviews) → `faq` (delivery, payment, size, exchange) → `countdown` (only for a real deadline) → `orderform`. Repeat a `cta` button between long stretches so the order form is never far away.',
      'Buttons in `hero` and `cta` already scroll to the order form. A link to "#order" does the same.',
      'Prices, offers and delivery charges live in the order form and come from the shop’s settings — do not type prices into headings unless the owner gave you the exact price.',
    ]
  }
  return [
    'An online store has a shared layout (an optional `announcement` bar, a `header`, a `footer`, shown on every page), a home page, and optional extra pages such as About us, Contact or Delivery & returns. Product pages and category pages are designs filled in automatically for every product and category; include `productPage` / `catalogPage` only to change their design.',
    'A strong home page: a `slider` → `categories` → `products` (newest) → `promos` → `trust` → another `products` grid (a category, if the owner named one) → a short `richtext` about the shop. Products, prices, photos and stock appear automatically from the shop’s catalogue — never type product names or prices into these blocks.',
    'Do not use `hero` in a store: its button always jumps to a landing page’s order form, which a store does not have, so it would do nothing. Open the home page with a `slider` (its button goes to "/products" unless you set "buttonHref") or `promos`.',
    'Header menu links: "/products" (all products), "/categories/<handle>" only for handles the owner gave you, "/about", "/contact", "/<page-slug>" for pages you created. Footer: short about text, link columns, contact details only if the owner gave them, social links only with real URLs.',
  ]
}

function languageRules(): string[] {
  return [
    'Write every word shoppers read in the language you are asked for:',
    '  - Bangla (বাংলা): write the way successful Bangladeshi online shops write — warm, clear and persuasive, never a stiff word-for-word translation. Keep brand names, product names and words shoppers normally say in English (COD, XL, combo) as they are. Write numbers in the copy with Bangla digits (৳৯৯০, ২-৩ দিন).',
    '  - English: plain, friendly English that Bangladeshi shoppers read easily.',
    'Set "language" in a site answer to "bn" or "en" to match.',
  ]
}

function honestyRules(kind: SiteKind): string[] {
  return [
    'Only state facts the owner gave you. Do not invent prices, discounts, stock counts, delivery times or charges, phone numbers, addresses, awards or guarantees. Where the page needs a fact you do not have, write a short, obvious placeholder in square brackets, e.g. "[Your phone number]", so the owner fills it in.',
    'Reviews: use the `testimonials` block only with real customer reviews the owner gave you. Never write made-up reviews or names.',
    `Images: use only image URLs the owner gave you (https://…). Otherwise leave image fields as "" — the owner uploads photos in the editor. Do not add \`image\` or \`gallery\` blocks without real image URLs; ${kind === 'STORE' ? '`slider` and `promos` look' : '`hero` looks'} fine without pictures.`,
  ]
}

function formatRules(options: GuideOptions): string[] {
  return [
    'Use only the blocks listed below, by their `type`. In `content`, include only the fields you want to set — every field you leave out keeps the block’s sensible default. Never add fields that are not listed, inside list items too: write each item with exactly the field names listed under "each item".',
    'Fields marked "rich text" are text that may use only <strong>, <em>, <br> and <a href="…">. Fields marked "text" are plain text — no HTML, no Markdown.',
    `Section design goes in "style" (optional), an object: ${STYLE_KEYS.map((key) => `\`${key}\``).join(', ')}. backgroundVariant is "default" (the page background), "muted" (a light tint of it) or "custom" (backgroundColor). Colours are hex like "#1f7a4d". paddingTop/paddingBottom are rem (0–30). anchorId gives the section an id other links can jump to ("#anchor-id"). headingFont/bodyFont change that one section’s fonts.`,
    'Block text is always drawn in the theme’s textColor, whatever the section’s background. So keep every section’s background as readable behind that colour as the page itself: "default", "muted" or a custom backgroundColor close to the theme’s backgroundColor. Do not use "dark" or "primary" backgrounds, a strongly different custom colour, or a busy or dark background photo (backgroundImageUrl) behind text — and leave backgroundOverlay at 0 unless the theme’s text is light, because it darkens the photo. For a dark look, make the theme itself dark: a dark backgroundColor with a light textColor.',
    'When you change a page NCOM gave you, a section you send back with its "id" replaces that section: its "content" and its "style" are what you send. A style you leave out of it, or set to null, is removed (the section follows the theme again), and a content field you leave out goes back to the block’s default — so send back everything you want to keep.',
    ...(options.channel === 'mcp'
      ? [
          'To change only part of one section, use update_section instead: the content and style fields you pass are laid over what is there and the rest is kept. Set a style field to null there to remove it.',
        ]
      : []),
    'Theme colours are hex with 3 or 6 digits, like "#1f7a4d" — no transparency. buttonStyle: "SOLID" | "OUTLINE" | "GHOST". borderRadius: "none" | "sm" | "md" | "lg" | "full". headingWeight: "400"–"800". Fonts (headingFont, bodyFont) are family names — see "Fonts" below.',
    'Keep good contrast in the theme: dark text on a light background or the reverse, and a primaryColor that white or black text reads well on — buttons are drawn in it.',
  ]
}

function conversionRules(kind: SiteKind): string[] {
  const rules = [
    'If the owner gives you an existing design — HTML, React or Tailwind code, a screenshot, or a link’s contents — rebuild it from these blocks as faithfully as you can: one block per visual section, the same words, the colours as theme colours or section styles, the same fonts when they are Google Fonts families, otherwise the closest from the list.',
  ]
  if (hasBlock('customcode')) {
    rules.push(
      'Only when part of a design truly cannot be made from the blocks, use a `customcode` block with self-contained HTML in "html" and its CSS in "css". No JavaScript, no external stylesheets, no forms. Write real CSS with your own class names — Tailwind or other utility classes do nothing there — and know the CSS only affects that block. Use the theme through CSS variables: var(--page-primary), var(--page-secondary), var(--page-background), var(--page-text), var(--page-font-heading), var(--page-font-body), var(--page-radius). Prefer real blocks whenever one fits — they stay editable for the owner.',
      ...hookRules(kind)
    )
  }
  return rules
}

/**
 * How a custom-code design stays part of the shop: the `data-ncom-*` hooks,
 * from the same list the builder and the docs describe them from.
 */
function hookRules(kind: SiteKind): string[] {
  const hooks = HOOK_REFERENCE.flatMap((hook) => {
    const does = kind === 'LANDING' ? hook.landing : hook.store
    return does ? [`  - ${hook.attribute}: ${does}`] : []
  })
  return [
    'Connect a `customcode` design to the shop with these attributes on ordinary elements. NCOM writes the live figures into them and handles the clicks, so never type a price into custom code and never draw a button that does nothing. Whatever is inside a figure’s element is replaced, so put a figure there only if the owner gave it to you, and otherwise leave the element empty:',
    ...hooks,
    kind === 'LANDING'
      ? '  Leave the value empty to mean the page’s main offer — <a data-ncom-order>Order now</a>, <span data-ncom-price></span> — because offers are set up by the owner after the design. A plain link to "#order" also scrolls to the order form.'
      : '  The value names a product by its id or its handle — only products the owner’s shop really has.',
  ]
}

function answerRules(options: GuideOptions): string[] {
  const what =
    options.scope === 'site'
      ? `one JSON object describing the whole ${KIND_NAME[options.kind]}`
      : 'one JSON object describing one page'
  if (options.channel === 'mcp') {
    return [
      'Pass the design as the `design` argument of the NCOM tool you are calling (create_site, create_page, update_page or update_layout) — a JSON object, not a string.',
      'Each tool answers with what it fixed or left out on the way in. Read those notes, and call the tool again with a corrected design when something you wanted was dropped.',
      'Everything is saved as a draft. The owner reviews it in the NCOM builder and publishes it themselves — give them the builder or preview link the tool returns.',
    ]
  }
  return options.channel === 'chat'
    ? [
        `Reply with ${what}, in a single \`\`\`json code block, and nothing else — no explanation before or after. The owner copies your answer into NCOM as it is.`,
        'Make sure it is complete, valid JSON (double quotes, no comments, no trailing commas). If it would be very long, make the page shorter rather than stopping halfway.',
      ]
    : [
        `Reply with ${what} and nothing else: no code fence, no explanation, no comments. Your answer is read by code.`,
      ]
}

/**
 * The full instructions, without anything about one particular business —
 * so it is identical for every merchant with the same kind of site, which is
 * what lets the AI builder cache it.
 */
export function designGuide(options: GuideOptions): string {
  const role =
    options.scope === 'page' ? (options.role ?? 'STANDARD') : undefined
  const sections = [
    `# Designing a${options.kind === 'STORE' ? 'n' : ''} ${KIND_NAME[options.kind]} for NCOM`,
    '',
    `You are designing ${options.scope === 'site' ? `a whole ${KIND_NAME[options.kind]}` : `one page of a${options.kind === 'STORE' ? 'n' : ''} ${KIND_NAME[options.kind]}`} for a business that sells with NCOM, a website builder for online sellers in Bangladesh. NCOM turns your answer into a real, editable page made of its own blocks; the owner then adjusts it with drag and drop and publishes it.`,
    '',
    '## Your answer',
    ...answerRules(options).map((rule) => `- ${rule}`),
    '',
    'Its shape:',
    '```',
    shapeExample(options),
    '```',
    ...(options.kind === 'STORE' && options.scope === 'site'
      ? [
          'Two more keys are optional: "productPage": { "sections": [ … ] } and "catalogPage": { "sections": [ … ] }, to change how every product page and every category page looks.',
        ]
      : []),
    '',
    '## How a good page is built',
    ...pageAdvice(options.kind).map((rule) => `- ${rule}`),
    '',
    '## Rules',
    ...[...formatRules(options), ...honestyRules(options.kind)].map(
      (rule) => `- ${rule}`
    ),
    '',
    '## Language',
    ...languageRules().map((rule) =>
      rule.startsWith('  ') ? rule : `- ${rule}`
    ),
    '',
    '## Turning an existing design into NCOM blocks',
    ...conversionRules(options.kind).map((rule) =>
      rule.startsWith('  ') ? rule : `- ${rule}`
    ),
    '',
    '## Fonts',
    ...fontRules().map((rule) => `- ${rule}`),
    '',
    'Bundled with every site:',
    fontList(),
    '',
    '## Blocks',
    '',
    catalogText(options.kind, role),
  ]
  return sections.join('\n')
}

export interface BusinessBrief {
  /** What the owner wrote: the business, the product, the offer, the style. */
  request: string
  language: SiteLanguage
  storeName?: string | null
  categories?: { id: string; name: string; handle?: string | null }[]
  products?: { id: string; title: string }[]
}

/**
 * The part of a request that is about this business: what the owner asked for
 * and what the shop already has, so the design can link to real categories
 * instead of inventing them.
 */
export function briefText(brief: BusinessBrief): string {
  const lines = [
    `Write all shopper-facing words in ${brief.language === 'bn' ? 'Bangla (বাংলা)' : 'English'}.`,
  ]
  if (brief.storeName) lines.push(`The shop is called “${brief.storeName}”.`)
  if (brief.categories?.length) {
    lines.push(
      'The shop’s categories (use their ids in `category` fields and their handles in "/categories/<handle>" links):',
      ...brief.categories
        .slice(0, 40)
        .map(
          (category) =>
            `- ${category.name} — id "${category.id}"${category.handle ? `, handle "${category.handle}"` : ''}`
        )
    )
  }
  if (brief.products?.length) {
    lines.push(
      'Some of its products (ids may be used in a `products` field with source "picked"):',
      ...brief.products
        .slice(0, 30)
        .map((product) => `- ${product.title} — id "${product.id}"`)
    )
  }
  lines.push(
    '',
    'What the owner wants:',
    brief.request.trim() || '(nothing more)'
  )
  return lines.join('\n')
}

/**
 * The text a merchant copies into their own AI: the guide, then their request
 * (or a place to write it), ready to paste in one go.
 */
export function chatPrompt(
  options: Omit<GuideOptions, 'channel'>,
  brief: BusinessBrief
): string {
  const guide = designGuide({ ...options, channel: 'chat' })
  const request = brief.request.trim()
    ? briefText(brief)
    : briefText({
        ...brief,
        request:
          '[Describe your business here: what you sell, who buys it, any offer, the look you like. You can also paste your own design’s code below this line.]',
      })
  return `${guide}\n\n---\n\n# The business\n\n${request}\n`
}
