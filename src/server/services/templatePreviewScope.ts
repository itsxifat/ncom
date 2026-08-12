import 'server-only'
import { buildProductDrop, type StorefrontScope } from '@/lib/liquid/drops'
import { renderLiquidSection } from '@/lib/liquid/renderSection'
import { scopeCss } from '@/modules/sections/custom-code'
import type { OfferDrop, OfferScope } from './offerDrops'
import type { CompilableSection, CompiledSection } from './sectionCompiler'

/**
 * The Liquid scope a template is designed against.
 *
 * A template has no store, no catalogue and no offers — it is a layout, sold
 * to merchants who will attach their own. Compiling its sections against an
 * empty scope is therefore *correct* and also useless: every commerce section
 * takes its `{% else %}` branch and the template builder shows a page of empty
 * states, which is indistinguishable from the sections being broken.
 *
 * So templates render against sample data instead. It never reaches a
 * storefront: this scope is built only by the admin template builder's preview
 * action, and a page built from the template compiles against the merchant's
 * real store (see sectionCompiler.compilePageSections). The sample values are
 * deliberately obvious rather than plausible, so nobody mistakes a preview for
 * live data.
 */

const SAMPLE_CURRENCY = 'BDT'

function sampleProduct(
  index: number,
  title: string,
  priceCents: number,
  compareAtCents: number
) {
  return buildProductDrop({
    id: `sample-product-${index}`,
    title,
    handle: `sample-product-${index}`,
    description:
      'Sample product — a real product replaces this on a live page.',
    vendor: 'Sample vendor',
    productType: 'Sample',
    tags: ['sample'],
    publishedAt: new Date(0),
    createdAt: new Date(0),
    seoTitle: null,
    seoDescription: null,
    options: [{ name: 'Title', position: 1, values: ['Default'] }],
    images: [],
    variants: [
      {
        id: `sample-variant-${index}`,
        title: 'Default',
        sku: null,
        barcode: null,
        priceCents,
        compareAtPriceCents: compareAtCents,
        option1: 'Default',
        option2: null,
        option3: null,
        isTaxable: false,
        requiresShipping: true,
        weightGrams: 0,
        inventoryTracked: false,
        inventoryPolicy: 'DENY',
        imageId: null,
        availableQuantity: null,
      },
    ],
  })
}

function sampleOffer(
  index: number,
  label: string,
  priceCents: number,
  compareAtCents: number,
  badge: string | null
): OfferDrop {
  const savings = Math.max(0, compareAtCents - priceCents)

  return {
    key: `sample-offer-${index}`,
    kind: 'fixed',
    label,
    description: null,
    badge,
    image: null,
    is_default: index === 2,
    price: priceCents,
    compare_at_price: compareAtCents,
    savings,
    savings_percent:
      compareAtCents > 0 ? Math.round((savings / compareAtCents) * 100) : 0,
    min_quantity: index,
    max_quantity: index,
    items: [
      {
        title: 'Sample product',
        image: null,
        quantity: index,
        price: Math.round(priceCents / index),
      },
    ],
    tiers: [],
    url: '#order',
  }
}

/**
 * Three tiers, because that is the shape the bundle section is built around —
 * a template designed against one offer hides every "most popular" treatment
 * the section has.
 */
const SAMPLE_OFFERS: OfferScope = {
  offers: [
    sampleOffer(1, '১টি', 89000, 120000, null),
    sampleOffer(2, '২টি কম্বো', 159000, 240000, 'সবচেয়ে জনপ্রিয়'),
    sampleOffer(3, '৩টি ফ্যামিলি প্যাক', 219000, 360000, null),
  ],
  offer: null,
  shipping: {
    ask_zone: true,
    rates: [
      { id: 'sample-rate-inside', label: 'ঢাকার ভিতরে', price: 6000 },
      { id: 'sample-rate-outside', label: 'ঢাকার বাইরে', price: 12000 },
    ],
  },
  promotions: {
    free_shipping: { enabled: false, min_subtotal: 0, min_quantity: 0 },
    rules: [],
  },
}

export function buildTemplatePreviewScope(): StorefrontScope {
  const products = [
    sampleProduct(1, 'Sample product', 89000, 120000),
    sampleProduct(2, 'Second sample product', 45000, 60000),
  ]

  const offers: OfferScope = {
    ...SAMPLE_OFFERS,
    offer:
      SAMPLE_OFFERS.offers.find((candidate) => candidate.is_default) ??
      SAMPLE_OFFERS.offers[0] ??
      null,
  }

  return {
    shop: {
      name: 'Sample store',
      description: null,
      currency: SAMPLE_CURRENCY,
      locale: 'en',
      url: 'https://example.com',
      domain: 'example.com',
      email: null,
      phone: null,
      money_format: '{{amount}}',
      customer_accounts_enabled: false,
    },
    products,
    all_products: Object.fromEntries(
      products.map((product) => [product.handle, product])
    ),
    collections: [],
    ...offers,
  }
}

/**
 * Compiles a template's Liquid sections against the sample scope.
 *
 * The template gallery is where a merchant decides whether to buy a layout, and
 * it was showing them the layout with its commerce sections missing: Liquid is
 * compiled on the server and nothing on the template path ever ran the
 * compiler, so PageRenderer received sections with no `html`, found no React
 * definition for keys like `bundle-offer`, and rendered nothing at all.
 *
 * A failed section renders as an empty gap here rather than an error box — the
 * audience is a merchant browsing, not the admin who wrote the template.
 */
export async function compileTemplateSections(
  sections: CompilableSection[]
): Promise<CompiledSection[]> {
  const scope = buildTemplatePreviewScope()

  return Promise.all(
    sections.map(async (section) => {
      const base: CompiledSection = {
        id: section.id,
        order: section.order,
        content: section.content,
        config: section.config,
        isVisible: section.isVisible,
        componentDefinition: { key: section.componentDefinition.key },
      }

      const content = (section.content ?? {}) as Record<string, unknown>
      const isCustomCode = section.componentDefinition.key === 'custom-code'
      const source = isCustomCode
        ? typeof content.html === 'string'
          ? content.html
          : ''
        : section.componentDefinition.liquidSource

      if (
        !source ||
        (!isCustomCode && section.componentDefinition.renderMode !== 'LIQUID')
      ) {
        return base
      }

      const { html, error } = await renderLiquidSection({
        sectionId: section.id,
        source,
        content,
        scope,
        snippets: {},
      })

      if (error) {
        console.error(
          `Liquid compile failed for template section ${section.id}: ${error.message}`
        )
        return { ...base, html: '' }
      }

      if (!isCustomCode) return { ...base, html }

      const css = typeof content.css === 'string' ? content.css : ''
      const scoped =
        content.globalCss === true
          ? css
          : scopeCss(css, `[data-section-id="${section.id}"]`)

      return {
        ...base,
        html: scoped ? `<style>${scoped}</style>${html}` : html,
      }
    })
  )
}
