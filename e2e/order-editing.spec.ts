import { test, expect } from '@playwright/test'
import path from 'node:path'
import { Client } from 'pg'

/**
 * Order editing, the status dropdown and the analytics plan gate.
 *
 * All three share one registered workspace, created once in `beforeAll` and
 * reused through a saved storage state. That is not only for speed: registering
 * is rate limited to five attempts per quarter hour per IP, so a file that
 * registers per test starts failing on its second run and looks like a product
 * bug.
 *
 * Registration goes through the UI so the session is a real one; the catalogue
 * and the orders are written straight to the database, because reaching them
 * through a storefront checkout would be testing checkout.
 *
 * The assertions that matter are the ones about money and stock. An order
 * editor that renders correctly and books the wrong inventory is worse than one
 * that does not render at all, so every case here reads the database back.
 */

/**
 * Raw SQL rather than the Prisma client: Playwright's loader is CommonJS and
 * the generated client is ESM, so importing it here fails before any test runs.
 * These are assertions about rows, which SQL says perfectly well.
 */
let db: Client

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

  await context.storageState({ path: STORAGE_STATE })
  await context.close()
})

test.afterAll(async () => {
  await db?.end()
})

// Every test below runs as the owner registered above.
test.use({ storageState: STORAGE_STATE })

/** A product with one variant and a known amount of stock at one location. */
async function seedProduct(
  organizationId: string,
  title: string,
  priceCents: number,
  available: number
) {
  const existing = await all<{ id: string }>(
    `SELECT id FROM "Location" WHERE "organizationId" = $1 LIMIT 1`,
    [organizationId]
  )
  const locationId =
    existing[0]?.id ??
    (
      await one<{ id: string }>(
        `INSERT INTO "Location" (id, "organizationId", name)
         VALUES ($1, $2, 'Main') RETURNING id`,
        [id('loc'), organizationId]
      )
    ).id

  const productId = id('prod')
  await db.query(
    `INSERT INTO "Product" (id, "organizationId", title, handle, status, "updatedAt")
     VALUES ($1, $2, $3, $4, 'ACTIVE', now())`,
    [productId, organizationId, title, title.toLowerCase().replace(/\s+/g, '-')]
  )

  const variantId = id('var')
  await db.query(
    `INSERT INTO "ProductVariant"
       (id, "productId", title, sku, "priceCents", "inventoryTracked", "inventoryPolicy", "updatedAt")
     VALUES ($1, $2, 'Default Title', $3, $4, true, 'DENY', now())`,
    [variantId, productId, `${title.replace(/\s+/g, '')}-SKU`, priceCents]
  )

  await db.query(
    `INSERT INTO "InventoryLevel" (id, "variantId", "locationId", available, committed, "updatedAt")
     VALUES ($1, $2, $3, $4, 0, now())`,
    [id('lvl'), variantId, locationId, available]
  )

  return {
    product: { id: productId, title },
    variant: { id: variantId, sku: `${title.replace(/\s+/g, '')}-SKU` },
    locationId,
  }
}

async function availableFor(variantId: string) {
  const row = await one<{ available: string; committed: string }>(
    `SELECT COALESCE(SUM(available), 0) AS available,
            COALESCE(SUM(committed), 0) AS committed
       FROM "InventoryLevel" WHERE "variantId" = $1`,
    [variantId]
  )
  return { available: num(row.available), committed: num(row.committed) }
}

test('edit a placed order: change quantity, add a product, and see stock move', async ({
  page,
}) => {
  const stamp = Date.now()

  const shirt = await seedProduct(organizationId, `Shirt ${stamp}`, 50_000, 10)
  const cap = await seedProduct(organizationId, `Cap ${stamp}`, 20_000, 10)

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

  // The stock left the way checkout would have left it: two units out of
  // `available`, two sitting in `committed`.
  await db.query(
    `UPDATE "InventoryLevel"
        SET available = available - 2, committed = committed + 2
      WHERE "variantId" = $1`,
    [shirt.variant.id]
  )

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

    // One more shirt reserved: 8 available -> 7, 2 committed -> 3.
    expect(await availableFor(shirt.variant.id)).toEqual({
      available: 7,
      committed: 3,
    })

    // The cap was never reserved before, so one unit moves across.
    expect(await availableFor(cap.variant.id)).toEqual({
      available: 9,
      committed: 1,
    })

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

    expect(await availableFor(cap.variant.id)).toEqual({
      available: 10,
      committed: 0,
    })
  })
})

test('the order list colours rows by status and changes status inline', async ({
  page,
}) => {
  const stamp = Date.now()

  const item = await seedProduct(organizationId, `Widget ${stamp}`, 30_000, 5)

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
