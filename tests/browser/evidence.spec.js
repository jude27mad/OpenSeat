import { test, expect } from '@playwright/test'

test('the dashboard opens readable evidence with all three build screenshots', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('link', { name: 'Prototype evidence' }).click()
  await expect(page.getByRole('heading', { name: 'OpenSeat · CEN100 prototype record' })).toBeVisible()
  const images = page.locator('#process-evidence img')
  await expect(images).toHaveCount(3)
  for (const img of await images.all()) {
    await expect.poll(() => img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0)
  }
  await page.setViewportSize({ width: 375, height: 812 })
  await page.getByRole('link', { name: 'Test results' }).click()
  await expect(page.getByRole('heading', { name: 'Verification' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
