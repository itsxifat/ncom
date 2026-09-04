import { test, expect } from '@playwright/test'
import path from 'node:path'
import { Client } from 'pg'
import { FakeShop } from './support/product-source'

/**
 * Order editing, the status dropdown and the analytics plan gate.
 *
 * All three share one registered workspace, created once in `beforeAll` and
 * reused through a saved storage state. That is not only for speed: registering
 * is rate limited to five attempts per quarter hour per IP, so a file that
 * registers per test starts failing on its second run and looks like a product
 * bug.
 *
 * Registration goes through the UI so the session is a real one; the orders are
 * written straight to the database, because reaching them through a storefront
 * checkout would be testing checkout.
 *
 * The catalogue cannot be written at all: NCOM does not store one. It is served
 * by a fake merchant website (see support/product-source.ts) which the workspace
 * is pointed at through the real settings screen, so what the editor reads here
 * is a live HTTP read exactly as production does it.
 *
 * The assertions that matter are the ones about money and stock. An order
 * editor that renders correctly and books the wrong inventory is worse than one
 * that does not render at all — so money is read back from the database, and
 * stock from the shop that owns it.
 */

/**
 * Raw SQL rather than the Prisma client: Playwright's loader is CommonJS and
 * the generated client is ESM, so importing it here fails before any test runs.
 * These are assertions about rows, which SQL says perfectly well.
 */
let db: Client
let shop: FakeShop

async function one<T = Record<string, unknown>>(
  sql: string,
  values: unknown[] = []
): Promise<T> {
  const result = await db.query(sql, values)
  if (result.rows.length === 0) throw new Error(`No rows for: ${sql}`)
  return result.rows[0] as T
}

async function all<T = Record<string, unknown>>(
  sql: string,
  values: unknown[] = []
): Promise<T[]> {
  const result = await db.query(sql, values)
  return result.rows as T[]
}

/** Postgres returns bigint/numeric as strings; every count here fits a number. */
const num = (value: unknown) => Number(value ?? 0)

/** cuid-ish id, since these rows are written outside Prisma's defaults. */
const id = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

const STORAGE_STATE = path.join(__dirname, '.auth-order-editing.json')

let organizationId: string

const PASSWORD = 'Sup3rSecure!Passw0rd'

// Registration, a round trip to the database and a dashboard render — more
// than the default hook budget on a cold dev server.
test.setTimeout(90_000)

test.beforeAll(async ({ browser }) => {
  test.setTimeout(90_000)
  db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()

  shop = new FakeShop()
  const shopPort = await shop.listen()

  // `storageState: undefined` explicitly: Playwright's `browser` fixture merges
  // the file's `test.use` context options into `newContext()`, and this is the
  // context that has to run signed *out* in order to create that state.
  const context = await browser.newContext({ storageState: undefined })
  const page = await context.newPage()

  const email = `order-edit-${Date.now()}@example.com`
  await page.goto('/register')
  await page.getByLabel('Name').fill('Order Edit Owner')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  // Either straight through, or held at the verification screen — which of the
  // two depends on the `auth.requireEmailVerification` platform flag, and a
  // test that only passes with it off is a test that stops running.
  await page.waitForURL(/\/(dashboard|verify-email)/, { timeout: 30_000 })

  await db.query(`UPDATE "User" SET "emailVerified" = now() WHERE email = $1`, [
    email,
  ])

  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })

  organizationId = (
    await one<{ organizationId: string }>(
      `SELECT m."organizationId"
         FROM "Membership" m
         JOIN "User" u ON u.id = m."userId"
        WHERE u.email = $1
        LIMIT 1`,
      [email]
    )
  ).organizationId

  // Point the workspace at the fake shop before saving the session, so every
  // test below opens with a catalogue already connected.
  await shop.connect(page, shopPort)

  await context.storageState({ path: STORAGE_STATE })
  await context.close()
})

test.afterAll(async () => {
  await shop?.close()
  await db?.end()
})

// Every test below runs as the owner registered above.
test.use({ storageState: STORAGE_STATE })

/**
 * A product with one variant and a known amount of stock, on the fake shop.
 *
 * Synchronous, and no SQL: the catalogue is not in this database. The ids are
 * the shop's own, which is exactly what an order line stores.
 */
function seedProduct(title: string, priceCents: number, available: number) {
  const productId = id('prod')
  const variantId = id('var')
  const sku = `${title.replace(/\s+/g, '')}-SKU`

  shop.add({
    id: productId,
    title,
    variants: [
      { id: variantId, title: 'Default Title', sku, priceCents, available },
    ],
  })

  return { product: { id: productId, title }, variant: { id: variantId, sku } }
}

/**
 * What the shop says is left.
 *
 * There is no `committed` any more: that column existed because NCOM held its
 * own copy of the count and had to remember which part of it was promised. The
 * merchant's shop holds one number, and an order either took units out of it or
 * did not.
 */
function availableFor(variantId: string): number | null {
  return shop.availableFor(variantId)
}

test('edit a placed order: change quantity, add a product, and see stock move', async ({
  page,
}) => {
  const stamp = Date.now()

  const shirt = seedProduct(`Shirt ${stamp}`, 50_000, 10)
  const cap = seedProduct(`Cap ${stamp}`, 20_000, 10)

  // One order for two shirts, with the stock reserved the way checkout would
  // have left it: two units out of `available`, two sitting in `committed`.
  const orderId = id('ord')
  await db.query(
    `INSERT INTO "Order"
       (id, "organizationId", "orderNumber", email, phone, "currencyCode",
        "subtotalCents", "shippingTotalCents", "totalCents",
        "financialStatus", "workflowState", "updatedAt")
     VALUES ($1, $2, $3, 'buyer@example.com', '01700000000', 'BDT',
             100000, 6000, 106000, 'PENDING', 'PENDING', now())`,
    [orderId, organizationId, `#E2E${stamp}`]
  )
  await db.query(
    `INSERT INTO "OrderLine"
       (id, "orderId", "productId", "variantId", title, "variantTitle", sku,
        quantity, "unitPriceCents", "totalCents")
     VALUES ($1, $2, $3, $4, $5, 'Default Title', $6, 2, 50000, 100000)`,
    [
      id('ln'),
      orderId,
      shirt.product.id,
      shirt.variant.id,
      shirt.product.title,
      shirt.variant.sku,
    ]
  )

  // The stock left the way checkout would have left it: the shop reserved two
  // when the order was placed, so it has eight.
  shop.variant(shirt.variant.id)!.available = 8

  await test.step('the editor opens with the order in it', async () => {
    await page.goto(`/orders/${orderId}`)
    await page.getByRole('button', { name: 'Edit order' }).click()
    await expect(
      page.getByRole('heading', { name: `Edit #E2E${stamp}` })
    ).toBeVisible()
  })

  await test.step('raise the shirt from 2 to 3', async () => {
    await page
      .getByRole('button', { name: `One more ${shirt.product.title}` })
      .click()
    await expect(
      page.getByRole('textbox', { name: `Quantity of ${shirt.product.title}` })
    ).toHaveValue('3')
  })

  await test.step('search the catalogue and add the cap', async () => {
    await page.getByLabel('Search products to add').fill(`Cap ${stamp}`)
    await page
      .getByRole('button', { name: new RegExp(`Cap ${stamp}`) })
      .first()
      .click()
    await expect(page.getByText('New', { exact: true })).toBeVisible()
  })

  await test.step('save', async () => {
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(
      page.getByRole('heading', { name: `Edit #E2E${stamp}` })
    ).toBeHidden({ timeout: 20_000 })
  })

  await test.step('the order and the stock both moved', async () => {
    const saved = await one<{
      subtotalCents: number
      totalCents: number
    }>(`SELECT "subtotalCents", "totalCents" FROM "Order" WHERE id = $1`, [
      orderId,
    ])

    // 3 shirts at 500 + 1 cap at 200 = 1700, plus the 60 delivery already on it.
    expect(num(saved.subtotalCents)).toBe(170_000)
    expect(num(saved.totalCents)).toBe(176_000)

    const savedLines = await all<{
      variantId: string
      quantity: number
      totalCents: number
      unitPriceCents: number
      title: string
    }>(
      `SELECT "variantId", quantity, "totalCents", "unitPriceCents", title
         FROM "OrderLine" WHERE "orderId" = $1`,
      [orderId]
    )
    expect(savedLines).toHaveLength(2)

    const shirtLine = savedLines.find(
      (line) => line.variantId === shirt.variant.id
    )
    expect(num(shirtLine?.quantity)).toBe(3)
    expect(num(shirtLine?.totalCents)).toBe(150_000)

    const capLine = savedLines.find((line) => line.variantId === cap.variant.id)
    expect(num(capLine?.quantity)).toBe(1)
    // Snapshotted, not joined — the order has to survive the product going away.
    expect(capLine?.title).toBe(cap.product.title)
    expect(num(capLine?.unitPriceCents)).toBe(20_000)

    // One more shirt asked for: the shop went 8 -> 7.
    expect(availableFor(shirt.variant.id)).toBe(7)
    expect(shop.reservedFor(shirt.variant.id)).toBe(1)

    // The cap was never on this order before, so one unit leaves the shelf.
    expect(availableFor(cap.variant.id)).toBe(9)
    expect(shop.reservedFor(cap.variant.id)).toBe(1)

    // The edit is on the record, with a human-readable summary.
    const edited = await one<{ message: string }>(
      `SELECT message FROM "OrderEvent"
        WHERE "orderId" = $1 AND type = 'order_edited'
        ORDER BY "createdAt" DESC LIMIT 1`,
      [orderId]
    )
    expect(edited.message).toContain('2 → 3')
    expect(edited.message).toContain('added 1')
  })

  await test.step('removing a line gives its stock back', async () => {
    await page.goto(`/orders/${orderId}`)
    await page.getByRole('button', { name: 'Edit order' }).click()
    await page
      .getByRole('button', { name: `Remove ${cap.product.title}` })
      .click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(
      page.getByRole('heading', { name: `Edit #E2E${stamp}` })
    ).toBeHidden({ timeout: 20_000 })

    const saved = await one<{ subtotalCents: number }>(
      `SELECT "subtotalCents" FROM "Order" WHERE id = $1`,
      [orderId]
    )
    const remaining = await all(
      `SELECT id FROM "OrderLine" WHERE "orderId" = $1`,
      [orderId]
    )
    expect(remaining).toHaveLength(1)
    expect(num(saved.subtotalCents)).toBe(150_000)

    // Released back to the shop, which is the only place it can go now.
    expect(availableFor(cap.variant.id)).toBe(10)
    expect(shop.reservedFor(cap.variant.id)).toBe(0)
  })
})

test('the order list colours rows by status and changes status inline', async ({
  page,
}) => {
  const stamp = Date.now()

  const item = seedProduct(`Widget ${stamp}`, 30_000, 5)

  const orderId = id('ord')
  await db.query(
    `INSERT INTO "Order"
       (id, "organizationId", "orderNumber", phone, "currencyCode",
        "subtotalCents", "totalCents", "workflowState", "updatedAt")
     VALUES ($1, $2, $3, '01800000000', 'BDT', 30000, 30000, 'PROCESSING', now())`,
    [orderId, organizationId, `#LIST${stamp}`]
  )
  await db.query(
    `INSERT INTO "OrderLine"
       (id, "orderId", "productId", "variantId", title, quantity, "unitPriceCents", "totalCents")
     VALUES ($1, $2, $3, $4, $5, 1, 30000, 30000)`,
    [id('ln'), orderId, item.product.id, item.variant.id, item.product.title]
  )

  await test.step('the row is there and searchable by phone', async () => {
    await page.goto('/orders')
    await expect(
      page.getByRole('link', { name: `#LIST${stamp}` })
    ).toBeVisible()

    // The placeholder promises phone search, so it has to work.
    await page.getByLabel('Search orders').fill('01800000000')
    await expect(
      page.getByRole('link', { name: `#LIST${stamp}` })
    ).toBeVisible()
    await page.getByLabel('Search orders').fill('')
  })

  await test.step('move it to Delivered from the list', async () => {
    await page
      .getByRole('button', { name: /Delivery status: Processing/ })
      .click()
    // `exact` matters: without it this also matches "Partially delivered".
    await page.getByRole('menuitem', { name: 'Delivered', exact: true }).click()

    await expect(
      page.getByRole('button', { name: /Delivery status: Delivered/ })
    ).toBeVisible({ timeout: 20_000 })
  })

  await test.step('the status really changed, and stock was consumed', async () => {
    const saved = await one<{
      workflowState: string
      stockConsumedAt: Date | null
    }>(`SELECT "workflowState", "stockConsumedAt" FROM "Order" WHERE id = $1`, [
      orderId,
    ])
    expect(saved.workflowState).toBe('DELIVERED')
    // Delivered means the goods left, so the reservation is spent rather than
    // still held — the same guarantee the courier path gives.
    expect(saved.stockConsumedAt).not.toBeNull()
  })

  await test.step('the workspace can choose what each status looks like', async () => {
    await page.goto('/orders')
    await page.getByRole('button', { name: 'Colours' }).click()
    await expect(
      page.getByRole('heading', { name: 'Order list colours' })
    ).toBeVisible()

    // Paint Delivered purple instead of its default green.
    await page
      .getByRole('radiogroup', { name: 'Colour for Delivered' })
      .getByRole('radio', { name: 'Purple' })
      .click()
    await page.getByRole('button', { name: 'Save colours' }).click()

    await expect(
      page.getByRole('heading', { name: 'Order list colours' })
    ).toBeHidden({ timeout: 20_000 })

    const saved = await one<{ orderStatusColors: Record<string, string> }>(
      `SELECT "orderStatusColors" FROM "OrganizationSettings" WHERE "organizationId" = $1`,
      [organizationId]
    )
    expect(saved.orderStatusColors.DELIVERED).toBe('purple')

    // And the row actually repaints — the whole point of storing it.
    await page.reload()
    const row = page
      .locator('[data-slot="list-row"]')
      .filter({ hasText: `#LIST${stamp}` })
    await expect(row).toHaveClass(/violet/)
  })

  await test.step('a delivered order can no longer be edited', async () => {
    await page.goto(`/orders/${orderId}`)
    await expect(
      page.getByRole('button', { name: 'Edit order' })
    ).toBeDisabled()
  })
})

test('analytics is locked on the free plan and shows an upgrade screen, not a 404', async ({
  page,
}) => {
  await test.step('put the workspace on the free plan', async () => {
    // Asserted rather than assumed: another test in this file moves it to a
    // paid plan, and a test that only passes in file order is a trap.
    const free = await one<{ id: string }>(
      `SELECT id FROM "Plan" WHERE "isDefault" = true LIMIT 1`
    )
    await db.query(
      `UPDATE "Subscription" SET "planId" = $1 WHERE "organizationId" = $2`,
      [free.id, organizationId]
    )
  })

  await test.step('on Free, analytics is locked', async () => {
    const response = await page.goto('/analytics')
    // The point of the whole change: answered, not 404.
    expect(response?.status()).toBe(200)
    await expect(
      page.getByRole('heading', { name: /not included in your plan/ })
    ).toBeVisible()
    // Matched on the href, not the link role: Base UI's Button renders a Link
    // with `role="button"`, which is what the whole app does — the assertion
    // that matters is that it points at the price sheet.
    await expect(page.locator('a[href="/billing/plans"]')).toBeVisible()
  })

  await test.step('the CSV export refuses too, rather than leaking it', async () => {
    const response = await page.request.get(
      '/api/analytics/export?range=last_30_days'
    )
    // 403, not 404: the endpoint exists and the answer is "not on your plan".
    expect(response.status()).toBe(403)
  })

  await test.step('on a paid plan the real report renders', async () => {
    const paid = await one<{ id: string }>(
      `SELECT id FROM "Plan"
        WHERE "isDefault" = false AND "isActive" = true
        ORDER BY position LIMIT 1`
    )
    await db.query(
      `UPDATE "Subscription" SET "planId" = $1 WHERE "organizationId" = $2`,
      [paid.id, organizationId]
    )

    await page.goto('/analytics')
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible()
    // The real report, not the locked screen.
    await expect(
      page.getByRole('heading', { name: /not included in your plan/ })
    ).toBeHidden()
    // `.first()`: the header renders its actions twice for the responsive
    // layout, so this resolves to two identical links.
    await expect(
      page.getByRole('button', { name: 'Export CSV' }).first()
    ).toBeVisible()

    // The chart, which is the part that used to bring the page down. It only
    // renders once the workspace has orders — the earlier tests in this file
    // have placed some by now — and it is a Client Component, so a formatter
    // function handed to it from this Server Component throws at render. Assert
    // the chart, not just the page, or that regression comes back invisible.
    await expect(page.getByText('Money over time')).toBeVisible()
    // The chart's own legend — rendered by AnalyticsTrend itself, so this fails
    // if the component throws rather than merely if the card around it renders.
    await expect(page.getByRole('button', { name: 'Table' })).toBeVisible()
  })
})

/**
 * One status, on both screens.
 *
 * An order carries two cancellation signals — `cancelledAt` and the pipeline
 * state — and cancelling used to write only the first. The detail page read
 * both and said "Cancelled"; the order list read the pipeline alone and went on
 * saying "Processing", so the same order answered the same question two ways
 * depending on which screen asked. Both halves are checked here: the drifted
 * rows that bug left behind must read as cancelled, and a cancellation made
 * today must leave nothing to resolve.
 */
test('a cancelled order reads as cancelled in the list, not only on its own page', async ({
  page,
}) => {
  const stamp = Date.now()
  const item = seedProduct(`Boxed set ${stamp}`, 25_000, 6)

  const line = (orderId: string) =>
    db.query(
      `INSERT INTO "OrderLine"
         (id, "orderId", "productId", "variantId", title, quantity, "unitPriceCents", "totalCents")
       VALUES ($1, $2, $3, $4, $5, 1, 25000, 25000)`,
      [id('ln'), orderId, item.product.id, item.variant.id, item.product.title]
    )

  // The shape the old cancel path left behind: stopped an hour after the
  // pipeline last moved, with the pipeline none the wiser.
  const strandedId = id('ord')
  await db.query(
    `INSERT INTO "Order"
       (id, "organizationId", "orderNumber", phone, "currencyCode",
        "subtotalCents", "totalCents", "workflowState", "workflowUpdatedAt",
        "cancelledAt", "cancelReason", "updatedAt")
     VALUES ($1, $2, $3, '01800000002', 'BDT', 25000, 25000, 'PROCESSING',
             now() - interval '2 hours', now() - interval '1 hour', 'CUSTOMER', now())`,
    [strandedId, organizationId, `#OLD${stamp}`]
  )
  await line(strandedId)

  const liveId = id('ord')
  await db.query(
    `INSERT INTO "Order"
       (id, "organizationId", "orderNumber", phone, "currencyCode",
        "subtotalCents", "totalCents", "workflowState", "updatedAt")
     VALUES ($1, $2, $3, '01800000003', 'BDT', 25000, 25000, 'PROCESSING', now())`,
    [liveId, organizationId, `#NEW${stamp}`]
  )
  await line(liveId)

  const rowFor = (orderNumber: string) =>
    page.locator('[data-slot="list-row"]').filter({ hasText: orderNumber })

  await test.step('a row whose columns drifted apart still reads cancelled', async () => {
    await page.goto('/orders')

    const row = rowFor(`#OLD${stamp}`)
    await expect(row.getByText('Cancelled')).toBeVisible()
    // And not under the status the pipeline was left on.
    await expect(row.getByText('Processing')).toHaveCount(0)
    // Cancelled orders are not moved along by hand, so the row offers no menu.
    await expect(
      row.getByRole('button', { name: /Delivery status/ })
    ).toHaveCount(0)
  })

  await test.step('cancelling from the order page moves the pipeline too', async () => {
    await page.goto(`/orders/${liveId}`)
    await page.getByRole('button', { name: 'Cancel order' }).click()
    await page
      .getByRole('button', { name: 'Cancel order' })
      .click({ timeout: 20_000 })

    // The panel is gone once the order is stopped, and the header says so —
    // there is no success banner to wait on, the page itself is the receipt.
    await expect(
      page.getByRole('button', { name: 'Cancel order' })
    ).toHaveCount(0, { timeout: 20_000 })
    await expect(
      page.getByText('Cancelled', { exact: true }).first()
    ).toBeVisible()

    const saved = await one<{
      workflowState: string
      cancelledAt: Date | null
    }>(`SELECT "workflowState", "cancelledAt" FROM "Order" WHERE id = $1`, [
      liveId,
    ])
    // The point of the merge: one write, both columns.
    expect(saved.workflowState).toBe('CANCELLED')
    expect(saved.cancelledAt).not.toBeNull()
  })

  await test.step('and the order book says so without a reload trick', async () => {
    await page.goto('/orders')
    await expect(rowFor(`#NEW${stamp}`).getByText('Cancelled')).toBeVisible()
  })

  await test.step('neither one is offered for a printed label', async () => {
    await page.goto('/labels?view=all')
    await expect(page.getByText(`#OLD${stamp}`)).toHaveCount(0)
    await expect(page.getByText(`#NEW${stamp}`)).toHaveCount(0)
  })
})

/**
 * A price agreed on the phone.
 *
 * The merchant's other half of "make it three" is "I'll do it for four-fifty",
 * and until the editor could take a price the only way to record it was an
 * order-level discount that happened to equal the difference — which lands on
 * the customer's invoice as a discount they never asked for and leaves the
 * margin report unable to tell a negotiated price from a promotion.
 *
 * The guarantee that matters, and the reason this reads the catalogue back: the
 * price is the *order's*. A workspace that discovers its whole price list moved
 * because someone haggled over one order has lost more than the order.
 */
test('a line can be repriced for one order without touching the catalogue', async ({
  page,
}) => {
  const stamp = Date.now()

  const mug = seedProduct(`Mug ${stamp}`, 50_000, 10)

  const orderId = id('ord')
  await db.query(
    `INSERT INTO "Order"
       (id, "organizationId", "orderNumber", email, phone, "currencyCode",
        "subtotalCents", "shippingTotalCents", "totalCents",
        "financialStatus", "workflowState", "updatedAt")
     VALUES ($1, $2, $3, 'buyer@example.com', '01700000001', 'BDT',
             100000, 6000, 106000, 'PENDING', 'PENDING', now())`,
    [orderId, organizationId, `#PRICE${stamp}`]
  )
  await db.query(
    `INSERT INTO "OrderLine"
       (id, "orderId", "productId", "variantId", title, "variantTitle", sku,
        quantity, "unitPriceCents", "totalCents")
     VALUES ($1, $2, $3, $4, $5, 'Default Title', $6, 2, 50000, 100000)`,
    [
      id('ln'),
      orderId,
      mug.product.id,
      mug.variant.id,
      mug.product.title,
      mug.variant.sku,
    ]
  )
  shop.variant(mug.variant.id)!.available = 8

  await test.step('type a new price on the line', async () => {
    await page.goto(`/orders/${orderId}`)
    await page.getByRole('button', { name: 'Edit order' }).click()

    const price = page.getByRole('textbox', {
      name: `Price of ${mug.product.title}, per item`,
    })
    await expect(price).toHaveValue('500.00')
    await price.fill('450.00')

    // The row's own total follows immediately — the merchant is reading this
    // back to someone before the server has answered.
    await expect(page.getByText('900.00').first()).toBeVisible()
  })

  await test.step('save', async () => {
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(
      page.getByRole('heading', { name: `Edit #PRICE${stamp}` })
    ).toBeHidden({ timeout: 20_000 })
  })

  await test.step('the order is repriced and the catalogue is not', async () => {
    const line = await one<{ unitPriceCents: number; totalCents: number }>(
      `SELECT "unitPriceCents", "totalCents" FROM "OrderLine" WHERE "orderId" = $1`,
      [orderId]
    )
    expect(num(line.unitPriceCents)).toBe(45_000)
    expect(num(line.totalCents)).toBe(90_000)

    const saved = await one<{ subtotalCents: number; totalCents: number }>(
      `SELECT "subtotalCents", "totalCents" FROM "Order" WHERE id = $1`,
      [orderId]
    )
    // 2 × 450, plus the 60 delivery the order already carried.
    expect(num(saved.subtotalCents)).toBe(90_000)
    expect(num(saved.totalCents)).toBe(96_000)

    // The whole point: the shop still lists it at 500 for the next customer.
    // A negotiated price is written to the order and never back to the
    // catalogue — which NCOM could not write to even if it wanted to.
    expect(shop.variant(mug.variant.id)?.priceCents).toBe(50_000)

    // Repricing moves no stock — the customer is buying the same two mugs.
    expect(availableFor(mug.variant.id)).toBe(8)
    expect(shop.reservedFor(mug.variant.id)).toBe(0)

    // And the history says what happened, in money rather than in paisa.
    const edited = await one<{ message: string }>(
      `SELECT message FROM "OrderEvent"
        WHERE "orderId" = $1 AND type = 'order_edited'
        ORDER BY "createdAt" DESC LIMIT 1`,
      [orderId]
    )
    // Whitespace-normalised: Intl separates a currency code from its amount
    // with U+00A0, and an assertion typed with an ordinary space fails against
    // a string that is entirely correct.
    expect(edited.message.replace(/\s/g, ' ')).toContain(
      'BDT 500.00 → BDT 450.00 each'
    )
  })
})
