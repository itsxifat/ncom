import { test, expect, type Page } from '@playwright/test'

/**
 * A design from the merchant's own AI reaches inside every block — each
 * element's own design, elements added to a block, and the site's theme with
 * its custom CSS — not only the section around them.
 *
 * Drives "Use your own AI" in the builder with an answer written the way chat
 * models write one, CSS habits included, and reads the result off the canvas
 * as computed styles: once as applied, once after Undo, and once after a
 * reload, from what was saved.
 */

const ANSWER = {
  format: 'ncom/page@1',
  title: 'Honey',
  theme: {
    primaryColor: '#d97706',
    customCss: '.night{--lp-text:#f8fafc;--page-text:#f8fafc}',
  },
  sections: [
    {
      type: 'hero',
      content: {
        title: 'Pure Sundarbans honey',
        subtitle: 'Straight from the hive.',
      },
      style: {
        backgroundVariant: 'custom',
        backgroundColor: '#0b1120',
        customClassName: 'night',
      },
      elements: {
        title: {
          'font-size': '3.5rem',
          fontWeight: 'extrabold',
          color: 'white',
          mobile: { fontSize: 36 },
        },
        button: {
          'border-radius': '999px',
          padding: '18px 36px',
          hover: { scale: 1.05 },
          transition: 'all 200ms ease-out',
        },
      },
      extras: [
        {
          id: 'badge',
          type: 'badge',
          text: 'Fresh harvest',
          style: { backgroundColor: '#fef3c7', padding: [6, 14], order: -1 },
        },
      ],
    },
    {
      type: 'features',
      elements: {
        card: { borderRadius: 24 },
        'card#0': { backgroundColor: '#fff7ed' },
      },
    },
  ],
}

/** A whole online store, as the new-site wizard's "Use your own AI" takes one. */
const STORE_ANSWER = {
  format: 'ncom/site@1',
  name: 'Mehendi House',
  language: 'en',
  theme: {
    primaryColor: '#7c3aed',
    spacingScale: 'spacious',
    sectionSpacing: 'compact',
    bodyScale: '1.1',
    showStickyHeader: false,
    customCss: '.promo-band [data-el="title"]{letter-spacing:-1px}',
  },
  layout: {
    sections: [
      {
        type: 'header',
        content: { logoText: 'Mehendi House' },
        elements: {
          logoText: { fontSize: 28, fontWeight: 800, color: '#7c3aed' },
          menuLink: { textTransform: 'uppercase' },
        },
      },
      { type: 'footer' },
    ],
  },
  pages: [
    {
      title: 'Home',
      sections: [
        {
          type: 'slider',
          content: {
            slides: [{ title: 'Bridal mehendi', buttonText: 'Shop now' }],
          },
          style: { customClassName: 'promo-band' },
          elements: { 'title#0': { fontSize: 64 } },
        },
      ],
    },
  ],
}

function canvas(page: Page) {
  return page.frameLocator('iframe[title="Page canvas"]')
}

async function register(page: Page, email: string) {
  await page.goto('/register')
  await page.getByLabel('Name').fill('E2E AI Designer')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('Sup3rSecure!Passw0rd')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

/** A CSS custom property as the element sees it. */
function cssVar(page: Page, selector: string, name: string) {
  return () =>
    canvas(page)
      .locator(selector)
      .first()
      .evaluate(
        (el, property) =>
          getComputedStyle(el).getPropertyValue(property).trim(),
        name
      )
}

async function pasteAnswer(page: Page) {
  await page
    .getByPlaceholder('Paste your AI’s answer here')
    .fill(
      `Here is your page:\n\`\`\`json\n${JSON.stringify(ANSWER, null, 2)}\n\`\`\``
    )
  await page.getByRole('button', { name: 'Put it on my page' }).click()
  await expect(page.getByText('Your AI’s design is on the page')).toBeVisible()
}

async function expectDesigned(page: Page) {
  const title = canvas(page).locator('[data-el="title"]').first()
  await expect(title).toHaveText('Pure Sundarbans honey')
  await expect(title).toHaveCSS('font-size', '56px')
  await expect(title).toHaveCSS('font-weight', '800')
  await expect(title).toHaveCSS('color', 'rgb(255, 255, 255)')

  const button = canvas(page).locator('[data-el="button"]').first()
  await expect(button).toHaveCSS('border-top-left-radius', '999px')
  await expect(button).toHaveCSS('padding-left', '36px')

  const badge = canvas(page).locator('[data-el="x:badge"]')
  await expect(badge).toHaveText('Fresh harvest')
  await expect(badge).toHaveCSS('background-color', 'rgb(254, 243, 199)')

  const firstCard = canvas(page).locator('[data-el="card"][data-el-i="0"]')
  await expect(firstCard).toHaveCSS('border-top-left-radius', '24px')
  await expect(firstCard).toHaveCSS('background-color', 'rgb(255, 247, 237)')

  // The theme, and its custom CSS on the section's class.
  await expect
    .poll(cssVar(page, '[data-el="title"]', '--page-primary'))
    .toBe('#d97706')
  await expect
    .poll(cssVar(page, '[data-el="title"]', '--lp-text'))
    .toBe('#f8fafc')
}

test('a pasted AI design styles elements, adds elements and changes the theme', async ({
  page,
}) => {
  const stamp = Date.now()

  await test.step('register and make a landing page', async () => {
    await register(page, `e2e-ai-${stamp}@example.com`)
    await page.goto('/stores/new')
    await page.getByRole('button', { name: /Landing page/ }).click()
    await page.getByRole('button', { name: 'Use this design' }).first().click()
    await page.getByLabel('Page name').fill(`AI Honey ${stamp}`)
    await page.getByRole('button', { name: /Create and start editing/ }).click()
    await expect(page).toHaveURL(/\/pages\/[a-z0-9]+\/edit$/)
  })

  await test.step('paste a design from the merchant’s own AI', async () => {
    await page
      .getByRole('navigation', { name: 'Builder tools' })
      .getByRole('button', { name: 'AI' })
      .click()
    await pasteAnswer(page)
    await expect(
      page.getByText('The site’s theme changed too, on every page.')
    ).toBeVisible()
    await expectDesigned(page)
  })

  await test.step('Undo puts back the page and the theme', async () => {
    await page.getByRole('button', { name: 'Undo', exact: true }).last().click()
    const title = canvas(page).locator('[data-el="title"]').first()
    await expect(title).not.toHaveText('Pure Sundarbans honey')
    await expect(canvas(page).locator('[data-el="x:badge"]')).toHaveCount(0)
    await expect
      .poll(cssVar(page, '[data-el="title"]', '--page-primary'))
      .not.toBe('#d97706')
  })

  await test.step('apply again, and it is all still there after a reload', async () => {
    await pasteAnswer(page)
    await expectDesigned(page)
    await expect(page.getByText('Draft saved')).toBeVisible({ timeout: 15_000 })
    await page.reload()
    await expectDesigned(page)
  })
})

test('a whole store pasted into the new-site wizard keeps its element designs and theme', async ({
  page,
}) => {
  const stamp = Date.now()
  await register(page, `e2e-ai-store-${stamp}@example.com`)

  await test.step('paste the store and create it', async () => {
    await page.goto('/stores/new')
    await page.getByRole('button', { name: /Online store/ }).click()
    await page.getByRole('tab', { name: 'Use your own AI' }).click()
    await page
      .getByPlaceholder('{ "format": "ncom/site@1", … }')
      .fill(JSON.stringify(STORE_ANSWER))
    await page.getByRole('button', { name: 'See my design' }).click()
    await page.getByRole('button', { name: 'Use this design' }).first().click()
    await page.getByLabel('Store name').fill(`Mehendi ${stamp}`)
    await page.getByRole('button', { name: /Create and start editing/ }).click()
    await expect(page).toHaveURL(/\/pages\/[a-z0-9]+\/edit$/)
  })

  await test.step('the builder shows every element as designed', async () => {
    const shopName = canvas(page).locator('[data-el="logoText"]').first()
    await expect(shopName).toHaveCSS('font-size', '28px')
    await expect(shopName).toHaveCSS('color', 'rgb(124, 58, 237)')
    await expect(
      canvas(page).locator('[data-el="menuLink"]').first()
    ).toHaveCSS('text-transform', 'uppercase')

    const headline = canvas(page).locator('[data-el="title"][data-el-i="0"]')
    await expect(headline).toHaveText('Bridal mehendi')
    await expect(headline).toHaveCSS('font-size', '64px')
    // The theme's custom CSS, found by the section's class.
    await expect(headline).toHaveCSS('letter-spacing', '-1px')

    // The rest of the Design tab, which the theme now carries.
    await expect
      .poll(cssVar(page, '[data-el="title"]', '--page-body-scale'))
      .toBe('1.1')
    await expect
      .poll(cssVar(page, '[data-el="title"]', '--page-space-unit'))
      .toBe('1.5')
    await expect
      .poll(cssVar(page, '[data-el="title"]', '--page-section-spacing'))
      .toBe('0.75')
  })
})
