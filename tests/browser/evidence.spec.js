import { test, expect, devices } from '@playwright/test'

test('the evidence page follows the map appearance and device changes in Auto', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('./')
  await page.getByRole('combobox', { name: 'Appearance' }).selectOption('dark')
  await page.getByRole('link', { name: 'Prototype evidence' }).click()

  const report = page.getByRole('main').filter({ has: page.locator('#verification') })
  const darkSurface = 'rgb(20, 33, 27)'
  const lightSurface = 'rgb(255, 255, 255)'
  await expect(report).toHaveCSS('background-color', darkSurface)
  await expect(report).toHaveCSS('color', 'rgb(231, 242, 235)')
  await expect(report.locator('.test-result.passed').first()).toHaveCSS('color', 'rgb(163, 230, 191)')
  await expect(report.getByText('Not measured', { exact: true })).toHaveCSS('background-color', 'rgb(42, 53, 48)')

  await page.emulateMedia({ colorScheme: 'dark' })
  const map = await context.newPage()
  await map.goto('./')
  const appearance = map.getByRole('combobox', { name: 'Appearance' })
  await appearance.selectOption('light')
  await expect(report).toHaveCSS('background-color', lightSurface)
  await page.reload()
  await expect(report).toHaveCSS('background-color', lightSurface)

  await appearance.selectOption('auto')
  await expect(report).toHaveCSS('background-color', darkSurface)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(report).toHaveCSS('background-color', lightSurface)
  await page.emulateMedia({ colorScheme: 'dark', media: 'print' })
  await expect(report).toHaveCSS('background-color', lightSurface)
  await expect(report).toHaveCSS('color', 'rgb(28, 45, 36)')
})

test('the evidence page keeps desktop tables and stacks long rows on iPhone', async ({
  page, playwright, baseURL,
}, testInfo) => {
  await page.goto('./')
  const headerLogo = page.locator('.sidebar-top .brand img')
  await expect(headerLogo).toBeVisible()
  const logoUrl = await headerLogo.evaluate((img) => img.src)
  await expect(page.locator('.brand-bottom img')).toHaveJSProperty('src', logoUrl)
  await page.getByRole('link', { name: 'Prototype evidence' }).click()
  await expect(page.locator('header .brand img')).toHaveJSProperty('src', logoUrl)
  await expect(page.getByRole('heading', { name: 'OpenSeat · CEN100 prototype record' })).toBeVisible()
  const images = page.locator('#process-evidence img')
  await expect(images).toHaveCount(6)
  for (const img of await images.all()) {
    await expect.poll(() => img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0)
  }
  await expect(page.locator('#verification tbody tr').first()).toHaveCSS('display', 'table-row')

  const browser = await playwright[process.env.OPENSEAT_PHONE_ENGINE || 'webkit'].launch()
  try {
    const phone = await browser.newPage({ ...devices['iPhone 13'], baseURL })
    await phone.goto('./evidence/')
    await phone.getByRole('link', { name: 'Build plan', exact: true }).click()
    await expect(phone.getByRole('heading', { name: 'Build plan and materials' })).toBeInViewport()
    await phone.screenshot({ path: testInfo.outputPath('evidence-build-plan.png') })
    await phone.getByRole('link', { name: 'Test results' }).click()
    await expect(phone.getByRole('heading', { name: 'Verification' })).toBeInViewport()

    const rows = phone.locator('.detail-table tbody tr')
    await expect(rows.first()).toBeVisible()
    await expect(phone.locator('.test-result').filter({ hasText: 'Not measured' }).first()).toBeVisible()
    for (const width of [390, 320]) {
      await phone.setViewportSize({ width, height: 844 })
      const allStacked = await rows.evaluateAll((elements) => elements.every((row) => {
        const [title, details, evidence] = Array.from(row.cells, (cell) => cell.getBoundingClientRect())
        return title.left === details.left && details.left === evidence.left &&
          title.bottom <= details.top && details.bottom <= evidence.top
      }))
      expect(allStacked, `Evidence rows stack at ${width}px`).toBe(true)
      const resultsOnOneLine = await phone.locator('.test-result').evaluateAll((labels) =>
        labels.every((label) => {
          const range = document.createRange()
          range.selectNodeContents(label)
          return range.getClientRects().length === 1
        }),
      )
      expect(resultsOnOneLine, `Result labels fit at ${width}px`).toBe(true)
      const documentWidth = await phone.evaluate(() => document.documentElement.scrollWidth)
      expect(documentWidth, `Evidence fits at ${width}px`).toBeLessThanOrEqual(width)
    }

    await expect(phone.locator('#calibration-already-completed tbody tr').first()).toHaveCSS('display', 'table-row')
    await phone.setViewportSize({ width: 390, height: 844 })
    await phone.locator('#verification tbody tr').first().scrollIntoViewIfNeeded()
    await phone.screenshot({ path: testInfo.outputPath('evidence-test-results.png') })
    await phone.emulateMedia({ colorScheme: 'dark' })
    await expect(rows.first()).toHaveCSS('background-color', 'rgb(21, 36, 29)')
  } finally {
    await browser.close()
  }
})
