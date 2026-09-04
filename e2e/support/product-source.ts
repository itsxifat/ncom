import { createServer, type Server } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Page } from '@playwright/test'

/**
 * A merchant's website, faked, for tests that need something to sell.
 *
 * NCOM stores no catalogue, so a test can no longer seed one with an INSERT.
 * What it seeds instead is a *shop*: this starts an HTTP server that implements
 * the connector contract (docs/product-source.md), and `connect()` drives the
 * real settings screen to point the workspace at it.
 *
 * Two properties make this worth the extra machinery over stubbing at a lower
 * level:
 *
 *   - The credentials come from the product itself. NCOM mints the secret and
 *     shows it once; the test reads it off the screen and hands it to this
 *     server. So the signature every request carries is verified by code
 *     written the way the documentation tells merchants to write it, and a
 *     signing change that would break every real connector breaks these tests.
 *
 *   - Stock movements are observable. `reservations` records what NCOM asked
 *     for, which is what "did the order take the stock" now means: NCOM does
 *     not own the number, so the assertion is about the request it made, not
 *     about a row it wrote.
 */

export interface FakeVariant {
  id: string
  title?: string
  sku?: string
  priceCents: number
  /** Null means the shop does not count this line: always sellable. */
  available: number | null
  policy?: 'deny' | 'continue'
}

export interface FakeProduct {
  id: string
  title: string
  handle?: string
  status?: 'active' | 'draft' | 'archived'
  imageUrl?: string
  variants: FakeVariant[]
}

export interface StockMovement {
  kind: 'reserve' | 'release'
  orderRef: string
  lines: { variantId: string; quantity: number }[]
}

export class FakeShop {
  private server: Server | null = null
  private secret = ''
  private keyId = ''

  readonly products = new Map<string, FakeProduct>()
  /** Every reserve/release NCOM asked for, in order. */
  readonly movements: StockMovement[] = []
  /** Every path NCOM called, for asserting what a render actually cost. */
  readonly calls: string[] = []

  /** Set false to make /reserve refuse everything, as a sold-out shop would. */
  reserveSucceeds = true

  async listen(): Promise<number> {
    this.server = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        this.calls.push(`${req.method} ${url.pathname}`)

        if (!this.verify(req.headers as Record<string, string>, body)) {
          res.writeHead(401, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'unauthorized' }))
          return
        }

        const send = (payload: unknown, status = 200) => {
          res.writeHead(status, { 'content-type': 'application/json' })
          res.end(JSON.stringify(payload))
        }

        if (url.pathname.endsWith('/ping')) {
          return send({
            ok: true,
            contract: '1',
            platform: 'fake-shop/1.0',
            currency: 'BDT',
            capabilities: {
              products: true,
              stock: true,
              search: true,
              categories: false,
              reserve: true,
              release: true,
            },
          })
        }

        if (url.pathname.endsWith('/products')) {
          const ids = String(url.searchParams.get('ids') ?? '')
            .split(',')
            .filter(Boolean)
          const search = (url.searchParams.get('q') ?? '').toLowerCase()

          let products = [...this.products.values()]
          if (ids.length > 0) {
            products = products.filter((product) => ids.includes(product.id))
          } else if (search) {
            products = products.filter((product) =>
              product.title.toLowerCase().includes(search)
            )
          }

          return send({ products: products.map(shape), nextCursor: null })
        }

        if (url.pathname.includes('/products/')) {
          const key = decodeURIComponent(url.pathname.split('/products/')[1])
          const found = [...this.products.values()].find(
            (product) => product.id === key || product.handle === key
          )
          return found
            ? send({ product: shape(found) })
            : send({ error: 'not_found' }, 404)
        }

        if (url.pathname.endsWith('/stock')) {
          const ids: string[] = JSON.parse(body || '{}').ids ?? []
          return send({
            stock: ids.map((variantId) => {
              const variant = this.variant(variantId)
              return {
                id: variantId,
                available: variant?.available ?? 0,
                policy: variant?.policy ?? 'deny',
              }
            }),
          })
        }

        if (url.pathname.endsWith('/reserve')) {
          const payload = JSON.parse(body || '{}')
          const lines = payload.lines ?? []

          if (!this.reserveSucceeds) {
            return send({
              ok: false,
              rejected: lines.map((line: { variantId: string }) => ({
                variantId: line.variantId,
                reason: 'Sold out',
              })),
            })
          }

          // Conditional, like a real shop's: refuse the whole thing rather than
          // taking what is there and leaving the merchant a half-shipped order.
          const short = lines.find(
            (line: { variantId: string; quantity: number }) => {
              const variant = this.variant(line.variantId)
              return (
                variant &&
                variant.available !== null &&
                variant.policy !== 'continue' &&
                variant.available < line.quantity
              )
            }
          )

          if (short) {
            return send({
              ok: false,
              rejected: [
                { variantId: short.variantId, reason: 'Not enough stock left' },
              ],
            })
          }

          for (const line of lines) {
            const variant = this.variant(line.variantId)
            if (variant && variant.available !== null) {
              variant.available -= line.quantity
            }
          }

          this.movements.push({
            kind: 'reserve',
            orderRef: payload.orderRef,
            lines,
          })
          return send({ ok: true })
        }

        if (url.pathname.endsWith('/release')) {
          const payload = JSON.parse(body || '{}')
          for (const line of payload.lines ?? []) {
            const variant = this.variant(line.variantId)
            if (variant && variant.available !== null) {
              variant.available += line.quantity
            }
          }
          this.movements.push({
            kind: 'release',
            orderRef: payload.orderRef,
            lines: payload.lines ?? [],
          })
          return send({ ok: true })
        }

        send({ error: 'not_found' }, 404)
      })
    })

    await new Promise<void>((resolve) =>
      this.server!.listen(0, '127.0.0.1', resolve)
    )

    return (this.server!.address() as { port: number }).port
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()))
  }

  add(product: FakeProduct): FakeProduct {
    this.products.set(product.id, {
      ...product,
      handle:
        product.handle ?? product.title.toLowerCase().replace(/\s+/g, '-'),
    })
    return this.products.get(product.id)!
  }

  variant(variantId: string): FakeVariant | undefined {
    for (const product of this.products.values()) {
      const found = product.variants.find((variant) => variant.id === variantId)
      if (found) return found
    }
    return undefined
  }

  /** What the shop says is left, for an assertion after an order. */
  availableFor(variantId: string): number | null {
    return this.variant(variantId)?.available ?? null
  }

  reservedFor(variantId: string): number {
    let total = 0
    for (const movement of this.movements) {
      for (const line of movement.lines) {
        if (line.variantId !== variantId) continue
        total += movement.kind === 'reserve' ? line.quantity : -line.quantity
      }
    }
    return total
  }

  /**
   * Connects this shop to the signed-in workspace, through the real screen.
   *
   * Deliberately not an INSERT: the secret is encrypted at rest with a key
   * derived from AUTH_SECRET, and a test that reimplemented that encryption
   * would be testing its own copy of it. Driving the settings page also proves
   * the flow a merchant actually follows still works.
   */
  async connect(page: Page, port: number): Promise<void> {
    await page.goto('/settings/product-source')
    await page
      .getByLabel('Connector base URL')
      .fill(`http://127.0.0.1:${port}/ncom/v1`)
    await page.getByRole('button', { name: /Connect|Save and test/ }).click()

    // The credentials are shown exactly once, in the block that appears after a
    // *new* connection is created. A workspace reused from an earlier run
    // already has one, and saving it again correctly refuses to re-show a
    // secret it can no longer read — so rotate to get a fresh pair. That is the
    // same escape hatch a merchant who lost theirs uses.
    const credentials = page.locator('pre').first()
    if (!(await credentials.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Rotate secret' }).click()
    }

    const shown = await credentials.innerText({ timeout: 15_000 })
    const keyId = /NCOM_KEY_ID=(\S+)/.exec(shown)?.[1]
    const secret = /NCOM_SECRET=(\S+)/.exec(shown)?.[1]

    if (!keyId || !secret) {
      throw new Error(`Could not read the connector credentials from: ${shown}`)
    }

    this.keyId = keyId
    this.secret = secret

    // The handshake that ran during Connect happened before this server knew
    // the secret, so it was refused. Test again now that it can answer — which
    // is also what records the capabilities the dashboard reports.
    await page.getByRole('button', { name: 'Test now' }).click()
    await page.getByText(/fake-shop/).waitFor({ timeout: 15_000 })
  }

  /** Exactly the verification docs/product-source.md §3 asks merchants for. */
  private verify(headers: Record<string, string>, body: string): boolean {
    if (!this.secret) return false
    if (headers['x-ncom-key'] !== this.keyId) return false

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

    const expected = createHmac('sha256', this.secret)
      .update(`${timestamp}.${body}`)
      .digest('hex')

    const a = Buffer.from(expected)
    const b = Buffer.from(String(parts.v1 ?? ''))
    return a.length === b.length && timingSafeEqual(a, b)
  }
}

function shape(product: FakeProduct) {
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    status: product.status ?? 'active',
    images: product.imageUrl ? [{ url: product.imageUrl, alt: null }] : [],
    variants: product.variants.map((variant) => ({
      id: variant.id,
      title: variant.title ?? 'Default Title',
      sku: variant.sku ?? null,
      priceCents: variant.priceCents,
      available: variant.available,
      policy: variant.policy ?? 'deny',
      requiresShipping: true,
      weightGrams: 0,
    })),
  }
}
