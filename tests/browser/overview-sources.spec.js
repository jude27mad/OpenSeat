import { test, expect } from '@playwright/test'

for (const width of [390, 1280]) {
  test('overview shows all three sources without a scanner link on Data sources at width ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('./#floor=8')
    const panel = page.getByRole('region', { name: 'Floor data sources' })
    const phone = width === 390
    const map = page.locator(phone ? '.phone-map' : '.floor-panel .legend')
    await expect(map).toBeVisible()
    const below = async (target) => {
      const bounds = await target.boundingBox()
      expect((await panel.boundingBox()).y).toBeGreaterThanOrEqual(bounds.y + bounds.height - 1)
    }
    await below(map)
    await panel.scrollIntoViewIfNeeded()
    for (const name of ['Student reports', 'Bluetooth', 'Seat sensors']) {
      await expect(panel.getByText(name, { exact: true })).toBeInViewport()
    }
    await expect(panel.locator('li')).toHaveCount(3)
    await expect(panel).not.toContainText(/check-in|checked in/i)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(panel.getByRole('button', { name: 'Connect scanner' })).toHaveCount(0)
    await page.getByRole('button', { name: phone ? 'List' : 'List view', exact: true }).click()
    const list = page.locator('.seat-list')
    await expect(list).toBeVisible()
    await below(list)
    await panel.getByRole('button', { name: 'How it works' }).click()
    const bluetooth = page.locator('.source-card').filter({ has: page.getByRole('heading', { name: 'Bluetooth', exact: true }) })
    await expect(bluetooth).toBeVisible()
    await expect(bluetooth).not.toContainText('Connect scanner')
  })
}
