import { test, expect, devices } from '@playwright/test'

test('the evidence page keeps desktop tables and stacks long rows on iPhone', async ({
  page, playwright, baseURL,
}, testInfo) => {
  await page.goto('./')
  await page.getByRole('link', { name: 'Prototype evidence' }).click()
  await expect(page.getByRole('heading', { name: 'OpenSeat · CEN100 prototype record' })).toBeVisible()
  const images = page.locator('#process-evidence img')
  await expect(images).toHaveCount(3)
  for (const img of await images.all()) {
    await expect.poll(() => img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0)
  }
  await expect(page.locator('#verification tbody tr').first()).toHaveCSS('display', 'table-row')

  const browser = await playwright.webkit.launch()
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
  } finally {
    await browser.close()
  }
})
