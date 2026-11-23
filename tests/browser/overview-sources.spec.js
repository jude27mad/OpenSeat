import { test, expect } from '@playwright/test'

for (const width of [390, 1280]) {
  test('all three floor data sources stay below the map and list at width ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    // A student might reload a tab that was on the old standalone page.
    await page.addInitScript(() => {
      history.replaceState({ openseat: true, openseatPage: 'sources' }, '')
    })
    await page.goto('./#floor=8')
    const panel = page.getByRole('region', { name: 'Floor data sources' })
    const phone = width === 390
    const map = page.locator(phone ? '.phone-map' : '.floor-panel .legend')
    await expect(map).toBeVisible()
    const below = async (target) => {
      // A live count can reflow the page between two Playwright calls.
      // Measure both edges in the same layout pass.
      await expect.poll(() => target.evaluate((element) => {
        const sources = document.querySelector('[aria-labelledby="sources-live-title"]')
        return sources.getBoundingClientRect().top - element.getBoundingClientRect().bottom
      })).toBeGreaterThanOrEqual(-1)
    }
    await below(map)
    await panel.scrollIntoViewIfNeeded()
    for (const name of ['Student reports', 'Bluetooth', 'Seat sensors']) {
      await expect(panel.getByText(name, { exact: true })).toBeInViewport()
    }
    await expect(panel.locator('li')).toHaveCount(3)
    await expect(panel).not.toContainText(/check-in|checked in/i)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(panel.getByRole('button', { name: /How it works|Connect scanner/ })).toHaveCount(0)
    if (!phone) {
      const navigation = page.getByRole('navigation', { name: 'Workspace' })
      await expect(navigation.getByRole('button', { name: 'Floor overview' })).toBeVisible()
      await expect(navigation).not.toContainText('Data sources')
    }
    await page.getByRole('button', { name: phone ? 'List' : 'List view', exact: true }).click()
    const list = page.locator('.seat-list')
    await expect(list).toBeVisible()
    await below(list)
  })
}
