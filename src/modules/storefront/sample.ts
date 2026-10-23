import { minorUnitsPerMajor } from '@/lib/money'
import type {
  StoreCategory,
  StoreListing,
  StoreProductCard,
  StoreProductDetail,
} from '@/modules/sections/storefront'
import type { StorefrontCommerce } from '@/modules/sections/registry'

/**
 * Made-up products for designing a store before it has any.
 *
 * A merchant choosing a template, or opening the builder on a new store, would
 * otherwise be looking at empty grids and a product page with nothing on it —
 * and an empty grid tells them nothing about how their shop will look. These
 * stand in until the catalogue has real products, and only ever inside the
 * builder and the template gallery: the live site never shows a product that
 * does not exist.
 *
 * The pictures are drawn here as SVG rather than shipped as photos, so there
 * is no asset to host, license or lose, and they take the same flat, quiet
 * style whatever template they sit in.
 */

const W = 600
const H = 750

function svg(background: string, body: string): string {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${background}"/><ellipse cx="300" cy="618" rx="170" ry="16" fill="#000" opacity=".07"/>${body}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
}

const ART = {
  tee: (color: string, shade: string) =>
    `<path d="M222 204 266 190q34 30 68 0l44 14 92 48-32 92-36-16v236H198V328l-36 16-32-92z" fill="${color}"/><path d="M266 190q34 30 68 0l-8 2q-26 22-52 0z" fill="${shade}"/><path d="M198 328v14l-36 16-4-14zM402 328v14l36 16 4-14z" fill="${shade}" opacity=".5"/>`,
  tote: (color: string, shade: string) =>
    `<path d="M240 330v-60a60 60 0 0 1 120 0v60" fill="none" stroke="${shade}" stroke-width="14"/><path d="M180 330h240l-14 270H194z" fill="${color}"/><rect x="250" y="420" width="100" height="70" rx="8" fill="${shade}" opacity=".35"/>`,
  sneaker: (color: string, shade: string) =>
    `<path d="M130 520c0-40 30-70 70-80l90-70c30 0 40 30 70 40l90 30c40 14 60 40 60 80z" fill="${color}"/><path d="M120 520h400a30 30 0 0 1 0 60H140a20 20 0 0 1-20-20z" fill="#fff"/><path d="M120 560h420" stroke="${shade}" stroke-width="10"/><path d="M290 380l20 40M320 392l20 40M350 404l20 40" stroke="${shade}" stroke-width="8" stroke-linecap="round"/>`,
  watch: (color: string, shade: string) =>
    `<rect x="255" y="150" width="90" height="450" rx="30" fill="${shade}"/><circle cx="300" cy="375" r="105" fill="${color}"/><circle cx="300" cy="375" r="82" fill="#fff"/><path d="M300 375V318M300 375l40 24" stroke="${shade}" stroke-width="9" stroke-linecap="round"/><rect x="398" y="362" width="18" height="26" rx="5" fill="${color}"/>`,
  bottle: (color: string, shade: string) =>
    `<rect x="262" y="190" width="76" height="70" rx="10" fill="${shade}"/><rect x="282" y="250" width="36" height="40" fill="${shade}" opacity=".7"/><rect x="200" y="285" width="200" height="315" rx="34" fill="${color}"/><rect x="236" y="390" width="128" height="110" rx="10" fill="#fff" opacity=".55"/>`,
  mug: (color: string, shade: string) =>
    `<path d="M390 360h30a60 60 0 0 1 0 120h-30" fill="none" stroke="${color}" stroke-width="30"/><rect x="180" y="300" width="220" height="300" rx="26" fill="${color}"/><rect x="180" y="300" width="220" height="34" rx="14" fill="${shade}" opacity=".45"/>`,
  cap: (color: string, shade: string) =>
    `<path d="M150 470a150 150 0 0 1 300 0z" fill="${color}"/><path d="M300 320v150M226 340q40 60 40 130M374 340q-40 60-40 130" stroke="${shade}" stroke-width="5" opacity=".6" fill="none"/><path d="M150 470h300c60 0 110 20 120 50H160z" fill="${shade}"/><circle cx="300" cy="318" r="12" fill="${shade}"/>`,
  backpack: (color: string, shade: string) =>
    `<path d="M255 220a45 45 0 0 1 90 0" fill="none" stroke="${shade}" stroke-width="16"/><rect x="185" y="230" width="230" height="370" rx="60" fill="${color}"/><rect x="225" y="420" width="150" height="130" rx="24" fill="${shade}" opacity=".55"/><path d="M240 300h120" stroke="${shade}" stroke-width="10" stroke-linecap="round"/>`,
} as const

type Art = keyof typeof ART

function picture(art: Art, background: string, color: string, shade: string) {
  return svg(background, ART[art](color, shade))
}

interface SampleSpec {
  id: string
  handle: string
  title: string
  art: Art
  background: string
  color: string
  shade: string
  alt: [string, string, string]
  price: number
  compareAt?: number
  category: string
}

const SPECS: SampleSpec[] = [
  {
    id: 'sample-tee',
    handle: 'everyday-cotton-tee',
    title: 'Everyday cotton tee',
    art: 'tee',
    background: '#f1ece4',
    color: '#2f3640',
    shade: '#1e242b',
    alt: ['#e9eef2', '#d9e1e8', '#7f8c99'],
    price: 850,
    compareAt: 1100,
    category: 'sample-clothing',
  },
  {
    id: 'sample-tote',
    handle: 'canvas-tote-bag',
    title: 'Canvas tote bag',
    art: 'tote',
    background: '#e8efe6',
    color: '#d9c7a3',
    shade: '#8a7550',
    alt: ['#f4ede1', '#e6d6b8', '#a4885a'],
    price: 690,
    category: 'sample-bags',
  },
  {
    id: 'sample-sneaker',
    handle: 'city-runner-sneakers',
    title: 'City runner sneakers',
    art: 'sneaker',
    background: '#e6ecf3',
    color: '#c2462e',
    shade: '#7b2a1b',
    alt: ['#f3e9e6', '#e3c1b8', '#3d4a5c'],
    price: 3450,
    compareAt: 4200,
    category: 'sample-shoes',
  },
  {
    id: 'sample-watch',
    handle: 'classic-leather-watch',
    title: 'Classic leather watch',
    art: 'watch',
    background: '#f3eee9',
    color: '#b88a4a',
    shade: '#5b3d24',
    alt: ['#ebe5df', '#d6c7b6', '#2c2c2c'],
    price: 2900,
    category: 'sample-accessories',
  },
  {
    id: 'sample-perfume',
    handle: 'amber-eau-de-parfum',
    title: 'Amber eau de parfum',
    art: 'bottle',
    background: '#f6ede6',
    color: '#e0a35c',
    shade: '#6b4a2b',
    alt: ['#f1e6f0', '#e2bfd9', '#7a4a6e'],
    price: 1750,
    category: 'sample-accessories',
  },
  {
    id: 'sample-mug',
    handle: 'stoneware-coffee-mug',
    title: 'Stoneware coffee mug',
    art: 'mug',
    background: '#e9eef0',
    color: '#5f7f87',
    shade: '#2e454b',
    alt: ['#f2ede7', '#d8c8b3', '#8c6a46'],
    price: 450,
    category: 'sample-home',
  },
  {
    id: 'sample-cap',
    handle: 'weekend-cotton-cap',
    title: 'Weekend cotton cap',
    art: 'cap',
    background: '#efece4',
    color: '#3f5f4b',
    shade: '#24382b',
    alt: ['#ecebf2', '#cfcde0', '#45436a'],
    price: 550,
    compareAt: 650,
    category: 'sample-accessories',
  },
  {
    id: 'sample-backpack',
    handle: 'commuter-backpack',
    title: 'Commuter backpack',
    art: 'backpack',
    background: '#e7ebef',
    color: '#4a5568',
    shade: '#2b3240',
    alt: ['#f1ece6', '#ddcdb9', '#8b6b48'],
    price: 2250,
    category: 'sample-bags',
  },
]

/** Sample prices are written in major units and scaled per currency. */
function cents(amount: number, currencyCode: string): number {
  // A sample priced at "850" should read as ৳850 or $8.50 — shown in the
  // shop's own currency, at a plausible size for it.
  const major = currencyCode === 'BDT' || currencyCode === 'INR' ? 1 : 0.02
  return Math.round(amount * major) * minorUnitsPerMajor(currencyCode)
}

export const SAMPLE_CATEGORIES: StoreCategory[] = [
  { id: 'sample-clothing', name: 'Clothing', art: 'tee' as Art },
  { id: 'sample-bags', name: 'Bags', art: 'backpack' as Art },
  { id: 'sample-shoes', name: 'Shoes', art: 'sneaker' as Art },
  { id: 'sample-accessories', name: 'Accessories', art: 'watch' as Art },
  { id: 'sample-home', name: 'Home', art: 'mug' as Art },
].map((category) => {
  const spec = SPECS.find((s) => s.art === category.art)!
  return {
    id: category.id,
    handle: category.name.toLowerCase(),
    name: category.name,
    parentId: null,
    imageUrl: picture(spec.art, spec.background, spec.color, spec.shade),
    productCount: SPECS.filter((s) => s.category === category.id).length,
  }
})

export function sampleProductCards(currencyCode: string): StoreProductCard[] {
  return SPECS.map((spec) => ({
    id: spec.id,
    handle: spec.handle,
    title: spec.title,
    imageUrl: picture(spec.art, spec.background, spec.color, spec.shade),
    hoverImageUrl: picture(spec.art, spec.alt[0], spec.alt[2], spec.shade),
    priceCents: cents(spec.price, currencyCode),
    compareAtPriceCents: spec.compareAt
      ? cents(spec.compareAt, currencyCode)
      : null,
    priceVaries: false,
    available: spec.id !== 'sample-mug',
    // One-tap add for everything but the tee, which has sizes — so a
    // merchant previewing a grid sees both buttons a real shop shows.
    quickAddVariantId:
      spec.id === 'sample-tee' || spec.id === 'sample-mug'
        ? null
        : `${spec.id}-default`,
    vendor: null,
  }))
}

/** The tee, in three colours and four sizes — every control a product page has. */
export function sampleProductDetail(currencyCode: string): StoreProductDetail {
  const spec = SPECS[0]!
  const card = sampleProductCards(currencyCode)[0]!
  const colours = [
    { name: 'Charcoal', color: spec.color, background: spec.background },
    { name: 'Sky', color: spec.alt[2], background: spec.alt[0] },
    { name: 'Sand', color: '#c8a978', background: '#f4efe6' },
  ]
  const sizes = ['S', 'M', 'L', 'XL']
  const images = colours.map((colour) => ({
    url: picture('tee', colour.background, colour.color, spec.shade),
    alt: `${spec.title} in ${colour.name.toLowerCase()}`,
  }))

  return {
    ...card,
    imageUrl: images[0]!.url,
    hoverImageUrl: images[1]!.url,
    descriptionHtml:
      '<p>Soft, breathable cotton that keeps its shape wash after wash. Cut for an easy, everyday fit.</p><ul><li>100% combed cotton, 180 GSM</li><li>Pre-shrunk, so the size you order stays the size you wear</li><li>Machine wash cold</li></ul>',
    images,
    options: [
      { name: 'Colour', values: colours.map((colour) => colour.name) },
      { name: 'Size', values: sizes },
    ],
    variants: colours.flatMap((colour, colourIndex) =>
      sizes.map((size, sizeIndex) => ({
        id: `sample-tee-${colourIndex}-${sizeIndex}`,
        title: `${colour.name} / ${size}`,
        options: [colour.name, size],
        priceCents: card.priceCents,
        compareAtPriceCents: card.compareAtPriceCents,
        // One sold-out size and one nearly gone, so a merchant designing the
        // page sees how both are shown before a real shopper does.
        available: !(colourIndex === 0 && size === 'XL'),
        stockLeft: colourIndex === 0 && size === 'L' ? 3 : null,
        imageUrl: images[colourIndex]!.url,
      }))
    ),
    categoryId: 'sample-clothing',
    tags: [],
  }
}

export function sampleListing(currencyCode: string): StoreListing {
  const products = sampleProductCards(currencyCode)
  return {
    kind: 'category',
    title: 'Clothing',
    description: 'Everyday pieces, made to be worn again and again.',
    imageUrl: null,
    handle: 'clothing',
    query: null,
    products,
    total: products.length,
    page: 1,
    pageCount: 1,
    sort: 'featured',
    subcategories: [],
  }
}

/**
 * A made-up offer for previewing a landing page template.
 *
 * The order form is the point of a landing page, and a template previewed with
 * "add an offer to see the form" where the form should be shows the merchant
 * everything except the one part that matters. Two packages and two delivery
 * areas — the shape of nearly every real page — so the preview shows the form
 * a shopper will actually see.
 */
export function sampleCommerce(currencyCode: string): StorefrontCommerce {
  const product = sampleProductDetail(currencyCode)
  const unit = product.priceCents
  const line = (quantity: number) => ({
    productId: product.id,
    title: product.title,
    imageUrl: product.imageUrl,
    quantity,
    pinnedVariantId: null,
    variants: product.variants
      .filter((variant) => variant.options[0] === 'Charcoal')
      .map((variant) => ({
        id: variant.id,
        title: variant.options[1] ?? variant.title,
        priceCents: variant.priceCents,
        available: variant.available,
        excluded: false,
        pricing: null,
      })),
  })
  const offer = (
    key: string,
    label: string,
    quantity: number,
    price: number,
    badge: string | null,
    isDefault: boolean
  ) => ({
    key,
    kind: 'FIXED' as const,
    label,
    description: null,
    badge,
    imageUrl: product.imageUrl,
    isDefault,
    items: [line(quantity)],
    pool: [],
    tiers: [],
    tierMode: 'EXACT' as const,
    gift: null,
    minQuantity: quantity,
    maxQuantity: quantity,
    pricing: { mode: 'FIXED' as const, priceCents: price, discountBps: 0 },
    compareAtCents: unit * quantity,
    headlinePriceCents: price,
  })

  return {
    pageId: 'sample-page',
    storeId: 'sample-store',
    currencyCode,
    offers: [
      offer('one', '1 piece', 1, unit, null, true),
      offer(
        'two',
        '2 pieces',
        2,
        Math.round((unit * 2 * 0.9) / 100) * 100,
        'Best value',
        false
      ),
    ],
    shipping: {
      askZone: true,
      rates: [
        {
          id: 'inside',
          label: 'Inside Dhaka',
          priceCents: cents(60, currencyCode),
        },
        {
          id: 'outside',
          label: 'Outside Dhaka',
          priceCents: cents(120, currencyCode),
        },
      ],
    },
    promotions: {
      freeShipping: { enabled: false, minSubtotalCents: 0, minQuantity: 0 },
      discountRules: [],
    },
  }
}

/**
 * Sample cards for a block asking for `limit` products — repeated when it
 * asks for more than there are samples, with distinct ids so a grid of twelve
 * does not render one product's key twelve times.
 */
export function sampleCardsFor(
  limit: number,
  currencyCode: string,
  excludeId?: string
): StoreProductCard[] {
  const pool = sampleProductCards(currencyCode).filter(
    (card) => card.id !== excludeId
  )
  return Array.from({ length: Math.min(limit, 12) }, (_, index) => {
    const card = pool[index % pool.length]!
    return index < pool.length ? card : { ...card, id: `${card.id}-${index}` }
  })
}
