import { test, expect } from '@playwright/test'

/**
 * The path the product exists for: a new merchant registers, makes an online
 * store from a template, sees it in the builder, publishes it, and finds it
 * live on its own subdomain.
 *
 * Needs nothing seeded. Templates are code (modules/templates), so the design
 * the merchant picks and the headline asserted below come from the same file,
 * and a store with no products yet still publishes — its grids simply wait.
 */
test('register, make a store from a template, publish, view live', async ({
  page,
}) => {
  const stamp = Date.now()
  const email = `e2e-${stamp}@example.com`
  const storeName = `E2E Store ${stamp}`
  const headline = 'Everything you need, all in one place'

  await test.step('register', async () => {
    await page.goto('/register')
    await page.getByLabel('Name').fill('E2E Test User')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('Sup3rSecure!Passw0rd')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
  })

  await test.step('make an online store from the Essentials design', async () => {
    await page.goto('/stores/new')
    await page.getByRole('button', { name: /Online store/ }).click()
    await expect(page.getByText('Essentials')).toBeVisible()
    await page.getByRole('button', { name: 'Use this design' }).first().click()
    await page.getByLabel('Store name').fill(storeName)
    await page.getByRole('button', { name: /Create and start editing/ }).click()
    await expect(page).toHaveURL(/\/pages\/[a-z0-9]+\/edit$/)
  })

  await test.step('the builder shows the template, header and all', async () => {
    const canvas = page.frameLocator('iframe[title="Page canvas"]')
    await expect(canvas.getByText(headline)).toBeVisible()
    await expect(canvas.getByText(storeName).first()).toBeVisible()
    await expect(page.getByText('Top of every page')).toBeVisible()
  })

  await test.step('publish, past the check for unfinished parts', async () => {
    await page.getByRole('button', { name: /^Publish/ }).click()
    // The template's reviews are examples, and Publish says so first. A
    // merchant may know better, so the way on is one click.
    await expect(
      page.getByRole('heading', { name: 'Before you publish' })
    ).toBeVisible()
    await expect(
      page.getByText('The example review is still showing')
    ).toBeVisible()
    await page.getByRole('button', { name: 'Publish anyway' }).click()
    await expect(page.getByRole('button', { name: 'Published' })).toBeVisible()
  })

  await test.step('view the store on its own subdomain', async () => {
    const base = new URL(page.url())
    const subdomain = `e2e-store-${stamp}`
    await page.goto(`${base.protocol}//${subdomain}.${base.host}/`)
    await expect(page.getByText(headline)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Shop' }).first()).toBeVisible()
  })
})
