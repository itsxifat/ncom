import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { El } from '../elements'
import { storeText } from '@/modules/storefront/i18n'
import { CustomCodeFrame } from './CustomCodeFrame'
import { MAX_CSS_LENGTH, MAX_HTML_LENGTH, sanitizeCustomCode } from './sanitize'
import { bindHooks, productRefsIn } from './hooks'

/**
 * Custom code: a section drawn from the merchant's own HTML and CSS.
 *
 * The escape hatch for a design no block can express — a section a designer
 * built, or one an AI wrote from the prompt NCOM gives merchants to paste into
 * it. Everything else on the page is still blocks; this is one block whose
 * insides happen to be code.
 *
 * Two boundaries make it safe to offer to people who cannot read the code
 * they paste. The markup goes through `sanitize.ts` on every render, so no
 * script, handler or framing survives no matter what was stored. And it is
 * drawn inside a shadow root (CustomCodeFrame), so its CSS cannot restyle the
 * rest of the page and the page's CSS cannot break it — while the theme's
 * `--page-*` tokens, its colours and fonts, still reach in through
 * inheritance, so a design can follow the theme by writing
 * `var(--page-primary)`.
 *
 * Free to look like anything, and still part of the shop: a design names
 * what it shows and does with `data-ncom-*` hooks — a price, an offer's
 * order button, a product's add-to-cart — and NCOM fills in the live figure
 * and wires the click (see `hooks.ts`). On the canvas the design is marked
 * with where each element sits in its HTML, which is what lets a merchant
 * double-click its words or photos and change them in place
 * (`source-edit.ts`).
 *
 * This module must stay server-safe; the shadow-root work lives in the client
 * half.
 */
export const customcodeContentSchema = z.object({
  html: z.string().max(MAX_HTML_LENGTH).default(''),
  css: z.string().max(MAX_CSS_LENGTH).default(''),
})

export type CustomcodeContent = z.infer<typeof customcodeContentSchema>

export const customcodeDefaultContent: CustomcodeContent =
  customcodeContentSchema.parse({})

function CustomcodeRenderer({
  content,
  config,
  editing,
  theme,
  commerce,
  storefront,
  sectionId,
}: SectionRendererProps<CustomcodeContent>) {
  const code = sanitizeCustomCode(content.html, content.css, {
    annotate: editing,
  })

  if (code.empty) {
    // Nothing pasted yet. Invisible on the live page; on the canvas, a target
    // to click so the merchant can find the block they just added.
    if (!editing) return null
    return (
      <SectionWrapper config={config}>
        <El
          as="div"
          part="frame"
          className="mx-auto flex max-w-3xl flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-current/20 px-6 py-12 text-center"
        >
          <span className="font-mono text-sm font-semibold opacity-70">
            {'</>'}
          </span>
          <p className="text-sm font-semibold">Custom code</p>
          <p className="max-w-md text-sm opacity-70">
            Paste HTML and CSS in the panel on the right — a design from a
            designer, or one an AI wrote for you. Scripts and forms are removed;
            everything else is drawn here exactly as written.
          </p>
        </El>
      </SectionWrapper>
    )
  }

  const markup = bindHooks(code.markup, {
    // A landing page is handed what it sells, a store its catalogue; a
    // template preview neither, and its design shows exactly as written.
    site: commerce ? 'LANDING' : storefront ? 'STORE' : null,
    offers: commerce?.offers ?? [],
    shipping: commerce?.shipping ?? null,
    products: (sectionId && storefront?.sectionProducts[sectionId]) || [],
    linkBase: storefront?.linkBase ?? '',
    currencyCode: commerce?.currencyCode ?? storefront?.currencyCode ?? 'BDT',
    text: storeText(theme),
    editing: Boolean(editing),
  })

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <El as="div" part="frame">
        <CustomCodeFrame markup={markup} editing={editing} />
      </El>
    </SectionWrapper>
  )
}

export const customcodeSection: SectionDefinition<CustomcodeContent> = {
  key: 'customcode',
  name: 'Custom code',
  // With text and media in the library: what it holds is content, even when
  // that content arrives as code.
  category: 'Content',
  description: 'Your own HTML and CSS — for a design no other block can make.',
  keywords: [
    'html',
    'css',
    'code',
    'embed',
    'custom',
    'paste',
    'ai',
    'widget',
    'iframe',
  ],
  schema: customcodeContentSchema,
  defaultContent: customcodeDefaultContent,
  editorFields: [
    {
      type: 'code',
      name: 'html',
      label: 'HTML',
      language: 'html',
      maxLength: MAX_HTML_LENGTH,
      placeholder:
        '<section class="promo">\n  <h2>Eid collection</h2>\n</section>',
      description:
        'Paste a whole page or one section. Scripts, forms and click handlers are removed; YouTube, Vimeo and Google Maps embeds are kept. Connect it to your shop with the data-ncom attributes below.',
    },
    {
      type: 'code',
      name: 'css',
      label: 'CSS',
      language: 'css',
      maxLength: MAX_CSS_LENGTH,
      placeholder: '.promo {\n  color: var(--page-primary);\n}',
      description:
        'Styles here only touch this block. Use var(--page-primary), var(--page-text), var(--page-background) and var(--page-font-heading) to follow your theme.',
    },
  ],
  elements: [{ key: 'frame', label: 'Code area', kind: 'embed' }],
  // A store design that shows a product's price or sells it names the
  // product; the page loads those before it renders, like any product grid.
  productQuery: (content) => {
    const refs = productRefsIn(content.html)
    return refs.length
      ? { source: 'refs', productRefs: refs, limit: refs.length }
      : null
  },
  Renderer: CustomcodeRenderer,
}
