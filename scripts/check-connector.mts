/**
 * Conformance check for a product source connector.
 *
 * Two modes.
 *
 *   pnpm check:connector
 *     Runs against a built-in fake website that implements
 *     docs/product-source.md exactly. This is the platform's own regression
 *     test: it proves the signature NCOM sends is the one the documentation
 *     tells merchants to verify, and that the parser reads a realistically
 *     messy payload the way the docs say it will.
 *
 *   pnpm check:connector -- --url https://shop.example.com/ncom/v1 \
 *                           --key ncomcat_… --secret ncomsec_…
 *     Runs against a real connector. Point a merchant at this before they go
 *     live; it exercises every endpoint in the contract and reports what their
 *     site actually implements, with the failures spelled out.
 *
 * Requires the react-server condition so `server-only` resolves to its empty
 * build — the npm script below sets it.
 */

import { createServer } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { catalogFetch, type CatalogTarget } from '@/server/catalog/client'
import {
  parseCategories,
  parseIdentity,
  parseProduct,
  parseProductPage,
  parseReserve,
  parseStock,
} from '@/server/catalog/contract'
import { isSellable } from '@/server/catalog/rules'
import { isCatalogError } from '@/server/catalog/errors'

// ── Reporting ────────────────────────────────────────────────────────────

let failures = 0
let warnings = 0

function ok(name: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${name}`)
}

function fail(name: string, detail?: unknown) {
  failures += 1
  console.log(`  \x1b[31m✗\x1b[0m ${name}`)
  if (detail !== undefined) console.log(`      ${format(detail)}`)
}

function warn(name: string, detail?: string) {
  warnings += 1
  console.log(`  \x1b[33m!\x1b[0m ${name}`)
  if (detail) console.log(`      ${detail}`)
}

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) ok(name)
  else fail(name, detail)
}

function heading(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`)
}

function format(value: unknown): string {
  if (value instanceof Error) return value.message
  return typeof value === 'string' ? value : JSON.stringify(value)
}

// ── Arguments ────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

const url = arg('url')
const currency = arg('currency') ?? 'BDT'

// ── The conformance run ──────────────────────────────────────────────────

/**
 * Everything the contract asks of a connector, in the order a merchant should
 * fix it: the handshake first, because nothing else matters until it answers.
 */
async function conform(target: CatalogTarget, currencyCode: string) {
  heading('Handshake — GET /ping')

  let capabilities = target.capabilities
  try {
    const identity = parseIdentity(
      await catalogFetch(target, { method: 'GET', path: '/ping' })
    )
    ok(`answered as ${identity.platform ?? 'an unnamed platform'}`)
    check('speaks contract 1', identity.contract === '1', identity.contract)

    if (identity.currency && identity.currency !== currencyCode) {
      warn(
        `quotes prices in ${identity.currency}, workspace sells in ${currencyCode}`,
        'Nothing converts between them. Fix one of the two before selling.'
      )
    } else if (identity.currency) {
      ok(`prices in ${identity.currency}`)
    } else {
      warn(
        'does not report a currency',
        'Prices are assumed to be in ' + currencyCode
      )
    }

    capabilities = identity.capabilities
    console.log(
      `      implements: ${Object.entries(capabilities)
        .filter(([, on]) => on)
        .map(([name]) => name)
        .join(', ')}`
    )

    if (!capabilities.reserve) {
      warn(
        'does not implement /reserve',
        'Stock is checked but never held: two shoppers can take the same last unit.'
      )
    }
  } catch (error) {
    fail('the handshake failed — nothing else can work until it does', error)
    return
  }

  const probe: CatalogTarget = { ...target, capabilities }

  heading('Catalogue — GET /products')

  let firstProductId: string | null = null
  let firstHandle: string | null = null
  let variantIds: string[] = []

  try {
    const page = parseProductPage(
      await catalogFetch(probe, {
        method: 'GET',
        path: '/products',
        query: { limit: 5, status: 'active' },
      }),
      currencyCode
    )

    check('returned products', page.products.length > 0, 'the list was empty')

    for (const product of page.products) {
      if (product.variants.length === 0) {
        fail(`"${product.title}" has no sellable variant`)
      }
      for (const variant of product.variants) {
        if (variant.priceCents <= 0) {
          warn(
            `"${product.title} / ${variant.title}" has no price`,
            'Send `price` as a decimal or `priceCents` as an integer.'
          )
        }
      }
      if (product.images.length === 0) {
        warn(`"${product.title}" has no images`)
      } else if (!product.images[0].url.startsWith('https://')) {
        warn(
          `"${product.title}" serves images over http`,
          'Browsers block mixed content on an HTTPS landing page.'
        )
      }
    }

    const first = page.products[0]
    if (first) {
      firstProductId = first.id
      firstHandle = first.handle
      variantIds = first.variants.map((variant) => variant.id)
      ok(`read ${page.products.length} products, first is "${first.title}"`)
    }

    if (page.nextCursor) ok('paginates with a cursor')
    else
      warn(
        'returned no cursor',
        'Fine for a small catalogue; required past one page.'
      )
  } catch (error) {
    fail('the product list could not be read', error)
  }

  // The most commonly skipped requirement, and the one that quietly breaks
  // every saved offer: a connector that ignores `ids` and answers with page one.
  if (firstProductId) {
    heading('Saved references — GET /products?ids=')
    try {
      const page = parseProductPage(
        await catalogFetch(probe, {
          method: 'GET',
          path: '/products',
          query: { ids: firstProductId, limit: 1 },
        }),
        currencyCode
      )
      check(
        'honours the ids parameter',
        page.products.length === 1 && page.products[0].id === firstProductId,
        'Returned something else. Every offer on every landing page depends on this.'
      )
    } catch (error) {
      fail('filtering by ids failed', error)
    }
  }

  if (firstProductId) {
    heading('One product — GET /products/{id}')
    try {
      const byId = parseProduct(
        await catalogFetch(probe, {
          method: 'GET',
          path: `/products/${encodeURIComponent(firstProductId)}`,
          allowNotFound: true,
        }),
        currencyCode
      )
      check('resolves by id', byId?.id === firstProductId, byId)
    } catch (error) {
      fail('lookup by id failed', error)
    }

    if (firstHandle && firstHandle !== firstProductId) {
      try {
        const byHandle = parseProduct(
          await catalogFetch(probe, {
            method: 'GET',
            path: `/products/${encodeURIComponent(firstHandle)}`,
            allowNotFound: true,
          }),
          currencyCode
        )
        check('resolves by handle', byHandle?.id === firstProductId, byHandle)
      } catch (error) {
        warn('lookup by handle failed', format(error))
      }
    }

    try {
      const missing = await catalogFetch(probe, {
        method: 'GET',
        path: '/products/definitely-not-a-real-product-xyz',
        allowNotFound: true,
      })
      check('answers 404 for a product that does not exist', missing === null)
    } catch (error) {
      fail('a missing product should answer 404, not an error', error)
    }
  }

  if (variantIds.length > 0 && capabilities.stock) {
    heading('Stock — POST /stock')
    try {
      const stock = parseStock(
        await catalogFetch(probe, {
          method: 'POST',
          path: '/stock',
          body: { ids: variantIds },
        })
      )
      check(
        'answered for the variants asked about',
        variantIds.every((id) => stock.has(id)),
        `asked for ${variantIds.length}, got ${stock.size}`
      )
      for (const [id, state] of stock) {
        console.log(
          `      ${id}: ${
            state.available === null ? 'not counted' : state.available
          } (${state.policy.toLowerCase()}, ${
            isSellable(state) ? 'sellable' : 'not sellable'
          })`
        )
      }
    } catch (error) {
      fail('the stock endpoint failed', error)
    }
  }

  if (capabilities.categories) {
    heading('Categories — GET /categories')
    try {
      const categories = parseCategories(
        await catalogFetch(probe, { method: 'GET', path: '/categories' })
      )
      ok(`read ${categories.length} categories`)
    } catch (error) {
      fail('the category endpoint failed', error)
    }
  }

  if (capabilities.reserve) {
    heading('Reservations — POST /reserve')
    // Deliberately absurd: a real hold would sell the merchant's stock to a
    // test script. A connector that refuses this has demonstrated the path.
    try {
      const result = parseReserve(
        await catalogFetch(probe, {
          method: 'POST',
          path: '/reserve',
          body: {
            orderRef: 'connector-check',
            lines: [
              { variantId: variantIds[0] ?? 'unknown', quantity: 999999 },
            ],
          },
        })
      )
      if (result.ok) {
        warn(
          'held 999,999 units without complaint',
          'Either stock is untracked, or the reservation is not checking availability. Verify by hand before going live, and release what was just taken.'
        )
      } else {
        ok(
          `refused an impossible quantity: ${result.rejected[0]?.reason ?? 'no reason given'}`
        )
      }
    } catch (error) {
      fail('the reserve endpoint failed', error)
    }
  }
}

// ── The fake website, for the self-test ──────────────────────────────────

const KEY = 'ncomcat_selftest'
const SECRET = 'ncomsec_selftest'

/**
 * Verifies a request exactly as docs/product-source.md §3 asks a merchant to.
 *
 * If this and NCOM's signer ever disagree, the documentation is wrong and every
 * connector built from it would reject us — which is the single most valuable
 * thing this file checks.
 */
function verifyLikeAMerchant(
  headers: Record<string, string | string[] | undefined>,
  body: string
): boolean {
  if (headers['x-ncom-key'] !== KEY) return false

  const parts = Object.fromEntries(
    String(headers['x-ncom-signature'] ?? '')
      .split(',')
      .map((piece) => {
        const [key, ...rest] = piece.trim().split('=')
        return [key, rest.join('=')]
      })
  )

  const timestamp = Number(parts.t)
  if (!Number.isFinite(timestamp)) return false
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false

  const expected = createHmac('sha256', SECRET)
    .update(`${timestamp}.${body}`)
    .digest('hex')

  const a = Buffer.from(expected)
  const b = Buffer.from(String(parts.v1 ?? ''))
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * A merchant's website as it really arrives: snake_case keys, a price as a
 * decimal string, a WooCommerce status, images as bare URLs, one variant with
 * no stock tracking, and a simple product carrying no variants at all.
 */
function fakeSite() {
  return createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname
      const query = new URL(req.url ?? '/', 'http://localhost').searchParams

      if (!verifyLikeAMerchant(req.headers, body)) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'unauthorized' }))
        return
      }

      const send = (payload: unknown) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(payload))
      }

      const tee = {
        id: 42,
        slug: 'classic-tee',
        name: 'Classic Tee',
        status: 'publish',
        images: ['https://shop.test/tee.jpg'],
        variants: [
          {
            id: 4201,
            title: 'M',
            sku: 'TEE-M',
            price: '1250.50',
            stock_quantity: 3,
            backorders: 'no',
            weight_grams: '220',
          },
          { id: 4202, title: 'L', price_cents: 139900, manage_stock: false },
          { id: 4203, title: 'XL', price: 1400, in_stock: false },
        ],
      }

      const mug = {
        id: 'SKU-9',
        title: 'Simple Mug',
        price: '350',
        stock: 7,
        images: [{ url: 'https://shop.test/mug.jpg', alt: 'A mug' }],
      }

      if (path.endsWith('/ping')) {
        return send({
          ok: true,
          contract: '1',
          platform: 'fake/1.0',
          currency: 'BDT',
          capabilities: {
            products: true,
            stock: true,
            categories: true,
            reserve: true,
          },
        })
      }

      if (path.endsWith('/products')) {
        const ids = String(query.get('ids') ?? '')
          .split(',')
          .filter(Boolean)
        const all = [tee, mug]
        const products = ids.length
          ? all.filter((product) => ids.includes(String(product.id)))
          : all
        return send({
          products,
          next_cursor: ids.length ? null : 'page2',
          total: '2',
        })
      }

      if (path.includes('/products/')) {
        const key = decodeURIComponent(path.split('/products/')[1] ?? '')
        const found = [tee, mug].find(
          (product) =>
            String(product.id) === key ||
            (product as { slug?: string }).slug === key
        )
        if (!found) {
          res.writeHead(404, { 'content-type': 'application/json' })
          return res.end(JSON.stringify({ error: 'not_found' }))
        }
        return send({ product: found })
      }

      if (path.endsWith('/stock')) {
        const ids: string[] = JSON.parse(body || '{}').ids ?? []
        return send({
          stock: ids.map((id) => {
            if (id === '4202') return { id, tracked: false }
            if (id === '4203')
              return { id, in_stock: false, policy: 'continue' }
            return { id, available: 3, policy: 'deny' }
          }),
        })
      }

      if (path.endsWith('/categories')) {
        return send({
          categories: [
            { id: 12, name: 'Shirts', slug: 'shirts', parent: null, count: 1 },
          ],
        })
      }

      if (path.endsWith('/reserve')) {
        const line = (JSON.parse(body || '{}').lines ?? [])[0]
        return send(
          (line?.quantity ?? 0) > 3
            ? {
                ok: false,
                rejected: [
                  { variantId: line.variantId, reason: 'Only 3 left' },
                ],
              }
            : { ok: true }
        )
      }

      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'not_found' }))
    })
  })
}

/** The parser assertions the docs make promises about. */
async function selfTest(target: CatalogTarget) {
  heading('Parsing a realistically messy payload')

  const page = parseProductPage(
    await catalogFetch(target, {
      method: 'GET',
      path: '/products',
      query: { limit: 5 },
    }),
    'BDT'
  )

  const tee = page.products[0]
  const mug = page.products[1]
  const [m, l, xl] = tee.variants

  check('snake_case keys are accepted', tee.title === 'Classic Tee')
  check('numeric ids become strings', tee.id === '42' && m.id === '4201')
  check('slug is read as the handle', tee.handle === 'classic-tee')
  check('"publish" maps to active', tee.status === 'ACTIVE')
  check(
    'a decimal price becomes minor units',
    m.priceCents === 125050,
    m.priceCents
  )
  check('priceCents is taken as-is', l.priceCents === 139900, l.priceCents)
  check('a numeric price converts', xl.priceCents === 140000, xl.priceCents)
  check('stock_quantity is read as a count', m.available === 3, m.available)
  check('manage_stock:false means untracked', l.available === null, l.available)
  check('in_stock:false is a hard zero', xl.available === 0, xl.available)
  check('backorders "no" means deny', m.policy === 'DENY')
  check('weight strings become numbers', m.weightGrams === 220, m.weightGrams)
  check(
    'bare image URLs are accepted',
    tee.images[0]?.url === 'https://shop.test/tee.jpg'
  )
  check(
    'a product with no variants gets one keyed on the product id',
    mug.variants.length === 1 && mug.variants[0].id === 'SKU-9',
    mug.variants
  )
  check(
    'the synthetic variant carries the product price',
    mug.variants[0].priceCents === 35000
  )
  check(
    'the synthetic variant carries the product stock',
    mug.variants[0].available === 7
  )
  check('a numeric-string total is coerced', page.total === 2, page.total)

  heading('Sellability')
  check(
    'untracked is always sellable',
    isSellable({ available: null, policy: 'DENY' }, 99)
  )
  check(
    'deny refuses past the count',
    !isSellable({ available: 3, policy: 'DENY' }, 4)
  )
  check(
    'deny allows up to the count',
    isSellable({ available: 3, policy: 'DENY' }, 3)
  )
  check(
    'continue sells past zero',
    isSellable({ available: 0, policy: 'CONTINUE' }, 5)
  )

  heading('Refusals')
  try {
    await catalogFetch(
      { ...target, secret: 'wrong' },
      { method: 'GET', path: '/ping' }
    )
    fail('a bad secret should be refused')
  } catch (error) {
    check(
      'a bad secret is refused as unauthorized',
      isCatalogError(error) && error.failure === 'unauthorized',
      error
    )
  }

  try {
    await catalogFetch(target, { method: 'GET', path: '/nope' })
    fail('a missing endpoint should be reported')
  } catch (error) {
    check(
      'a missing endpoint is a contract error',
      isCatalogError(error) && error.failure === 'contract',
      error
    )
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

if (url) {
  const key = arg('key')
  const secret = arg('secret')

  if (!key || !secret) {
    console.error('--key and --secret are required with --url')
    process.exit(2)
  }

  console.log(`\nChecking ${url}`)

  await conform(
    {
      baseUrl: url.replace(/\/+$/, ''),
      keyId: key,
      secret,
      timeoutMs: 10_000,
      // Nothing is assumed until /ping says so.
      capabilities: {
        products: false,
        stock: false,
        search: false,
        categories: false,
        reserve: false,
        release: false,
      },
    },
    currency
  )
} else {
  console.log(
    '\nNo --url given: checking NCOM against its own documented contract.'
  )

  const server = fakeSite()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port

  const target: CatalogTarget = {
    baseUrl: `http://127.0.0.1:${port}/ncom/v1`,
    keyId: KEY,
    secret: SECRET,
    timeoutMs: 5000,
    capabilities: {
      products: true,
      stock: true,
      search: false,
      categories: true,
      reserve: true,
      release: false,
    },
  }

  await conform(target, 'BDT')
  await selfTest(target)

  server.close()
}

console.log(
  failures === 0
    ? `\n\x1b[32mPassed\x1b[0m${warnings > 0 ? ` with ${warnings} warning${warnings === 1 ? '' : 's'}` : ''}.\n`
    : `\n\x1b[31m${failures} check${failures === 1 ? '' : 's'} failed.\x1b[0m\n`
)

process.exit(failures === 0 ? 0 : 1)
