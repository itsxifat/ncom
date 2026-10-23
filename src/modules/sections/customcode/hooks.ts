import type { PublicOffer, PublicShipping } from '@/lib/offers/types'
import type { StoreText } from '@/modules/storefront/i18n'
import { storePaths, type SiteKind, type StoreProductCard } from '../storefront'

/**
 * NCOM hooks: how a custom-code design talks to the shop it sits in.
 *
 * A custom-code block is the merchant's own HTML, drawn exactly as written —
 * which is the freedom, and also the trouble. A price typed into a design is
 * wrong the day the offer changes; a "Buy now" button that is only a picture
 * of a button sells nothing. Scripts are not allowed in the block, so the
 * design cannot reach the cart itself. Instead it names what it means with
 * `data-ncom-*` attributes, and NCOM does the rest:
 *
 *   <a data-ncom-order="combo">Order the combo</a>
 *   <span data-ncom-price="combo">৳990</span>
 *
 * The words between the tags are the design's own fallback — what an AI's
 * preview or a designer's mock-up shows — and on an NCOM page they are
 * replaced with the live figure. Every value a hook names is looked up
 * against what the page really sells: on a landing page an offer (by key, or
 * by its name), on a store a product (by id, or by the handle in its
 * address). A hook that names nothing is left exactly as written, and the
 * builder outlines it so the merchant can see which one.
 *
 * Two halves. `bindHooks` runs at render, on the server for the live site and
 * in the canvas while editing, over markup that has already been sanitised —
 * so the markup it walks is regular, and nothing it writes is markup. The
 * clicks are handled by `CustomCodeFrame`, which reads the attributes this
 * writes (`data-ncom-act` and friends) and never anything the merchant wrote:
 * those names are reserved and stripped from the design on the way in.
 */

/** One hook, as the guide, the docs and the builder describe it. */
export interface HookReference {
  attribute: string
  /** What it does on each kind of site; null where it means nothing. */
  landing: string | null
  store: string | null
}

/**
 * Every hook there is. The AI guide, the docs page and the builder's
 * "Connect to your shop" panel all read this list, so a hook added here is
 * documented everywhere at once.
 */
export const HOOK_REFERENCE: HookReference[] = [
  {
    attribute: 'data-ncom-order',
    landing:
      'Click: scrolls to the order form. With an offer key ("combo"), also picks that offer in the form.',
    store: null,
  },
  {
    attribute: 'data-ncom-add-to-cart',
    landing: 'Same as data-ncom-order.',
    store:
      'Click: adds the product to the cart and opens it. A product with sizes or colours opens its own page so the shopper can choose.',
  },
  {
    attribute: 'data-ncom-buy-now',
    landing: 'Same as data-ncom-order.',
    store:
      'Click: adds the product to the cart and goes straight to checkout (or opens the product page to choose a size first).',
  },
  {
    attribute: 'data-ncom-price',
    landing: 'Text: the offer’s price.',
    store: 'Text: the product’s price.',
  },
  {
    attribute: 'data-ncom-regular-price',
    landing:
      'Text: the price before the discount. Hidden when there is no discount.',
    store: 'Text: the compare-at price. Hidden when there is no discount.',
  },
  {
    attribute: 'data-ncom-saving',
    landing: 'Text: how much the offer saves. Hidden when it saves nothing.',
    store: 'Text: how much the discount saves. Hidden when there is none.',
  },
  {
    attribute: 'data-ncom-name',
    landing: 'Text: the offer’s name.',
    store: 'Text: the product’s name.',
  },
  {
    attribute: 'data-ncom-image',
    landing: 'On an <img>: the offer’s photo, when it has one.',
    store: 'On an <img>: the product’s main photo.',
  },
  {
    attribute: 'data-ncom-delivery',
    landing:
      'Text: a delivery charge — the cheapest, or the area you name ("Inside Dhaka").',
    store: null,
  },
  {
    attribute: 'data-ncom-in-stock',
    landing: null,
    store: 'Shown only while the product is in stock.',
  },
  {
    attribute: 'data-ncom-sold-out',
    landing: null,
    store: 'Shown only when the product is sold out.',
  },
]

/** The hooks whose value names a product, on a store. */
const PRODUCT_HOOKS = [
  'price',
  'regular-price',
  'saving',
  'name',
  'image',
  'in-stock',
  'sold-out',
  'add-to-cart',
  'buy-now',
] as const

/** Every hook name, without its `data-ncom-` prefix. */
const KNOWN_HOOKS = new Set(
  HOOK_REFERENCE.map((hook) => hook.attribute.slice('data-ncom-'.length))
)

/** Hooks that make the element do something when clicked. */
const ACTION_HOOKS = new Set(['order', 'add-to-cart', 'buy-now'])

/**
 * Attributes only this file writes, for `CustomCodeFrame` to act on. A design
 * that writes them itself has them removed: what a click does is decided
 * here, from what the page sells, never by the markup.
 */
const INTERNAL_ATTRIBUTES = new Set([
  'data-ncom-act',
  'data-ncom-offer',
  'data-ncom-variant',
  'data-ncom-product-id',
  'data-ncom-href',
  'data-ncom-missing',
])

/** Elements a click already reaches with the keyboard. */
const INTERACTIVE_TAGS = new Set(['a', 'button'])

/** Elements with no closing tag in sanitised markup. */
const VOID_TAGS = new Set(['br', 'hr', 'wbr', 'img', 'source', 'col'])

/** The most product references one block may make. */
export const MAX_PRODUCT_REFS = 24

/**
 * The products a design names, from its raw HTML, so the page can load them
 * before it renders (see the block's `productQuery`).
 *
 * Every repetition in the pattern is bounded, because this runs on whatever
 * was pasted, on every render of a store page.
 */
export function productRefsIn(html: string): string[] {
  if (!html.includes('data-ncom-')) return []
  const pattern = new RegExp(
    `\\bdata-ncom-(?:${PRODUCT_HOOKS.join('|')})\\s{0,8}=\\s{0,8}(?:"([^"<>]{1,200})"|'([^'<>]{1,200})'|([^\\s"'<>=\`]{1,200}))`,
    'gi'
  )
  const refs = new Set<string>()
  for (const match of html.slice(0, 120_000).matchAll(pattern)) {
    const ref = decodeAttribute(match[1] ?? match[2] ?? match[3] ?? '').trim()
    if (ref) refs.add(ref)
    if (refs.size >= MAX_PRODUCT_REFS) break
  }
  return [...refs]
}

export interface HookContext {
  site: SiteKind | null
  /** A landing page's offers and delivery rates. */
  offers: PublicOffer[]
  shipping: PublicShipping | null
  /** The products this block named, on a store. */
  products: StoreProductCard[]
  /**
   * Put in front of the store's own links (`/products/…`), as every block's
   * links are: empty on the live site, the store's address in a preview.
   */
  linkBase: string
  currencyCode: string
  /** The site's words and digits, so a Bangla shop writes ৳১,২৫০. */
  text: StoreText
  /**
   * On the canvas: hooks that name nothing are marked, and live figures say
   * where they come from, so the merchant can see what is connected.
   */
  editing: boolean
}

interface Attribute {
  name: string
  /** Decoded. Null for an attribute written without a value. */
  value: string | null
}

/**
 * Fills in a sanitised design's hooks: live figures in place of the
 * designer's, the attributes its buttons are clicked by, and store links
 * that work in a preview.
 *
 * `markup` must be `sanitizeCustomCode` output. That is what makes walking it
 * this simply sound: every tag is one this sanitiser wrote, lower-case, with
 * double-quoted values in which no `"` or `>` survives unescaped, every
 * element closed, and the only `<style>` first.
 */
export function bindHooks(markup: string, context: HookContext): string {
  const rewritesLinks = context.site === 'STORE' && context.linkBase !== ''
  if (!markup.includes('data-ncom-') && !rewritesLinks) return markup

  const out: string[] = []
  let cursor = 0
  while (cursor < markup.length) {
    const lt = markup.indexOf('<', cursor)
    if (lt === -1) {
      out.push(markup.slice(cursor))
      break
    }
    out.push(markup.slice(cursor, lt))

    // The stylesheet's `>` combinators are not tag ends.
    if (markup.startsWith('<style>', lt)) {
      const close = markup.indexOf('</style>', lt)
      const end = close === -1 ? markup.length : close + '</style>'.length
      out.push(markup.slice(lt, end))
      cursor = end
      continue
    }

    const gt = markup.indexOf('>', lt)
    if (gt === -1) {
      out.push(markup.slice(lt))
      break
    }
    const tag = markup.slice(lt, gt + 1)
    cursor = gt + 1
    const parsed = tag[1] === '/' ? null : parseStartTag(tag)
    if (!parsed) {
      out.push(tag)
      continue
    }

    const bound = bindElement(parsed.name, parsed.attributes, context)
    out.push(writeStartTag(parsed.name, bound.attributes))
    if (bound.text !== undefined && !VOID_TAGS.has(parsed.name)) {
      // The designer's own words go; the element's closing tag stays, and is
      // written by the loop when it reaches it.
      const close = closingTagAt(markup, cursor)
      if (close !== -1) {
        out.push(escapeText(bound.text))
        cursor = close
      }
    }
  }
  return out.join('')
}

function bindElement(
  tag: string,
  written: Attribute[],
  context: HookContext
): { attributes: Attribute[]; text?: string } {
  const attributes = written.filter(
    (attribute) => !INTERNAL_ATTRIBUTES.has(attribute.name)
  )
  // Only names this file knows: the builder's own `data-ncom-at` position
  // markers ride on every element of the canvas, and a misspelt hook should
  // do nothing rather than something.
  const hooks = attributes.filter(
    (attribute) =>
      attribute.name.startsWith('data-ncom-') &&
      KNOWN_HOOKS.has(attribute.name.slice('data-ncom-'.length))
  )

  if (tag === 'a' && context.site === 'STORE' && context.linkBase) {
    const href = attributes.find((attribute) => attribute.name === 'href')
    if (href?.value?.startsWith('/') && !href.value.startsWith('//')) {
      href.value = `${context.linkBase}${href.value}`
    }
  }
  if (!hooks.length) return { attributes }

  const set = (name: string, value: string | null) => {
    const existing = attributes.find((attribute) => attribute.name === name)
    if (existing) existing.value = value
    else attributes.push({ name, value })
  }
  const remove = (name: string) => {
    const index = attributes.findIndex((attribute) => attribute.name === name)
    if (index !== -1) attributes.splice(index, 1)
  }
  const has = (name: string) =>
    attributes.some((attribute) => attribute.name === name)

  let text: string | undefined
  const missing: string[] = []
  const live: string[] = []

  for (const hook of hooks) {
    const kind = hook.name.slice('data-ncom-'.length)
    const ref = (hook.value ?? '').trim()

    if (context.site === 'LANDING') {
      if (kind === 'delivery') {
        const rate = deliveryRate(context.shipping, ref)
        if (!rate) {
          missing.push(
            ref
              ? `No delivery area called “${ref}”.`
              : 'This page has no delivery charges yet.'
          )
          continue
        }
        text =
          rate.priceCents === 0
            ? context.text.words.free
            : context.text.price(rate.priceCents, context.currencyCode)
        live.push(`Delivery charge for “${rate.label}”`)
        continue
      }

      const offer = findOffer(context.offers, ref)
      if (ACTION_HOOKS.has(kind)) {
        set('data-ncom-act', 'order')
        set('data-ncom-offer', offer?.key ?? '')
        if (tag === 'a' && !has('href')) set('href', '#order')
        if (ref && !offer) missing.push(`No offer called “${ref}”.`)
        continue
      }
      if (kind === 'in-stock') continue
      if (kind === 'sold-out') {
        set('hidden', null)
        continue
      }
      if (!offer) {
        missing.push(
          ref
            ? `No offer called “${ref}”.`
            : 'This page has no offers yet — add one under Delivery & offers.'
        )
        continue
      }
      const figure = offerFigure(kind, offer, context)
      if (figure === null) set('hidden', null)
      else if (figure !== undefined) text = figure
      if (kind === 'image' && tag === 'img' && offer.imageUrl) {
        setImage(attributes, set, remove, offer.imageUrl)
      }
      live.push(`From your offer “${offer.label}”`)
      continue
    }

    if (context.site === 'STORE') {
      if (kind === 'order' || kind === 'delivery') {
        missing.push(
          kind === 'order'
            ? 'Order buttons work on landing pages. On a store, use data-ncom-add-to-cart.'
            : 'Delivery charges are shown at checkout on a store.'
        )
        continue
      }
      const product = findProduct(context.products, ref)
      if (!product) {
        missing.push(
          ref
            ? `No product “${ref}” in your catalogue.`
            : 'Name a product: its handle (from its address) or its id.'
        )
        continue
      }
      const paths = storePaths(context.linkBase)
      if (ACTION_HOOKS.has(kind)) {
        set('data-ncom-act', kind === 'buy-now' ? 'buy' : 'add')
        set('data-ncom-product-id', product.id)
        set('data-ncom-variant', product.quickAddVariantId ?? '')
        set('data-ncom-href', paths.product(product.handle))
        if (tag === 'a' && !has('href'))
          set('href', paths.product(product.handle))
        if (!product.available) set('aria-disabled', 'true')
        continue
      }
      if (kind === 'in-stock') {
        if (!product.available) set('hidden', null)
        continue
      }
      if (kind === 'sold-out') {
        if (product.available) set('hidden', null)
        continue
      }
      const figure = productFigure(kind, product, context)
      if (figure === null) set('hidden', null)
      else if (figure !== undefined) text = figure
      if (kind === 'image' && tag === 'img' && product.imageUrl) {
        setImage(attributes, set, remove, product.imageUrl)
      }
      live.push(`From your product “${product.title}”`)
      continue
    }

    // A preview with no page behind it — a template — has nothing to look
    // hooks up in, so the design shows exactly as written.
  }

  // Something clickable that is not a link or a button is reached by Tab and
  // announced as a button, the way a real one would be.
  if (has('data-ncom-act') && !INTERACTIVE_TAGS.has(tag)) {
    if (!has('role')) set('role', 'button')
    if (!has('tabindex')) set('tabindex', '0')
  }

  if (context.editing) {
    if (missing.length) {
      set('data-ncom-missing', missing.join(' '))
      if (!has('title')) set('title', missing.join(' '))
    } else if (live.length && !has('title')) {
      set('title', `${live[0]} — it updates on its own.`)
    }
  }

  return { attributes, text }
}

function offerFigure(
  kind: string,
  offer: PublicOffer,
  context: HookContext
): string | null | undefined {
  const price = (cents: number) =>
    context.text.price(cents, context.currencyCode)
  const saving = offer.compareAtCents - offer.headlinePriceCents
  switch (kind) {
    case 'price':
      return price(offer.headlinePriceCents)
    case 'regular-price':
      return saving > 0 ? price(offer.compareAtCents) : null
    case 'saving':
      return saving > 0 ? price(saving) : null
    case 'name':
      return offer.label
    default:
      return undefined
  }
}

function productFigure(
  kind: string,
  product: StoreProductCard,
  context: HookContext
): string | null | undefined {
  const price = (cents: number) =>
    context.text.price(cents, context.currencyCode)
  const compare = product.compareAtPriceCents ?? 0
  const saving = compare - product.priceCents
  switch (kind) {
    case 'price':
      return product.priceVaries
        ? `${context.text.words.from} ${price(product.priceCents)}`
        : price(product.priceCents)
    case 'regular-price':
      return saving > 0 ? price(compare) : null
    case 'saving':
      return saving > 0 ? price(saving) : null
    case 'name':
      return product.title
    default:
      return undefined
  }
}

/**
 * An image a hook supplies. `srcset` and `sizes` go with the old picture —
 * a browser that finds them would keep drawing the designer's photo.
 */
function setImage(
  attributes: Attribute[],
  set: (name: string, value: string | null) => void,
  remove: (name: string) => void,
  url: string
) {
  remove('srcset')
  remove('sizes')
  set('src', url)
  if (!attributes.some((attribute) => attribute.name === 'alt')) set('alt', '')
}

/** An offer by key, else by its name; no name means the page's main offer. */
function findOffer(offers: PublicOffer[], ref: string): PublicOffer | null {
  if (!ref) return offers.find((offer) => offer.isDefault) ?? offers[0] ?? null
  const lower = ref.toLowerCase()
  return (
    offers.find((offer) => offer.key === ref) ??
    offers.find((offer) => offer.label.trim().toLowerCase() === lower) ??
    null
  )
}

/** A product by id, else by handle. */
function findProduct(
  products: StoreProductCard[],
  ref: string
): StoreProductCard | null {
  if (!ref) return null
  const lower = ref.toLowerCase()
  return (
    products.find((product) => product.id === ref) ??
    products.find((product) => product.handle.toLowerCase() === lower) ??
    null
  )
}

/** A delivery area by name; no name means the cheapest. */
function deliveryRate(shipping: PublicShipping | null, ref: string) {
  const rates = shipping?.rates ?? []
  if (!ref) {
    return rates.reduce<(typeof rates)[number] | null>(
      (cheapest, rate) =>
        !cheapest || rate.priceCents < cheapest.priceCents ? rate : cheapest,
      null
    )
  }
  const lower = ref.toLowerCase()
  return rates.find((rate) => rate.label.trim().toLowerCase() === lower) ?? null
}

// ── Sanitised markup ─────────────────────────────────────────────────────

const START_TAG_NAME = /^<([a-z][a-z0-9:-]*)/
const ATTRIBUTE = /\s([^\s="]+)(?:="([^"]*)")?/g

function parseStartTag(
  tag: string
): { name: string; attributes: Attribute[] } | null {
  const name = START_TAG_NAME.exec(tag)?.[1]
  if (!name) return null
  const attributes: Attribute[] = []
  const body = tag.slice(name.length + 1, tag.endsWith('/>') ? -2 : -1)
  for (const match of body.matchAll(ATTRIBUTE)) {
    attributes.push({
      name: match[1]!,
      value: match[2] === undefined ? null : decodeAttribute(match[2]),
    })
  }
  return { name, attributes }
}

function writeStartTag(name: string, attributes: Attribute[]): string {
  const written = attributes.map((attribute) =>
    attribute.value === null
      ? attribute.name
      : `${attribute.name}="${escapeAttribute(attribute.value)}"`
  )
  return `<${name}${written.length ? ` ${written.join(' ')}` : ''}>`
}

/**
 * Where the element whose content starts at `from` closes: the index of its
 * closing tag. Sanitised markup closes every element it opens, so counting
 * opens against closes is enough.
 */
function closingTagAt(markup: string, from: number): number {
  let depth = 0
  let cursor = from
  while (cursor < markup.length) {
    const lt = markup.indexOf('<', cursor)
    if (lt === -1) return -1
    const gt = markup.indexOf('>', lt)
    if (gt === -1) return -1
    if (markup[lt + 1] === '/') {
      if (depth === 0) return lt
      depth -= 1
    } else {
      const name = START_TAG_NAME.exec(markup.slice(lt, lt + 40))?.[1]
      if (name && !VOID_TAGS.has(name)) depth += 1
    }
    cursor = gt + 1
  }
  return -1
}

function decodeAttribute(value: string): string {
  return value.replace(
    /&(amp|quot|#39|lt|gt);/g,
    (_, entity: string) =>
      ({ amp: '&', quot: '"', '#39': "'", lt: '<', gt: '>' })[entity] ?? ''
  )
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
