import { test, expect } from '@playwright/test'
import { Client } from 'pg'

/**
 * A new workspace has no package until it chooses one; choosing one with a
 * trial needs no payment; and a trial that ends unpaid locks the dashboard to
 * Billing and takes the site offline — without deleting anything.
 *
 * The clock is moved by editing the trial's end in the database and running
 * the real billing sweep (`/api/cron/billing-cycle`). Paying, and everything
 * coming back, is covered by `pnpm check:billing-cycle`, since a payment needs
 * Enfinito Pay or an admin.
 *
 * Needs DATABASE_URL and CRON_SECRET in the environment (source .env.local).
 */
test('trial: choose a package, build, let the trial lapse, get locked', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const stamp = Date.now()
  const email = `trial-${stamp}@example.com`
  const storeName = `Trial Store ${stamp}`
  const subdomain = `trial-store-${stamp}`

  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()

  try {
    await test.step('register: no package yet, so the dashboard asks for one', async () => {
      await page.goto('/register')
      await page.getByLabel('Name').fill('Trial Owner')
      await page.getByLabel('Email').fill(email)
      await page.getByLabel('Password').fill('Sup3rSecure!Passw0rd')
      await page.getByRole('button', { name: 'Create account' }).click()
      await page.waitForURL(/\/(dashboard|verify-email)/, { timeout: 30_000 })
      await db.query(
        `UPDATE "User" SET "emailVerified" = now() WHERE email = $1`,
        [email]
      )
      await page.goto('/dashboard')
      await expect(
        page.getByRole('heading', { name: 'Choose a package to get started' })
      ).toBeVisible()
    })

    await test.step('start Starter on its free trial, no payment', async () => {
      await page.getByText('See packages').first().click()
      await expect(page).toHaveURL(/\/billing\/plans/)
      await page
        .getByRole('heading', { name: 'Starter', exact: true, level: 3 })
        .click()
      await expect(page.getByText('Try Starter free for 7 days')).toBeVisible()
      await page.getByRole('button', { name: 'Start free trial' }).click()
      await expect(page).toHaveURL(/\/billing\?trial=started/)
      await expect(
        page.getByText(/Free trial of Starter — 7 days left/)
      ).toBeVisible()
    })

    await test.step('build and publish a store during the trial', async () => {
      await page.goto('/stores/new')
      await page.getByRole('button', { name: /Online store/ }).click()
      await page
        .getByRole('button', { name: 'Use this design' })
        .first()
        .click()
      await page.getByLabel('Store name').fill(storeName)
      await page
        .getByRole('button', { name: /Create and start editing/ })
        .click()
      await expect(page).toHaveURL(/\/pages\/[a-z0-9]+\/edit$/)
      await page.getByRole('button', { name: /^Publish/ }).click()
      await page.getByRole('button', { name: 'Publish anyway' }).click()
      await expect(
        page.getByRole('button', { name: 'Published' })
      ).toBeVisible()

      const base = new URL(page.url())
      await page.goto(`${base.protocol}//${subdomain}.${base.host}/`)
      await expect(
        page.getByText('This site is temporarily unavailable')
      ).toHaveCount(0)
    })

    await test.step('the trial ends unpaid and the grace day passes', async () => {
      // Ended 30 hours ago: past the 24-hour grace.
      await db.query(
        `UPDATE "Subscription" s
            SET "trialEndsAt" = now() - interval '30 hours',
                "currentPeriodEnd" = now() - interval '30 hours'
           FROM "Membership" m JOIN "User" u ON u.id = m."userId"
          WHERE m."organizationId" = s."organizationId" AND u.email = $1`,
        [email]
      )
      const sweep = await page.request.get('/api/cron/billing-cycle', {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      })
      expect(sweep.ok()).toBe(true)
      const result = await sweep.json()
      expect(result.billsRaised).toBeGreaterThanOrEqual(1)
      expect(result.restricted).toBeGreaterThanOrEqual(1)
    })

    await test.step('the dashboard is locked to Billing', async () => {
      await page.goto('/dashboard')
      await expect(
        page.getByRole('heading', { name: 'Your free trial has ended' })
      ).toBeVisible()
      await page.goto('/products')
      await expect(
        page.getByRole('heading', { name: 'Your free trial has ended' })
      ).toBeVisible()
      await page.goto('/billing')
      await expect(
        page
          .getByText('Your free trial has ended — the workspace is paused')
          .first()
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: /Pay .*399.* and restore/ })
      ).toBeVisible()
    })

    await test.step('the site is offline, but nothing was unpublished', async () => {
      const base = new URL(page.url())
      await page.goto(`${base.protocol}//${subdomain}.${base.host}/`)
      await expect(
        page.getByText('This site is temporarily unavailable')
      ).toBeVisible()
      const { rows } = await db.query(
        `SELECT count(*)::int AS live FROM "Page" p JOIN "Store" s ON s.id = p."storeId"
          WHERE s.subdomain = $1 AND p.status = 'PUBLISHED'`,
        [subdomain]
      )
      expect(rows[0].live).toBeGreaterThan(0)
    })
  } finally {
    await db.end()
  }
})
