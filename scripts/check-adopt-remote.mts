/**
 * Proves the adoption tool moves everything before it deletes anything.
 *
 * `adopt-remote-products.mts` deletes rows that orders point at. That is only
 * safe if every reference has moved first, and "every" is doing a lot of work:
 * order lines, cart lines, offer items, the variant list inside an offer item,
 * ladder rules, gift variants and five string arrays on discounts. Miss one and
 * a merchant finds out when an offer stops resolving or a customer's order goes
 * blank.
 *
 * So this builds a workspace shaped like the one the tool was written for —
 * duplicate products, a typo'd title, a partial catalogue, references of every
 * kind, and the two collisions that a real catalogue produces — runs the tool
 * against it for real, and checks the result row by row.
 *
 *   DATABASE_URL=…/ncom_queue_test AUTH_SECRET=… pnpm check:adopt-remote
 *
 * It creates one throwaway organisation, uses it, and deletes it.
 */

import { createServer, type Server } from 'node:http'
import { createHmac, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { prisma } from '@/server/db/client'
import { encryptSecret } from '@/lib/crypto'

const run = promisify(execFile)

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

// ── The merchant's website ───────────────────────────────────────────────

/**
 * Their catalogue, as their connector would report it.
 *
 * Deliberately not a mirror of the local one: the shirt is titled with an
 * apostrophe here and without one there, the cap is only findable through the
 * id an old import recorded, the mug has no SKU at all, and the half shirt is
 * missing a size. Each of those is one of the tool's matching rules, and the
 * tote is the case where every rule must fail.
 */
const REMOTE_PRODUCTS = [
  {
    id: 'r-shirt',
    handle: 'mens-hawaiian-shirt',
    title: "Men's Hawaiian Shirt",
    status: 'active',
    variants: [
      {
        id: 'rv-shirt-s',
        title: 'S',
        sku: 'HAW-S',
        price: 1200,
        options: ['S'],
      },
      {
        id: 'rv-shirt-m',
        title: 'M',
        sku: 'HAW-M',
        price: 1200,
        options: ['M'],
      },
      {
        id: 'rv-shirt-l',
        title: 'L',
        sku: 'HAW-L',
        price: 1300,
        options: ['L'],
      },
    ],
  },
  {
    id: 'r-cap',
    handle: 'cotton-cap-2024',
    title: 'Cotton Cap (new)',
    status: 'active',
    variants: [
      {
        id: 'rv-cap',
        title: 'Default Title',
        sku: null,
        price: 500,
        options: [],
      },
    ],
  },
  {
    id: 'r-mug',
    handle: 'studio-mug',
    title: 'Studio Mug',
    status: 'active',
    variants: [
      {
        id: 'rv-mug',
        title: 'Default Title',
        sku: null,
        price: 800,
        options: [],
      },
    ],
  },
  {
    id: 'r-half',
    handle: 'half-shirt',
    title: 'Half Shirt',
    status: 'active',
    variants: [
      {
        id: 'rv-half-s',
        title: 'S',
        sku: 'HALF-S',
        price: 900,
        options: ['S'],
      },
    ],
  },
  {
    id: 'r-beach',
    handle: 'beach-shirt',
    title: 'Beach Shirt',
    status: 'active',
    variants: [
      {
        id: 'rv-beach',
        title: 'Default Title',
        sku: 'BEACH-X',
        price: 700,
        options: [],
      },
    ],
  },
]

interface Shop {
  server: Server
  baseUrl: string
  secret: string
  keyId: string
}

function startShop(): Promise<Shop> {
  const secret = `ncomsec_${randomUUID().replace(/-/g, '')}`
  const keyId = `ncomcat_${randomUUID().slice(0, 8)}`

  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    const raw = Buffer.concat(chunks).toString('utf8')

    const header = request.headers['x-ncom-signature']
    if (typeof header !== 'string') {
      response.writeHead(401).end('{"error":"unsigned"}')
      return
    }
    const timestamp = /t=(\d+)/.exec(header)?.[1] ?? ''
    const given = /v1=([a-f0-9]+)/.exec(header)?.[1] ?? ''
    if (
      given !==
      createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex')
    ) {
      response.writeHead(401).end('{"error":"bad signature"}')
      return
    }

    const path = (request.url ?? '').split('?')[0]
    const send = (payload: unknown) =>
      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify(payload))

    if (path.endsWith('/ping')) {
      send({
        contract: '1',
        platform: 'fake/1.0',
        currency: 'BDT',
        capabilities: {
          products: true,
          stock: true,
          search: false,
          categories: false,
          reserve: false,
          release: false,
        },
      })
      return
    }

    if (path.includes('/products')) {
      // One page, no cursor: the tool must stop rather than loop.
      send({ products: REMOTE_PRODUCTS, next_cursor: null, total: 4 })
      return
    }

    response.writeHead(404).end('{"error":"not found"}')
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, secret, keyId })
    })
  })
}

// ── The workspace, before ────────────────────────────────────────────────

interface Fixture {
  organizationId: string
  shirtProductId: string
  shirtVariants: Record<string, string>
  capProductId: string
  capVariantId: string
  mugProductId: string
  toteProductId: string
  halfProductId: string
  beachProductIds: string[]
  orderLineId: string
  cartId: string
  offerId: string
  offerItemId: string
  discountId: string
}

async function build(shop: Shop): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8)

  const organization = await prisma.organization.create({
    data: { name: `Adopt check ${suffix}`, slug: `adopt-check-${suffix}` },
    select: { id: true },
  })
  const organizationId = organization.id

  await prisma.catalogConnection.create({
    data: {
      organizationId,
      baseUrl: shop.baseUrl,
      keyId: shop.keyId,
      secret: encryptSecret(shop.secret),
      timeoutMs: 5000,
      contractVersion: '1',
      capabilities: {
        products: true,
        stock: true,
        search: false,
        categories: false,
        reserve: false,
        release: false,
      },
    },
  })

  const product = async (
    title: string,
    handle: string,
    externalId: string | null,
    variants: { title: string; sku: string | null; option1: string | null }[]
  ) =>
    prisma.product.create({
      data: {
        organizationId,
        title,
        handle,
        externalId,
        status: 'ACTIVE',
        variants: {
          create: variants.map((variant, index) => ({
            title: variant.title,
            sku: variant.sku,
            option1: variant.option1,
            priceCents: 1000,
            position: index + 1,
          })),
        },
      },
      select: { id: true, variants: { select: { id: true, title: true } } },
    })

  // Matched by SKU, despite the title being spelled differently.
  const shirt = await product(
    'Mens Hawaiian Shirt',
    'mens-hawaiian-shirt-old',
    null,
    [
      { title: 'S', sku: 'HAW-S', option1: 'S' },
      { title: 'M', sku: 'HAW-M', option1: 'M' },
      { title: 'L', sku: 'HAW-L', option1: 'L' },
    ]
  )

  // Matched only by the merchant's own id: different title, different handle,
  // no SKU anywhere.
  const cap = await product('Cotton Cap', 'cotton-cap', 'r-cap', [
    { title: 'Default Title', sku: null, option1: null },
  ])

  // Matched by title alone.
  const mug = await product('Studio  Mug', 'studio-mug-ncom', null, [
    { title: 'Default Title', sku: null, option1: null },
  ])

  // No twin anywhere. Must survive untouched.
  const tote = await product('NCOM Exclusive Tote', 'ncom-tote', null, [
    { title: 'Default Title', sku: null, option1: null },
  ])

  // Their site only carries the S. Must be skipped whole, not half-adopted.
  const half = await product('Half Shirt', 'half-shirt', null, [
    { title: 'S', sku: 'HALF-S', option1: 'S' },
    { title: 'M', sku: 'HALF-M', option1: 'M' },
  ])

  // Two NCOM rows with the same title and SKUs their site has never heard of.
  // This is the shape that nearly took out a real catalogue: from the remote
  // side "Beach Shirt" names exactly one product, so both of these matched it,
  // and both then matched its only variant. Adopting them would have poured two
  // products' order histories into one. Neither may be touched.
  const beachA = await product('Beach Shirt', 'beach-shirt-a', null, [
    { title: 'Default Title', sku: 'BEACH-A', option1: null },
  ])
  const beachB = await product('Beach Shirt', 'beach-shirt-b', null, [
    { title: 'Default Title', sku: 'BEACH-B', option1: null },
  ])

  const shirtVariants = Object.fromEntries(
    shirt.variants.map((variant) => [variant.title, variant.id])
  )
  const capVariantId = cap.variants[0].id

  // An order that sold the large shirt.
  const order = await prisma.order.create({
    data: {
      organizationId,
      orderNumber: `AD-${suffix}`,
      currencyCode: 'BDT',
      subtotalCents: 1300,
      totalCents: 1300,
      lines: {
        create: {
          productId: shirt.id,
          variantId: shirtVariants.L,
          title: 'Mens Hawaiian Shirt',
          variantTitle: 'L',
          sku: 'HAW-L',
          quantity: 1,
          unitPriceCents: 1300,
          totalCents: 1300,
        },
      },
    },
    select: { id: true, lines: { select: { id: true } } },
  })

  // A cart holding both twins of the cap — the collision that has to merge.
  const cart = await prisma.cart.create({
    data: {
      organizationId,
      currencyCode: 'BDT',
      lines: {
        create: [
          {
            productId: cap.id,
            variantId: capVariantId,
            quantity: 2,
            unitPriceCents: 500,
          },
          {
            productId: 'r-cap',
            variantId: 'rv-cap',
            quantity: 3,
            unitPriceCents: 500,
          },
        ],
      },
    },
    select: { id: true },
  })

  // An offer naming the shirt four different ways, plus a ladder rule that
  // already exists for the remote twin — the second collision.
  const offer = await prisma.offer.create({
    data: {
      organizationId,
      key: `bundle-${suffix}`,
      label: 'Two shirts',
      giftVariantId: capVariantId,
      items: {
        create: {
          productId: shirt.id,
          variantId: shirtVariants.S,
          variantIds: [shirtVariants.S, shirtVariants.M],
        },
      },
      variantRules: {
        create: [
          { variantId: shirtVariants.M },
          { variantId: 'rv-shirt-m' },
          { variantId: shirtVariants.L },
        ],
      },
    },
    select: { id: true, items: { select: { id: true } } },
  })

  const discount = await prisma.discount.create({
    data: {
      organizationId,
      title: 'Shirt sale',
      type: 'PERCENTAGE',
      appliesTo: 'PRODUCTS',
      targetProductIds: [shirt.id, tote.id],
      targetVariantIds: [shirtVariants.L],
      excludedVariantIds: [capVariantId],
    },
    select: { id: true },
  })

  return {
    organizationId,
    shirtProductId: shirt.id,
    shirtVariants,
    capProductId: cap.id,
    capVariantId,
    mugProductId: mug.id,
    toteProductId: tote.id,
    halfProductId: half.id,
    beachProductIds: [beachA.id, beachB.id],
    orderLineId: order.lines[0].id,
    cartId: cart.id,
    offerId: offer.id,
    offerItemId: offer.items[0].id,
    discountId: discount.id,
  }
}

// ── Running the real tool ────────────────────────────────────────────────

async function adopt(organizationId: string, apply: boolean): Promise<string> {
  const { stdout } = await run(
    'pnpm',
    [
      'exec',
      'tsx',
      '--conditions=react-server',
      'scripts/adopt-remote-products.mts',
      '--org',
      organizationId,
      ...(apply ? ['--apply'] : []),
    ],
    { env: process.env, cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 }
  )
  return stdout
}

async function main() {
  console.log('\x1b[1mAdopting NCOM products onto their twins\x1b[0m')

  const shop = await startShop()
  const fixture = await build(shop)

  try {
    section('Dry run changes nothing')

    const preview = await adopt(fixture.organizationId, false)

    check(
      /3 products[\s\S]*would be deleted/.test(preview),
      'it proposes the three products that have twins'
    )
    check(
      preview.includes('NCOM Exclusive Tote'),
      'the tote is reported as having no twin'
    )
    check(
      /Half Shirt/.test(preview) && /not every option/.test(preview),
      'the half shirt is reported as only partly matched'
    )
    check(
      (await prisma.product.count({
        where: { organizationId: fixture.organizationId },
      })) === 7,
      'all seven products are still there'
    )

    section('Applying')

    await adopt(fixture.organizationId, true)

    const remaining = await prisma.product.findMany({
      where: { organizationId: fixture.organizationId },
      select: { id: true, title: true },
    })
    check(
      remaining.length === 4,
      `four products remain (got ${remaining.length}: ${remaining.map((product) => product.title).join(', ')})`
    )
    check(
      remaining.some((product) => product.id === fixture.toteProductId),
      'the product with no twin was left alone'
    )
    check(
      remaining.some((product) => product.id === fixture.halfProductId),
      'the partly matched product was left alone — a size with no twin has nowhere to send its orders'
    )
    check(
      fixture.beachProductIds.every((id) =>
        remaining.some((product) => product.id === id)
      ),
      'neither product sharing a title was adopted — one remote variant cannot inherit two histories'
    )

    section('Everything that pointed at them now points at the website')

    const orderLine = await prisma.orderLine.findUnique({
      where: { id: fixture.orderLineId },
      select: {
        productId: true,
        variantId: true,
        title: true,
        sku: true,
        unitPriceCents: true,
      },
    })
    check(
      orderLine?.variantId === 'rv-shirt-l' &&
        orderLine?.productId === 'r-shirt',
      'the order line names the merchant’s own variant'
    )
    check(
      orderLine?.title === 'Mens Hawaiian Shirt' &&
        orderLine?.sku === 'HAW-L' &&
        orderLine?.unitPriceCents === 1300,
      'the order still says what it sold, at the price it sold for'
    )

    const cartLines = await prisma.cartLine.findMany({
      where: { cartId: fixture.cartId },
      select: { variantId: true, quantity: true },
    })
    check(
      cartLines.length === 1 &&
        cartLines[0].variantId === 'rv-cap' &&
        cartLines[0].quantity === 5,
      `the cart's two lines for one product merged into one of 5 (got ${cartLines.map((line) => `${line.variantId}×${line.quantity}`).join(', ')})`
    )

    const item = await prisma.offerItem.findUnique({
      where: { id: fixture.offerItemId },
      select: { productId: true, variantId: true, variantIds: true },
    })
    check(
      item?.productId === 'r-shirt' && item?.variantId === 'rv-shirt-s',
      'the offer item names the remote product and variant'
    )
    check(
      item?.variantIds.length === 2 &&
        item.variantIds.includes('rv-shirt-s') &&
        item.variantIds.includes('rv-shirt-m'),
      `the offer item's variant list was rewritten too (${item?.variantIds.join(', ')})`
    )

    const rules = await prisma.offerVariantRule.findMany({
      where: { offerId: fixture.offerId },
      select: { variantId: true },
    })
    check(
      rules.length === 2 &&
        rules.every((rule) => rule.variantId.startsWith('rv-')),
      `the ladder rules moved and the duplicate collapsed (${rules.map((rule) => rule.variantId).join(', ')})`
    )

    const offer = await prisma.offer.findUnique({
      where: { id: fixture.offerId },
      select: { giftVariantId: true },
    })
    check(offer?.giftVariantId === 'rv-cap', 'the gift variant moved')

    const discount = await prisma.discount.findUnique({
      where: { id: fixture.discountId },
      select: {
        targetProductIds: true,
        targetVariantIds: true,
        excludedVariantIds: true,
      },
    })
    check(
      discount?.targetProductIds.includes('r-shirt') === true &&
        discount?.targetProductIds.includes(fixture.toteProductId) === true,
      'the discount targets the remote shirt and still targets the tote'
    )
    check(
      discount?.targetVariantIds.join() === 'rv-shirt-l' &&
        discount?.excludedVariantIds.join() === 'rv-cap',
      'both variant arrays on the discount moved'
    )

    section('Nothing was left naming a row that no longer exists')

    const orphaned = await prisma.orderLine.count({
      where: {
        order: { organizationId: fixture.organizationId },
        variantId: {
          in: [...Object.values(fixture.shirtVariants), fixture.capVariantId],
        },
      },
    })
    check(orphaned === 0, 'no order line still names a deleted variant')

    const strayRules = await prisma.offerVariantRule.count({
      where: {
        offer: { organizationId: fixture.organizationId },
        variantId: { in: Object.values(fixture.shirtVariants) },
      },
    })
    check(strayRules === 0, 'no offer rule still names a deleted variant')
  } finally {
    await prisma.organization.delete({
      where: { id: fixture.organizationId },
    })
    shop.server.close()
  }

  console.log(
    failures === 0
      ? '\n\x1b[32mPassed\x1b[0m — references move first, rows go second.\n'
      : `\n\x1b[31m${failures} failed\x1b[0m\n`
  )

  await prisma.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
