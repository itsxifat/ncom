import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { Client } from 'pg'
import Redis from 'ioredis'
import { FakeShop } from './support/product-source'

/**
 * Offers and discounts, driven through the screens a merchant actually uses.
 *
 * The two things this file exists to prove, because both were reported broken
 * and neither is visible to a type-checker:
 *
 *   - a price-ladder rung can be given an item count, on a phone as well as on
 *     a desktop. The rung row used to be five controls in one non-wrapping flex
 *     row, and at 360px the quantity box was squeezed to 30px — 2px of typing
 *     area once its own padding is taken;
 *   - every offer kind (fixed set, mix & match, à la carte) saves what was
 *     typed and prices the way the buyer is told it will.
 *
 * Registration goes through the UI once, in `beforeAll`, and is reused through
 * a saved storage state: registering is rate limited to five attempts per
 * quarter hour per IP, so a file that registers per test starts failing on its
 * second run and looks like a product bug.
 *
 * The catalogue is not written anywhere: NCOM does not store one. It is served
 * by a fake merchant website (support/product-source.ts) that the workspace is
 * pointed at through the real settings screen, so an offer built here resolves
 * its products over HTTP exactly as a live landing page does.
 *
 * Raw SQL rather than the Prisma client, for the reason order-editing.spec.ts
 * gives: Playwright's loader is CommonJS and the generated client is ESM.
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

const num = (value: unknown) => Number(value ?? 0)

/** cuid-ish id, since these rows are written outside Prisma's defaults. */
const id = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

const STORAGE_STATE = path.join(__dirname, '.auth-offers.json')
const FIXTURE = path.join(__dirname, '.auth-offers-fixture.json')
const PASSWORD = 'Sup3rSecure!Passw0rd'

let organizationId: string

test.setTimeout(120_000)

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()

  shop = new FakeShop()
  const shopPort = await shop.listen()

  // Registering is rate limited to five attempts per quarter hour per IP, and
  // this file is run over and over while it is being written. A workspace whose
  // saved session still works is reused rather than replaced.
  if (fs.existsSync(STORAGE_STATE) && fs.existsSync(FIXTURE)) {
    const saved = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as {
      organizationId: string
      email: string
    }
    const context = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await context.newPage()
    await page.goto('/discounts/offers')
    const stillSignedIn = !/\/login/.test(page.url())

    if (stillSignedIn) {
      // The shop is a fresh process on a fresh port every run, so the reused
      // workspace has to be re-pointed at it before anything can be sold.
      await shop.connect(page, shopPort)
      await context.close()
      organizationId = saved.organizationId
      return
    }

    await context.close()
  }

  const context = await browser.newContext({ storageState: undefined })
  const page = await context.newPage()

  const email = `offers-${Date.now()}@example.com`
  await page.goto('/register')
  await page.getByLabel('Name').fill('Offers Owner')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  await page.waitForURL(/\/(dashboard|verify-email|onboarding)/, {
    timeout: 60_000,
  })

  await db.query(`UPDATE "User" SET "emailVerified" = now() WHERE email = $1`, [
    email,
  ])

  await page.goto('/dashboard')

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

  await shop.connect(page, shopPort)

  await context.storageState({ path: STORAGE_STATE })
  fs.writeFileSync(FIXTURE, JSON.stringify({ organizationId, email }))
  await context.close()
})

test.afterAll(async () => {
  await shop?.close()
  await db?.end()
})

test.use({ storageState: STORAGE_STATE })

/** A store and one landing page for it, created once for the whole file. */
async function seedStorefront(organizationId: string) {
  const existing = await all<{ id: string; pageId: string }>(
    `SELECT s.id, p.id AS "pageId"
       FROM "Store" s JOIN "Page" p ON p."storeId" = s.id
      WHERE s."organizationId" = $1 LIMIT 1`,
    [organizationId]
  )
  if (existing[0]) {
    return { storeId: existing[0].id, pageId: existing[0].pageId }
  }

  // The order route refuses a workspace with no settings row and a page that is
  // not published, so both are part of "a storefront that can take an order".
  await db.query(
    `INSERT INTO "OrganizationSettings" (id, "organizationId", "currencyCode", "updatedAt")
     VALUES ($1, $2, 'USD', now())
     ON CONFLICT ("organizationId") DO NOTHING`,
    [id('set'), organizationId]
  )

  const storeId = id('str')
  await db.query(
    `INSERT INTO "Store" (id, "organizationId", name, subdomain, "updatedAt")
     VALUES ($1, $2, 'Offer Test Shop', $3, now())`,
    [storeId, organizationId, `offer-test-${Date.now().toString(36)}`]
  )

  const pageId = id('pg')
  await db.query(
    `INSERT INTO "Page" (id, "storeId", slug, title, status, "previewToken", "updatedAt")
     VALUES ($1, $2, 'landing', 'Landing', 'PUBLISHED', $3, now())`,
    [pageId, storeId, id('tok')]
  )

  return { storeId, pageId }
}

/**
 * A product with several sizes, on the fake shop, so per-size behaviour is
 * reachable.
 *
 * Synchronous and SQL-free: the catalogue lives on the merchant's website, and
 * the ids returned here are that shop's own — which is exactly what an offer
 * stores and what the storefront asks for by on every render.
 */
function seedProduct(title: string, prices: number[], available = 50) {
  const productId = id('prod')

  // Every seeded product carries a picture, so that any order placed in this
  // file can be asked whether it kept one. See the assertion below.
  const imageUrl = `https://cdn.example.test/${productId}.jpg`

  const variants = prices.map((priceCents, index) => ({
    id: id('var'),
    priceCents,
    title:
      prices.length === 1
        ? 'Default Title'
        : (['S', 'M', 'L'][index] ?? `V${index}`),
    sku: `${title.replace(/\s+/g, '')}-${index}-${Date.now().toString(36)}`,
    available,
  }))

  shop.add({ id: productId, title, imageUrl, variants })

  return { id: productId, title, imageUrl, variants }
}

/** The offer rows a save actually produced, which is the only real assertion. */
async function offerByLabel(organizationId: string, label: string) {
  const offer = await one<{
    id: string
    kind: string
    tierMode: string
    pricingMode: string
    priceCents: number
    minQuantity: number
    maxQuantity: number
  }>(
    `SELECT id, kind, "tierMode", "pricingMode", "priceCents",
            "minQuantity", "maxQuantity"
       FROM "Offer" WHERE "organizationId" = $1 AND label = $2`,
    [organizationId, label]
  )
  const tiers = await all<{
    quantity: number
    reward: string
    priceCents: number
  }>(
    `SELECT quantity, reward, "priceCents" FROM "OfferTier"
      WHERE "offerId" = $1 ORDER BY quantity`,
    [offer.id]
  )
  const items = await all<{ productId: string; quantity: number }>(
    `SELECT "productId", quantity FROM "OfferItem"
      WHERE "offerId" = $1 ORDER BY position`,
    [offer.id]
  )
  return { ...offer, tiers, items }
}

test('a mix & match rung takes an item count — on a phone as well as a desktop', async ({
  page,
}) => {
  await seedStorefront(organizationId)
  const shirt = seedProduct(`Shirt ${Date.now()}`, [50_000])
  const label = `Ladder ${Date.now()}`

  // The reported regression is a mobile one, so the whole flow runs at a phone
  // size. A desktop-only test passes against the broken layout.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/discounts/offers/new')

  await page.getByLabel('Name').first().fill(label)
  await page.getByLabel('Offer type').click()
  await page.getByRole('option', { name: /Mix & match/ }).click()

  // Workspace scope keeps this test about the ladder: a page-scoped offer would
  // additionally be testing the scope picker, which the storefront test covers.
  await page.locator('#offer-scope').click()
  await page
    .getByRole('option', { name: 'Every store in this workspace' })
    .click()

  await page.getByRole('button', { name: 'Add a product' }).click()
  await page.getByText(shirt.title).first().click()

  await page.getByRole('button', { name: 'Add a quantity' }).click()

  const quantity = page.getByLabel('Quantity').first()
  await expect(quantity).toBeVisible()

  // The bug, stated as an assertion: a box this narrow cannot be typed into.
  // 30px minus 28px of horizontal padding left 2px of typing area.
  const box = await quantity.boundingBox()
  expect(box, 'the rung quantity input must be laid out').not.toBeNull()
  expect(
    box!.width,
    `rung quantity box was ${box!.width}px wide at a 390px viewport`
  ).toBeGreaterThan(60)

  await quantity.fill('3')
  await expect(quantity).toHaveValue('3')

  await page.getByLabel('Price', { exact: true }).fill('1200')

  await page.getByRole('button', { name: /^(Create|Save) offer$/ }).click()

  // A refused save stays on /new with the reason on screen. Reading it out
  // beats a bare timeout when this test breaks in six months.
  await page
    .waitForURL(/\/discounts\/offers\/(?!new$)[a-z0-9]+$/, { timeout: 30_000 })
    .catch(async () => {
      throw new Error(
        `Offer was not created. Form said: ${await page.locator('body').innerText()}`
      )
    })

  const saved = await offerByLabel(organizationId, label)
  expect(saved.kind).toBe('COLLECTION')
  expect(saved.tiers).toHaveLength(1)
  expect(num(saved.tiers[0].quantity)).toBe(3)
  expect(num(saved.tiers[0].priceCents)).toBe(120_000)
  expect(saved.items).toHaveLength(1)
})

test('a fixed set keeps the per-product item count it was given', async ({
  page,
}) => {
  await seedStorefront(organizationId)
  const combo = seedProduct(`Combo ${Date.now()}`, [30_000])
  const label = `Fixed ${Date.now()}`

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/discounts/offers/new')

  await page.getByLabel('Name').first().fill(label)
  await page.locator('#offer-scope').click()
  await page
    .getByRole('option', { name: 'Every store in this workspace' })
    .click()

  await page.getByRole('button', { name: 'Add a product' }).click()
  await page.getByText(combo.title).first().click()

  // A fixed set is the one kind where the buyer does not choose how many, so
  // this is the only place an item count is typed per product.
  const quantity = page.getByLabel('Quantity').first()
  const box = await quantity.boundingBox()
  expect(
    box!.width,
    'the item-count box must be usable on a phone'
  ).toBeGreaterThan(40)
  await quantity.fill('3')

  await page.getByLabel('Pricing').click()
  await page
    .getByRole('option', { name: 'One price for the whole set' })
    .click()
  await page.getByLabel('Set price').fill('750')

  await page.getByRole('button', { name: /^(Create|Save) offer$/ }).click()
  await page
    .waitForURL(/\/discounts\/offers\/(?!new$)[a-z0-9]+$/, { timeout: 30_000 })
    .catch(async () => {
      throw new Error(
        `Offer was not created. Form said: ${await page.locator('body').innerText()}`
      )
    })

  const saved = await offerByLabel(organizationId, label)
  expect(saved.kind).toBe('FIXED')
  expect(saved.pricingMode).toBe('FIXED')
  expect(num(saved.priceCents)).toBe(75_000)
  expect(saved.items).toHaveLength(1)
  expect(num(saved.items[0].quantity)).toBe(3)
})

test('an à la carte pool saves its own item bounds', async ({ page }) => {
  await seedStorefront(organizationId)
  const pick = seedProduct(`Pick ${Date.now()}`, [20_000, 25_000])
  const label = `Alacarte ${Date.now()}`

  await page.goto('/discounts/offers/new')
  await page.getByLabel('Name').first().fill(label)
  await page.locator('#offer-scope').click()
  await page
    .getByRole('option', { name: 'Every store in this workspace' })
    .click()
  await page.getByLabel('Offer type').click()
  await page.getByRole('option', { name: /la carte/ }).click()

  // Unlike a ladder, an à la carte pool is bounded by exactly these two numbers
  // — `quantityBounds` reads both — so they must be editable and must persist.
  await page.getByLabel('Minimum items').fill('2')
  await page.getByLabel('Maximum items').fill('5')

  await page.getByRole('button', { name: 'Add a product' }).click()
  await page.getByText(pick.title).first().click()

  await page.getByLabel('Pricing').click()
  await page.getByRole('option', { name: 'Percentage off' }).click()
  await page.getByLabel('Discount %').fill('15')

  await page.getByRole('button', { name: /^(Create|Save) offer$/ }).click()
  await page
    .waitForURL(/\/discounts\/offers\/(?!new$)[a-z0-9]+$/, { timeout: 30_000 })
    .catch(async () => {
      throw new Error(
        `Offer was not created. Form said: ${await page.locator('body').innerText()}`
      )
    })

  const saved = await offerByLabel(organizationId, label)
  expect(saved.kind).toBe('ALACARTE')
  expect(saved.pricingMode).toBe('PERCENT')
  expect(num(saved.minQuantity)).toBe(2)
  expect(num(saved.maxQuantity)).toBe(5)
})

test('reopening a ladder shows the rungs that were saved', async ({ page }) => {
  await seedStorefront(organizationId)
  const tee = seedProduct(`Tee ${Date.now()}`, [40_000])
  const label = `Roundtrip ${Date.now()}`

  await page.goto('/discounts/offers/new')
  await page.getByLabel('Name').first().fill(label)
  await page.locator('#offer-scope').click()
  await page
    .getByRole('option', { name: 'Every store in this workspace' })
    .click()
  await page.getByLabel('Offer type').click()
  await page.getByRole('option', { name: /Mix & match/ }).click()
  await page.getByRole('button', { name: 'Add a product' }).click()
  await page.getByText(tee.title).first().click()

  // Two rungs, so the ordering and the per-rung reward both have to survive.
  await page.getByRole('button', { name: 'Add a quantity' }).click()
  await page.getByLabel('Quantity').nth(0).fill('2')
  await page.getByLabel('Price', { exact: true }).nth(0).fill('700')

  await page.getByRole('button', { name: 'Add a quantity' }).click()
  await page.getByLabel('Quantity').nth(1).fill('5')
  await page.getByLabel('Rung type').nth(1).click()
  await page.getByRole('option', { name: 'get % off' }).click()
  await page.getByLabel('Percentage off').fill('20')

  await page.getByRole('button', { name: /^(Create|Save) offer$/ }).click()
  await page
    .waitForURL(/\/discounts\/offers\/(?!new$)[a-z0-9]+$/, { timeout: 30_000 })
    .catch(async () => {
      throw new Error(
        `Offer was not created. Form said: ${await page.locator('body').innerText()}`
      )
    })

  const saved = await offerByLabel(organizationId, label)
  expect(saved.tiers.map((t) => num(t.quantity))).toEqual([2, 5])
  expect(saved.tiers[0].reward).toBe('PRICE')
  expect(num(saved.tiers[0].priceCents)).toBe(70_000)
  expect(saved.tiers[1].reward).toBe('PERCENT')

  // The editor is reloaded from the row, so what a merchant sees the second
  // time is the real test of the round trip.
  await page.reload()
  await expect(page.getByLabel('Quantity').nth(0)).toHaveValue('2')
  await expect(page.getByLabel('Quantity').nth(1)).toHaveValue('5')
  await expect(page.getByLabel('Price', { exact: true }).nth(0)).toHaveValue(
    '700.00'
  )
})

/**
 * A catalogue bigger than one page, which is every real one.
 *
 * The picker used to render the page the server sent it and stop, so a shop of
 * six hundred products could only put its first sixty into an offer — and the
 * merchant, who can see the rest on their own website, concludes the product is
 * missing. The bulk products are removed again at the end because the shop is
 * shared with every other test in this file, and each of those picks a product
 * by clicking its title in an unpaged list.
 */
test('the picker reaches a product past its first page, and can offer it', async ({
  page,
}) => {
  await seedStorefront(organizationId)

  const stamp = Date.now().toString(36)
  const bulk = Array.from({ length: 150 }, (_, index) =>
    seedProduct(`Bulk ${stamp} ${String(index).padStart(3, '0')}`, [
      10_000 + index,
    ])
  )
  const last = bulk[bulk.length - 1]
  const label = `Deep pick ${Date.now()}`

  try {
    await page.goto('/discounts/offers/new')
    await page.getByLabel('Name').first().fill(label)
    await page.locator('#offer-scope').click()
    await page
      .getByRole('option', { name: 'Every store in this workspace' })
      .click()

    await page.getByRole('button', { name: 'Add a product' }).click()
    const dialog = page.getByRole('dialog')
    const target = dialog.getByText(last.title, { exact: true })

    // The first page is a page, not the catalogue: the product at the far end
    // of it is not on screen yet.
    await expect(dialog.getByText(bulk[0].title)).toBeVisible()
    await expect(target).toHaveCount(0)

    // The photo has to be big enough to tell two similar products apart, which
    // a 40px square is not.
    const thumb = await dialog.locator('img').first().boundingBox()
    expect(thumb, 'a product row must render its photo').not.toBeNull()
    expect(thumb!.width).toBeGreaterThanOrEqual(56)

    // Hovering one shows it at a size a person can actually look at.
    await dialog.locator('img').first().hover()
    await expect(page.locator('[data-slot="product-preview"]')).toBeVisible()

    // Scrolling the list fetches the next page, and the next, until the
    // catalogue runs out.
    const list = dialog.locator('.overflow-y-auto').first()
    for (let round = 0; round < 25 && (await target.count()) === 0; round++) {
      await list.evaluate((node) => node.scrollTo(0, node.scrollHeight))
      await page.waitForTimeout(400)
    }

    await expect(target).toBeVisible()
    await target.click()

    // Chosen from page three, it still has to resolve to a name and a price
    // rather than to "Unknown product".
    await expect(page.getByText(last.title).first()).toBeVisible()
    await expect(page.getByText('Unknown product')).toHaveCount(0)

    await page.getByRole('button', { name: /^(Create|Save) offer$/ }).click()
    await page
      .waitForURL(/\/discounts\/offers\/(?!new$)[a-z0-9]+$/, {
        timeout: 30_000,
      })
      .catch(async () => {
        throw new Error(
          `Offer was not created. Form said: ${await page.locator('body').innerText()}`
        )
      })

    const saved = await offerByLabel(organizationId, label)
    expect(saved.items.map((item) => item.productId)).toEqual([last.id])
  } finally {
    for (const product of bulk) shop.products.delete(product.id)
  }
})

/**
 * The same catalogue, in the discount editor, which had no photos at all: it
 * listed products as a column of ticked titles, and every product past the
 * first page was simply absent.
 */
test('a discount can be aimed at a product past the first page', async ({
  page,
}) => {
  const stamp = Date.now().toString(36)
  const bulk = Array.from({ length: 120 }, (_, index) =>
    seedProduct(`Scope ${stamp} ${String(index).padStart(3, '0')}`, [
      20_000 + index,
    ])
  )
  const last = bulk[bulk.length - 1]
  const title = `Scoped discount ${Date.now()}`

  try {
    await page.goto('/discounts/new')
    await page.getByLabel('Internal title').fill(title)
    await page.getByLabel('Percentage off').first().fill('10')

    await page.getByLabel('Applies to').click()
    await page.getByRole('option', { name: 'Specific products' }).click()

    // Search rather than scroll, because a merchant with a catalogue this size
    // types the name — and the search has to reach the whole of it too.
    const search = page.getByLabel('Search products').first()
    await search.fill(last.title)

    const row = page.getByText(last.title, { exact: true }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.click()

    await page.getByRole('button', { name: 'Add code' }).click()

    await page.getByRole('button', { name: /^(Create|Save) discount$/ }).click()
    await page
      .waitForURL(/\/discounts\/(?!new$)[a-z0-9]+$/, { timeout: 30_000 })
      .catch(async () => {
        throw new Error(
          `Discount was not created. Form said: ${await page.locator('body').innerText()}`
        )
      })

    const saved = await one<{ targetProductIds: string[] }>(
      `SELECT "targetProductIds"
         FROM "Discount" WHERE "organizationId" = $1 AND title = $2`,
      [organizationId, title]
    )
    expect(saved.targetProductIds).toEqual([last.id])

    // Reopening it must show the product it targets, not a bare id: the
    // picker holds one page and this one is nowhere near it.
    await page.reload()
    await expect(page.getByText(last.title).first()).toBeVisible()
  } finally {
    for (const product of bulk) shop.products.delete(product.id)
  }
})

/**
 * Size-level targeting, which is a picker of its own.
 *
 * Sizes used to be one flat list of every variant in the catalogue — a
 * thousand rows on a real shop, and only ever the ones belonging to the
 * products on the first page. They are chosen inside their product now, which
 * is also the only way that list can be paged.
 */
test('a discount can be aimed at one size of a product', async ({ page }) => {
  const shirt = seedProduct(`Sized ${Date.now()}`, [30_000, 40_000, 50_000])
  const title = `Size discount ${Date.now()}`
  const medium = shirt.variants[1]

  await page.goto('/discounts/new')
  await page.getByLabel('Internal title').fill(title)
  await page.getByLabel('Percentage off').first().fill('25')

  await page.getByLabel('Applies to').click()
  await page.getByRole('option', { name: 'Specific sizes' }).click()

  await page.getByLabel('Search products').first().fill(shirt.title)
  const row = page.getByText(shirt.title, { exact: true }).first()
  await expect(row).toBeVisible({ timeout: 15_000 })

  // The product opens to its sizes rather than being ticked itself.
  await row.click()
  // Anchored on the size's own name: a SKU is random text and matching it
  // loosely picks whichever row happens to contain the letter.
  const size = page
    .locator('label')
    .filter({ hasText: new RegExp(`^${medium.title}\\s*·`) })
    .first()
  await expect(size).toBeVisible()
  await size.click()

  await page.getByRole('button', { name: 'Add code' }).click()
  await page.getByRole('button', { name: /^(Create|Save) discount$/ }).click()
  await page
    .waitForURL(/\/discounts\/(?!new$)[a-z0-9]+$/, { timeout: 30_000 })
    .catch(async () => {
      throw new Error(
        `Discount was not created. Form said: ${await page.locator('body').innerText()}`
      )
    })

  const saved = await one<{ targetVariantIds: string[] }>(
    `SELECT "targetVariantIds"
       FROM "Discount" WHERE "organizationId" = $1 AND title = $2`,
    [organizationId, title]
  )
  expect(saved.targetVariantIds).toEqual([medium.id])

  // And it reads back as a size with a name, not as a stored id.
  await page.reload()
  await expect(
    page.getByText(`${shirt.title} · ${medium.title}`).first()
  ).toBeVisible()
})

test('a code discount saves its rule and its code', async ({ page }) => {
  const title = `Code discount ${Date.now()}`
  const code = `SAVE${Date.now().toString().slice(-6)}`

  await page.goto('/discounts/new')
  await page.getByLabel('Internal title').fill(title)
  await page.getByLabel('Percentage off').first().fill('15')

  // A new discount starts with no codes; "Add code" seeds a random one, which
  // is then typed over.
  await page.getByRole('button', { name: 'Add code' }).click()
  const codeField = page.locator('input.font-mono').first()
  await expect(codeField).toBeVisible()
  await codeField.fill(code)

  await page.getByRole('button', { name: /^(Create|Save) discount$/ }).click()
  await page
    .waitForURL(/\/discounts\/(?!new$)[a-z0-9]+$/, { timeout: 30_000 })
    .catch(async () => {
      throw new Error(
        `Discount was not created. Form said: ${await page.locator('body').innerText()}`
      )
    })

  const saved = await one<{
    id: string
    type: string
    method: string
    valueBps: number
    isActive: boolean
  }>(
    `SELECT id, type, method, "valueBps", "isActive"
       FROM "Discount" WHERE "organizationId" = $1 AND title = $2`,
    [organizationId, title]
  )
  expect(saved.type).toBe('PERCENTAGE')
  expect(saved.method).toBe('CODE')
  expect(num(saved.valueBps)).toBe(1500)

  const codes = await all<{ code: string }>(
    `SELECT code FROM "DiscountCode" WHERE "discountId" = $1`,
    [saved.id]
  )
  expect(codes.map((row) => row.code)).toContain(code.toUpperCase())
})

test('the discount editor does not offer a method nothing honours', async ({
  page,
}) => {
  await page.goto('/discounts/new')

  // "Applied automatically" is reachable in the data model but no pricing path
  // resolves it: every one of them finds a discount by its typed code. Offering
  // it made a campaign that saved, listed as Active, and took nothing off any
  // order — so the option must not be selectable.
  await page.getByLabel('How it applies').click()
  const automatic = page.getByRole('option', { name: /Applied automatically/ })
  await expect(automatic).toBeVisible()
  await expect(automatic).toBeDisabled()
})

/**
 * The order route allows five orders per IP per minute, which a test that
 * places several in a row trips immediately. Clearing the limiter's own keys is
 * setup, the same as writing the catalogue rows directly — the limiter is not
 * what these tests are about, and waiting out a fixed window would add minutes.
 */
async function resetOrderRateLimit() {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')
  const keys = await redis.keys('ratelimit:offer-order:*')
  if (keys.length > 0) await redis.del(...keys)
  await redis.quit()
}

/**
 * The public order route, which is the only thing that decides what a buyer is
 * charged. Reached on the store's own hostname because the route takes store
 * identity from the host and refuses a body that disagrees.
 */
async function placeOrder(
  request: import('@playwright/test').APIRequestContext,
  subdomain: string,
  body: Record<string, unknown>
) {
  await resetOrderRateLimit()
  const response = await request.post(
    `http://${subdomain}.localhost:3001/api/storefront/orders`,
    {
      data: {
        name: 'Test Buyer',
        phone: '01700000000',
        address: '12 Test Road',
        city: 'Dhaka',
        countryCode: 'BD',
        ...body,
      },
      failOnStatusCode: false,
    }
  )
  return { status: response.status(), body: await response.json() }
}

test('a mix & match ladder charges the rung, and refuses a count it never priced', async ({
  page,
  request,
}) => {
  const { storeId, pageId } = await seedStorefront(organizationId)
  const store = await one<{ subdomain: string }>(
    `SELECT subdomain FROM "Store" WHERE id = $1`,
    [storeId]
  )
  const shirt = seedProduct(`Ladder shirt ${Date.now()}`, [50_000])
  const label = `Sold ladder ${Date.now()}`

  // Built through the editor, so what the buyer is charged is charged from a
  // row a merchant actually typed rather than one this test invented.
  await page.goto('/discounts/offers/new')
  await page.getByLabel('Name').first().fill(label)
  // By id: getByLabel('Page') also matches the "…per page can hold it" switch.
  await page.locator('#offer-page').click()
  await page.getByRole('option', { name: 'Landing' }).click()
  await page.getByLabel('Offer type').click()
  await page.getByRole('option', { name: /Mix & match/ }).click()
  await page.getByLabel('Quantities between rungs').click()
  await page
    .getByRole('option', { name: 'Only these exact quantities can be sold' })
    .click()
  await page.getByRole('button', { name: 'Add a product' }).click()
  await page.getByText(shirt.title).first().click()
  // Two rungs with a gap between them. With a single rung the ladder's top *is*
  // the maximum, so an over-count is caught by the bounds check and the gap in
  // the ladder is never exercised.
  await page.getByRole('button', { name: 'Add a quantity' }).click()
  await page.getByLabel('Quantity').nth(0).fill('2')
  await page.getByLabel('Price', { exact: true }).nth(0).fill('800')
  await page.getByRole('button', { name: 'Add a quantity' }).click()
  await page.getByLabel('Quantity').nth(1).fill('5')
  await page.getByLabel('Price', { exact: true }).nth(1).fill('1800')
  await page.getByRole('button', { name: /^(Create|Save) offer$/ }).click()
  await page
    .waitForURL(/\/discounts\/offers\/(?!new$)[a-z0-9]+$/, { timeout: 30_000 })
    .catch(async () => {
      throw new Error(
        `Offer was not created. Form said: ${await page.locator('body').innerText()}`
      )
    })

  const saved = await offerByLabel(organizationId, label)
  expect(saved.tierMode).toBe('EXACT')
  const key = (
    await one<{ key: string }>(`SELECT key FROM "Offer" WHERE id = $1`, [
      saved.id,
    ])
  ).key

  const selection = (quantity: number) => [
    { productId: shirt.id, variantId: shirt.variants[0].id, quantity },
  ]

  await test.step('two pieces are charged the rung, not two list prices', async () => {
    const result = await placeOrder(request, store.subdomain, {
      storeId,
      pageId,
      offerKey: key,
      selections: selection(2),
    })
    expect(result.status, JSON.stringify(result.body)).toBe(200)
    // The rung is 800; two shirts at list would have been 1000.
    expect(result.body.totalCents).toBe(80_000)
    expect(result.body.quantity).toBe(2)

    // The picture is copied onto the line at the moment of sale, like the
    // title and the price. Three screens identify the goods by it and nothing
    // else — the order page, the packing label, the buyer's tracking page —
    // and when checkout quietly stopped copying it every one of them rendered
    // an empty box, on live orders, without a single error to find it by.
    const sold = await all<{ imageUrl: string | null }>(
      `SELECT l."imageUrl"
         FROM "OrderLine" l
         JOIN "Order" o ON o.id = l."orderId"
        WHERE o."organizationId" = $1 AND o."orderNumber" = $2`,
      [organizationId, result.body.orderNumber]
    )
    expect(sold.length).toBeGreaterThan(0)
    expect(sold.map((line) => line.imageUrl)).toEqual(
      sold.map(() => shirt.imageUrl)
    )
  })

  await test.step('the top rung is charged too', async () => {
    const result = await placeOrder(request, store.subdomain, {
      storeId,
      pageId,
      offerKey: key,
      selections: selection(5),
    })
    expect(result.status, JSON.stringify(result.body)).toBe(200)
    expect(result.body.totalCents).toBe(180_000)
  })

  await test.step('a count between the rungs is refused, and the refusal names what is sold', async () => {
    const result = await placeOrder(request, store.subdomain, {
      storeId,
      pageId,
      offerKey: key,
      selections: selection(3),
    })
    expect(result.status).toBe(400)
    // The old message was "No price is set for that many items", which left the
    // buyer with nothing to do about it. This is inside `quantityBounds`, so
    // nothing else refuses it first — the ladder's own gap is the reason.
    expect(result.body.error).toContain('sets of 2 or 5')
    expect(result.body.error).toContain('you have 3')
  })
})

test('a code discount comes off a real order, and a wrong code does not', async ({
  page,
  request,
}) => {
  const { storeId, pageId } = await seedStorefront(organizationId)
  const store = await one<{ subdomain: string }>(
    `SELECT subdomain FROM "Store" WHERE id = $1`,
    [storeId]
  )
  const item = seedProduct(`Coded ${Date.now()}`, [40_000])
  const label = `Coded offer ${Date.now()}`
  const code = `TEN${Date.now().toString().slice(-6)}`

  await page.goto('/discounts/new')
  await page.getByLabel('Internal title').fill(`Ten off ${Date.now()}`)
  await page.getByLabel('Percentage off').first().fill('10')
  await page.getByRole('button', { name: 'Add code' }).click()
  await page.locator('input.font-mono').first().fill(code)
  await page.getByRole('button', { name: /^(Create|Save) discount$/ }).click()
  await page.waitForURL(/\/discounts\/(?!new$)[a-z0-9]+$/, { timeout: 30_000 })

  await page.goto('/discounts/offers/new')
  await page.getByLabel('Name').first().fill(label)
  // By id: getByLabel('Page') also matches the "…per page can hold it" switch.
  await page.locator('#offer-page').click()
  await page.getByRole('option', { name: 'Landing' }).click()
  await page.getByRole('button', { name: 'Add a product' }).click()
  await page.getByText(item.title).first().click()
  await page.getByRole('button', { name: /^(Create|Save) offer$/ }).click()
  await page
    .waitForURL(/\/discounts\/offers\/(?!new$)[a-z0-9]+$/, { timeout: 30_000 })
    .catch(async () => {
      throw new Error(
        `Offer was not created. Form said: ${await page.locator('body').innerText()}`
      )
    })

  const saved = await offerByLabel(organizationId, label)
  const key = (
    await one<{ key: string }>(`SELECT key FROM "Offer" WHERE id = $1`, [
      saved.id,
    ])
  ).key
  const selections = [
    { productId: item.id, variantId: item.variants[0].id, quantity: 1 },
  ]

  await test.step('without a code the buyer pays list', async () => {
    const result = await placeOrder(request, store.subdomain, {
      storeId,
      pageId,
      offerKey: key,
      selections,
    })
    expect(result.status, JSON.stringify(result.body)).toBe(200)
    expect(result.body.totalCents).toBe(40_000)
  })

  await test.step('the code takes its ten percent off', async () => {
    const result = await placeOrder(request, store.subdomain, {
      storeId,
      pageId,
      offerKey: key,
      selections,
      discountCode: code,
    })
    expect(result.status, JSON.stringify(result.body)).toBe(200)
    expect(result.body.totalCents).toBe(36_000)
  })

  await test.step('a code that does not exist is ignored, not honoured', async () => {
    const result = await placeOrder(request, store.subdomain, {
      storeId,
      pageId,
      offerKey: key,
      selections,
      discountCode: 'NOPE-NOT-A-CODE',
    })
    expect(result.status, JSON.stringify(result.body)).toBe(200)
    expect(result.body.totalCents).toBe(40_000)
  })
})
