/**
 * Proves an excluded size is out of the offer, not off the shelf.
 *
 * A merchant running "any 3 shirts for 1000" almost always means "except the
 * XL, which is already thin". They say so by excluding that size — and until
 * now saying so deleted the XL from the order form. The size was still in the
 * catalogue, still in stock, still narrowed into the offer's own shortlist, and
 * a buyer who came for it found the product listed in every size but theirs
 * with nothing on the page admitting it existed. The merchant had reached for a
 * pricing rule and been handed a stock rule.
 *
 * What it means now is the useful reading: the size is sold, at its own list
 * price, and no part of the offer touches it. The arithmetic that has to hold
 * for that to be true, and which this file checks:
 *
 *   - the offer's discount never reaches an excluded piece;
 *   - an excluded piece fills no rung of a ladder and pays for no rung's
 *     overflow, so "3 for 1000" cannot be bought with two shirts and an XL;
 *   - it neither fills a minimum nor uses up a maximum;
 *   - a basket of nothing *but* excluded sizes still sells, at list, rather
 *     than being refused for missing a minimum it was never part of;
 *   - the offer's headline price is never quoted from an excluded size.
 *
 *   pnpm check:offer-exclusions
 *
 * No database and no network: lib/offers/pricing is pure arithmetic, and it is
 * the same module the order route charges with and the browser previews with.
 */

import {
  headlinePrice,
  priceVariesByVariant,
  quoteOffer,
} from '@/lib/offers/pricing'
import type {
  OfferLine,
  OfferSelectionItem,
  OfferVariantChoice,
  PublicOffer,
} from '@/lib/offers/types'

let failures = 0

function check(condition: boolean, message: string) {
  if (condition) console.log(`  \x1b[32m✓\x1b[0m ${message}`)
  else {
    failures += 1
    console.log(`  \x1b[31m✗\x1b[0m ${message}`)
  }
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`)
}

// ── The goods ───────────────────────────────────────────────────────────────
//
// One shirt at three sizes. The XL lists higher, which is usually why it is the
// one kept out of the promotion.

function size(
  id: string,
  priceCents: number,
  options: { excluded?: boolean } = {}
): OfferVariantChoice {
  return {
    id,
    title: id.toUpperCase(),
    priceCents,
    available: true,
    excluded: options.excluded ?? false,
    pricing: null,
  }
}

function shirt(variants: OfferVariantChoice[]): OfferLine {
  return {
    productId: 'shirt',
    title: 'Cotton shirt',
    imageUrl: null,
    quantity: 1,
    pinnedVariantId: null,
    variants,
  }
}

const M = () => size('m', 500)
const L = () => size('l', 500)
const XL = () => size('xl', 600, { excluded: true })

const POOL = [shirt([M(), L(), XL()])]

function offer(overrides: Partial<PublicOffer>): PublicOffer {
  return {
    key: 'test',
    kind: 'ALACARTE',
    label: 'Test offer',
    description: null,
    badge: null,
    imageUrl: null,
    isDefault: true,
    items: [],
    pool: POOL,
    tiers: [],
    tierMode: 'EXACT',
    gift: null,
    minQuantity: 0,
    maxQuantity: 0,
    pricing: { mode: 'PERCENT', priceCents: 0, discountBps: 2000 },
    compareAtCents: 0,
    headlinePriceCents: 0,
    ...overrides,
  }
}

/** Prices a basket against an offer, resolving ids out of its own lines. */
function quote(subject: PublicOffer, picks: Record<string, number>) {
  const variants = new Map<string, OfferVariantChoice>()
  for (const line of [...subject.items, ...subject.pool]) {
    for (const variant of line.variants) variants.set(variant.id, variant)
  }

  const selections: OfferSelectionItem[] = Object.entries(picks).map(
    ([variantId, quantity]) => ({ productId: 'shirt', variantId, quantity })
  )

  return quoteOffer(subject, selections, (id) => variants.get(id) ?? null)
}

function main() {
  section('À la carte — 20% off, XL kept out of it')
  {
    const subject = offer({})

    const mixed = quote(subject, { m: 2, xl: 1 })
    // 2 × 500 discounted to 800, plus the XL at its own 600.
    check(
      mixed.error === null,
      'a basket holding the XL is priced, not refused'
    )
    check(mixed.goodsCents === 1400, `goods are 1400 (got ${mixed.goodsCents})`)
    check(
      mixed.regularCents === 1600,
      `list total is 1600 (got ${mixed.regularCents})`
    )
    check(mixed.savingCents === 200, `saving is 200 (got ${mixed.savingCents})`)
    check(
      mixed.outsideOfferCents === 600,
      `600 of it is outside the offer (got ${mixed.outsideOfferCents})`
    )
    check(mixed.quantity === 3, `all 3 pieces are in the basket`)

    const only = quote(subject, { xl: 2 })
    check(
      only.error === null && only.goodsCents === 1200,
      'a basket of nothing but the excluded size sells at list'
    )
    check(
      only.savingCents === 0,
      'and claims no saving, because the offer did nothing'
    )
  }

  section('À la carte — the excluded size is not what the card advertises')
  {
    // The XL is the cheapest thing in the pool here, so a headline that took
    // the cheapest sellable option would lead with the one size the discount
    // never reaches.
    const cheapXL = [
      shirt([size('m', 900), size('xl', 400, { excluded: true })]),
    ]
    const subject = offer({ pool: cheapXL, minQuantity: 1 })

    check(
      headlinePrice(subject) === 720,
      `leads with 20% off the M, 720 (got ${headlinePrice(subject)})`
    )
    check(
      priceVariesByVariant(subject),
      'and says the price depends on which size, so the card reads "from"'
    )

    const allOut = offer({
      pool: [shirt([size('m', 900, { excluded: true })])],
      minQuantity: 1,
    })
    check(
      headlinePrice(allOut) === 900,
      'a pool that is entirely excluded still names a price — its list price'
    )
  }

  section('Mix & match ladder — an excluded piece fills no rung')
  {
    const subject = offer({
      kind: 'COLLECTION',
      pricing: { mode: 'AUTO', priceCents: 0, discountBps: 0 },
      tiers: [
        { quantity: 3, reward: 'PRICE', priceCents: 1000, discountBps: 0 },
      ],
    })

    const full = quote(subject, { m: 2, l: 1, xl: 1 })
    check(
      full.error === null && full.goodsCents === 1600,
      `three shirts at the rung plus the XL at list is 1600 (got ${full.goodsCents})`
    )
    check(
      full.outsideOfferCents === 600,
      'and 600 of that is named as outside the offer'
    )

    const short = quote(subject, { m: 2, xl: 1 })
    check(
      short.error !== null,
      'two shirts and an XL cannot buy a three-shirt rung'
    )
    check(
      short.error?.includes('at least 3 items from this offer') === true,
      `and the refusal says which pieces it counted (got "${short.error}")`
    )

    const none = quote(subject, { xl: 1 })
    check(
      none.error === null && none.goodsCents === 600,
      'one XL on its own sells at list rather than being refused for the minimum'
    )

    // A gapped ladder is where the rung message itself appears: 3 is inside the
    // 2–5 bounds and still priced by nobody.
    const gapped = offer({
      kind: 'COLLECTION',
      pricing: { mode: 'AUTO', priceCents: 0, discountBps: 0 },
      tiers: [
        { quantity: 2, reward: 'PRICE', priceCents: 900, discountBps: 0 },
        { quantity: 5, reward: 'PRICE', priceCents: 2000, discountBps: 0 },
      ],
    })
    const offRung = quote(gapped, { m: 2, l: 1, xl: 1 })
    check(
      offRung.error?.includes('you have 3 in it') === true,
      `an off-rung basket counts only the offer's pieces (got "${offRung.error}")`
    )
  }

  section('Threshold ladder — the overflow is priced from covered pieces only')
  {
    const subject = offer({
      kind: 'COLLECTION',
      tierMode: 'THRESHOLD',
      pricing: { mode: 'AUTO', priceCents: 0, discountBps: 0 },
      tiers: [
        { quantity: 3, reward: 'PRICE', priceCents: 1000, discountBps: 0 },
      ],
    })

    // Four covered pieces: the rung takes three, the cheapest covered unit
    // overflows at 500. The XL is charged at 600 beside all of it, and must
    // never be the unit the overflow picks up.
    const over = quote(subject, { m: 2, l: 2, xl: 1 })
    check(
      over.error === null && over.goodsCents === 2100,
      `1000 + one 500 at list + the XL's 600 is 2100 (got ${over.goodsCents})`
    )
  }

  section('Bounds — an excluded piece uses up no allowance')
  {
    const subject = offer({ minQuantity: 2, maxQuantity: 3 })

    const atCap = quote(subject, { m: 2, l: 1, xl: 2 })
    check(
      atCap.error === null,
      'three covered pieces plus two XLs is inside a maximum of three'
    )

    const overCap = quote(subject, { m: 2, l: 2 })
    check(
      overCap.error?.includes('up to 3') === true,
      'while a fourth covered piece is not'
    )

    const underMin = quote(subject, { m: 1, xl: 3 })
    check(
      underMin.error?.includes('from this offer') === true,
      `and the XLs do not fill the minimum either (got "${underMin.error}")`
    )
  }

  section('A percentage bundle — the excluded line keeps its own price')
  {
    const subject = offer({
      kind: 'FIXED',
      pool: [],
      items: [
        shirt([size('m', 900), size('xl', 900, { excluded: true })]),
        {
          productId: 'pant',
          title: 'Chino',
          imageUrl: null,
          quantity: 1,
          pinnedVariantId: null,
          variants: [size('pant', 800)],
        },
      ],
      pricing: { mode: 'PERCENT', priceCents: 0, discountBps: 1000 },
    })

    const inOffer = quote(subject, { m: 1, pant: 1 })
    check(
      inOffer.goodsCents === 1530,
      `the ordinary set is 10% off 1700, 1530 (got ${inOffer.goodsCents})`
    )

    const withXL = quote(subject, { xl: 1, pant: 1 })
    check(
      withXL.goodsCents === 1620,
      `the XL set is 10% off the chino only, 1620 (got ${withXL.goodsCents})`
    )
    check(
      withXL.regularCents === 1700 && withXL.savingCents === 80,
      'and the saving shown is the 80 the offer actually gave'
    )
  }

  section('A flat-priced set — the one offer that cannot sell an excluded size')
  {
    // offerService keeps excluded sizes out of the options here, because one
    // typed total covers the whole set and cannot be split into a line price.
    // Should such a selection ever reach the arithmetic anyway, it must not be
    // silently swallowed into the flat total — it is charged, visibly.
    const subject = offer({
      kind: 'FIXED',
      pool: [],
      items: [
        shirt([size('m', 900), size('xl', 900, { excluded: true })]),
        {
          productId: 'pant',
          title: 'Chino',
          imageUrl: null,
          quantity: 1,
          pinnedVariantId: null,
          variants: [size('pant', 800)],
        },
      ],
      pricing: { mode: 'FIXED', priceCents: 700, discountBps: 0 },
    })

    check(
      quote(subject, { m: 1, pant: 1 }).goodsCents === 700,
      'the set is the price the merchant typed'
    )
    check(
      quote(subject, { xl: 1, pant: 1 }).goodsCents === 1600,
      'and an excluded size is never handed over inside that price'
    )
    check(
      quote(subject, { xl: 1 }).goodsCents === 900,
      'a basket of only the excluded size is its own price, not the set’s'
    )
  }

  console.log(
    failures === 0
      ? '\n\x1b[32mPassed\x1b[0m — excluded sizes sell at list and touch no part of the offer.\n'
      : `\n\x1b[31m${failures} failed\x1b[0m\n`
  )

  process.exit(failures === 0 ? 0 : 1)
}

main()
