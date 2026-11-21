import { expect, test } from '@playwright/test'


const relay = /^https:\/\/openseat-classroom-relay\.[^/]+\/(?:status|watch)$/
test('classroom reads the shared count after switching apps without a token', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let scan = null
  await page.route(relay, route => route.fulfill({ json: { listening: true, scan } }))
  await page.goto('./')
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  const link = page.getByRole('link', { name: 'Classroom demo' })
  await expect(link).toBeVisible()
  expect(await link.evaluate((el) => el.previousElementSibling.textContent)).toMatch(/Share this map/)
  await link.click()
  await expect(page.getByRole('heading', { name: 'Classroom count' })).toBeVisible()
  await expect(page.getByLabel('Scanner section')).toHaveCount(0)
  await expect(page.getByLabel('flespi read token')).toHaveCount(0)
  await expect(page.getByText('Listening for scan')).toBeVisible()
  await expect(page.getByText('No count yet')).toHaveCount(1)
  const update = async value => {
    scan = {value, measuredAt: Date.now()}
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  }
  await update(22)
  await expect(page.getByText('10 estimated people', {exact:true})).toHaveCount(1)
  await page.reload()
  await expect(page.getByText('10 estimated people', {exact:true})).toHaveCount(1)
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.getByText('Listening for scan')).toBeVisible()
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/status')),
    page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))),
  ])
  await expect(page.getByText('No count yet')).toHaveCount(1)
  await update(0)
  await expect(page.getByText('0 estimated people', {exact:true})).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('projector layout opens from the desktop menu and fits the count on screen', async ({ page }, testInfo) => {
  await page.route(relay, route => route.fulfill({json:{listening:true, scan:null}}))
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./')
  await page.getByRole('link', { name: 'Classroom demo' }).click()
  await expect(page.getByRole('heading', { name: 'Classroom count' })).toBeVisible()
  const panel = await page.locator('.count-panel').boundingBox()
  expect(panel.y).toBeGreaterThanOrEqual(0)
  expect(panel.y + panel.height).toBeLessThanOrEqual(800)
  await expect(page.getByText('Ready for your phone')).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('classroom-projector.png') })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Classroom count' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to map' }).click()
  await expect(page.getByRole('heading', { name: 'Floor overview' })).toBeVisible()
})
