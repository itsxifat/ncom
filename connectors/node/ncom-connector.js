/**
 * NCOM product source connector — Express.
 *
 * Mount it on your own site and point NCOM at the URL:
 *
 *   const { ncomConnector } = require('./ncom-connector')
 *   app.use('/ncom/v1', ncomConnector({ keyId, secret, store }))
 *
 * …then enter `https://yourshop.com/ncom/v1` in NCOM → Settings → Product
 * source. Nothing is copied into NCOM; this router is asked, and it answers.
 *
 * The `store` object is the only thing you write: four functions that read your
 * own database. Everything else here — signing, routing, shaping — is done.
 *
 * The contract is documented at docs/product-source.md.
 */

'use strict'

const crypto = require('node:crypto')
const express = require('express')

/**
 * @param {object} options
 * @param {string} options.keyId    From NCOM → Settings → Product source.
 * @param {string} options.secret   Shown once, at the same place.
 * @param {string} [options.currency] ISO 4217, must match the workspace.
 * @param {object} options.store    Your reads. See the shape below.
 */
function ncomConnector({ keyId, secret, currency = 'BDT', store }) {
  const router = express.Router()

  // The raw body is what the signature covers, byte for byte. `express.json()`
  // would give us a parsed object and no way to reproduce the exact bytes, so
  // the raw text is captured first and parsed afterwards.
  router.use(express.text({ type: '*/*', limit: '256kb' }))
  router.use(verify(keyId, secret))

  const capabilities = {
    products: true,
    stock: typeof store.stock === 'function',
    search: store.searchable === true,
    categories: typeof store.categories === 'function',
    reserve: typeof store.reserve === 'function',
    release: typeof store.release === 'function',
  }

  router.get('/ping', (_req, res) => {
    res.json({
      ok: true,
      contract: '1',
      platform: 'node/express',
      currency,
      capabilities,
    })
  })

  router.get('/products', async (req, res, next) => {
    try {
      // `ids` is how NCOM re-reads the exact products a saved offer names, on
      // every render of that landing page. Honour it before anything else: a
      // connector that ignores it makes an offer sell the wrong things.
      const ids = String(req.query.ids ?? '')
        .split(',')
        .filter(Boolean)

      const page = await store.products({
        ids,
        limit: Math.min(Number(req.query.limit) || 24, 100),
        cursor: req.query.cursor ? String(req.query.cursor) : null,
        search: req.query.q ? String(req.query.q) : null,
        categoryId: req.query.category ? String(req.query.category) : null,
        includeDrafts: req.query.status === 'any',
      })

      res.json({
        products: page.products,
        nextCursor: page.nextCursor ?? null,
        total: page.total ?? null,
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/products/:idOrHandle', async (req, res, next) => {
    try {
      const product = await store.product(req.params.idOrHandle)
      // 404 is an answer, not a failure: NCOM marks the offer unavailable
      // rather than breaking the page it is on.
      if (!product) return res.status(404).json({ error: 'not_found' })
      res.json({ product })
    } catch (error) {
      next(error)
    }
  })

  router.post('/stock', async (req, res, next) => {
    if (!capabilities.stock)
      return res.status(404).json({ error: 'not_implemented' })
    try {
      const { ids = [] } = parse(req)
      res.json({ stock: await store.stock(ids.map(String)) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/categories', async (_req, res, next) => {
    if (!capabilities.categories) {
      return res.status(404).json({ error: 'not_implemented' })
    }
    try {
      res.json({ categories: await store.categories() })
    } catch (error) {
      next(error)
    }
  })

  router.post('/reserve', async (req, res, next) => {
    if (!capabilities.reserve) {
      return res.status(404).json({ error: 'not_implemented' })
    }
    try {
      const { orderRef, lines = [] } = parse(req)
      const rejected = await store.reserve(orderRef, lines)
      res.json(
        rejected && rejected.length > 0 ? { ok: false, rejected } : { ok: true }
      )
    } catch (error) {
      next(error)
    }
  })

  router.post('/release', async (req, res, next) => {
    if (!capabilities.release) {
      return res.status(404).json({ error: 'not_implemented' })
    }
    try {
      const { orderRef, lines = [] } = parse(req)
      await store.release(orderRef, lines)
      res.json({ ok: true })
    } catch (error) {
      next(error)
    }
  })

  // eslint-disable-next-line no-unused-vars
  router.use((error, _req, res, _next) => {
    // Never send a stack trace back: NCOM shows this to the merchant, and the
    // detail belongs in your own logs.
    console.error('[ncom]', error)
    res.status(500).json({ error: 'server_error' })
  })

  return router
}

/**
 * Rejects anything not signed with the shared secret.
 *
 * Signed over `${timestamp}.${rawBody}` — the empty string for a GET — and
 * compared in constant time. The five-minute window means a captured request
 * stops working, and a server with a wrong clock fails here with a clear
 * message rather than mysteriously later.
 */
function verify(keyId, secret) {
  return (req, res, next) => {
    const provided = String(req.get('x-ncom-signature') ?? '')
    const body = typeof req.body === 'string' ? req.body : ''

    if (!timingSafeEqual(String(req.get('x-ncom-key') ?? ''), keyId)) {
      return res.status(401).json({ error: 'unauthorized' })
    }

    const parts = Object.fromEntries(
      provided.split(',').map((piece) => {
        const [key, ...rest] = piece.trim().split('=')
        return [key, rest.join('=')]
      })
    )

    const timestamp = Number(parts.t)
    if (!Number.isFinite(timestamp)) {
      return res.status(401).json({ error: 'unauthorized' })
    }
    if (Math.abs(Date.now() / 1000 - timestamp) > 300) {
      return res.status(401).json({ error: 'stale_timestamp' })
    }

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex')

    if (!timingSafeEqual(expected, String(parts.v1 ?? ''))) {
      return res.status(401).json({ error: 'unauthorized' })
    }

    next()
  }
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  // Length first: crypto.timingSafeEqual throws on a mismatch rather than
  // returning false, and a wrong-length value is wrong regardless.
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function parse(req) {
  try {
    return typeof req.body === 'string' && req.body ? JSON.parse(req.body) : {}
  } catch {
    return {}
  }
}

module.exports = { ncomConnector }

// ─────────────────────────────────────────────────────────────────────────
// What you write: the `store` object.
//
// Below is a complete example over a table of products. Replace the bodies
// with your own queries; the shapes are the contract.
// ─────────────────────────────────────────────────────────────────────────

/* eslint-disable no-unused-vars */
const exampleStore = {
  /** Set true if `products({search})` really filters. NCOM falls back if not. */
  searchable: true,

  /**
   * A page of products. Cursor-based rather than offset: a product sold
   * mid-scan must not shift the page under the cursor.
   */
  async products({ ids, limit, cursor, search, categoryId, includeDrafts }) {
    const rows = await db.query(
      ids.length
        ? 'SELECT * FROM products WHERE id = ANY($1)'
        : `SELECT * FROM products
            WHERE ($1::text IS NULL OR id > $1)
              AND ($2::text IS NULL OR title ILIKE '%' || $2 || '%')
              AND ($3::text IS NULL OR category_id = $3)
              AND ($4 OR published)
            ORDER BY id ASC LIMIT $5`,
      ids.length
        ? [ids]
        : [cursor, search, categoryId, includeDrafts, limit + 1]
    )

    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)

    return {
      products: page.map(shape),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    }
  },

  async product(idOrHandle) {
    const [row] = await db.query(
      'SELECT * FROM products WHERE id = $1 OR slug = $1 LIMIT 1',
      [idOrHandle]
    )
    return row ? shape(row) : null
  },

  /** The hot one: called on every cart render and again inside every checkout. */
  async stock(ids) {
    const rows = await db.query(
      'SELECT id, stock, backorder FROM variants WHERE id = ANY($1)',
      [ids]
    )
    return rows.map((row) => ({
      id: String(row.id),
      // null means "we do not count this line", which is not the same as zero.
      available: row.stock === null ? null : Number(row.stock),
      policy: row.backorder ? 'continue' : 'deny',
    }))
  },

  async categories() {
    const rows = await db.query(
      'SELECT id, name, slug, parent_id FROM categories'
    )
    return rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      handle: row.slug,
      parentId: row.parent_id ? String(row.parent_id) : null,
    }))
  },

  /**
   * Holds units for an order. Return the lines you refused, or nothing.
   *
   * The conditional UPDATE is the whole point: "take n if there are n", under
   * the row lock, in one statement. Reading the stock and then writing it lets
   * two checkouts both see the last unit and both succeed.
   */
  async reserve(orderRef, lines) {
    const rejected = []

    await db.transaction(async (tx) => {
      for (const line of lines) {
        const { rowCount } = await tx.query(
          `UPDATE variants SET stock = stock - $2
            WHERE id = $1 AND (stock IS NULL OR stock >= $2 OR backorder)`,
          [line.variantId, line.quantity]
        )
        if (rowCount === 0) {
          rejected.push({
            variantId: line.variantId,
            reason: 'Not enough stock left',
          })
        }
      }
      if (rejected.length > 0) throw new Rollback()
    })

    return rejected
  },

  /** Gives them back: a cancellation, a return, a checkout that failed. */
  async release(orderRef, lines) {
    for (const line of lines) {
      await db.query('UPDATE variants SET stock = stock + $2 WHERE id = $1', [
        line.variantId,
        line.quantity,
      ])
    }
  },
}

/** One row, in the shape NCOM reads. See docs/product-source.md §5. */
function shape(row) {
  return {
    id: String(row.id),
    handle: row.slug ?? String(row.id),
    title: row.title,
    status: row.published ? 'active' : 'draft',
    description: row.description ?? null,
    url: `https://yourshop.com/product/${row.slug}`,
    images: (row.images ?? []).map((image) => ({
      url: image.url,
      alt: image.alt ?? null,
    })),
    // A shop with one SKU per product can drop `variants` entirely and put
    // `price`, `sku` and `available` here instead — NCOM synthesises a single
    // variant whose id is the product's own id.
    variants: (row.variants ?? []).map((variant) => ({
      id: String(variant.id),
      title: variant.title ?? 'Default Title',
      sku: variant.sku ?? null,
      price: variant.price, // "1250.00" or 1250 — or priceCents: 125000
      compareAtPrice: variant.compare_at_price ?? null,
      options: [variant.option1, variant.option2].filter(Boolean),
      available: variant.stock === null ? null : Number(variant.stock),
      policy: variant.backorder ? 'continue' : 'deny',
      requiresShipping: true,
      weightGrams: Number(variant.weight_grams ?? 0),
      imageUrl: variant.image_url ?? null,
    })),
  }
}
