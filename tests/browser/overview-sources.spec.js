import { test, expect } from '@playwright/test'

for (const width of [390, 1280]) {
  test('overview shows all four sources with scanner setup behind How it works at width ' + width, async ({ page }) => {
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
    for (const name of ['QR check-in', 'Student reports', 'Bluetooth', 'Seat sensors']) {
      await expect(panel.getByText(name, { exact: true })).toBeInViewport()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(panel.getByRole('button', { name: 'Connect scanner' })).toHaveCount(0)
    await page.getByRole('button', { name: phone ? 'List' : 'List view', exact: true }).click()
    const list = page.locator('.seat-list')
    await expect(list).toBeVisible()
    await below(list)
    await panel.getByRole('button', { name: 'How it works' }).click()
    await page.getByRole('button', { name: 'Connect scanner', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Bluetooth scanner' })
    await expect(dialog.getByText('Table sensor', { exact: true })).toHaveCount(0)
    await expect(dialog.getByLabel('flespi read token')).toBeVisible()
    await expect(dialog.getByLabel('Scanner MQTT topic')).toBeVisible()
    await expect(dialog.getByLabel('OpenSeat operator key')).toBeVisible()
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(dialog).toBeHidden()
  })
}
