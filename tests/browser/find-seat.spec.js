import { test, expect, devices } from '@playwright/test'

// A student opens OpenSeat and presses "Find me a free seat". The timer covers
// opening the site and the press, and stops when a free seat's details show.
const limit = 10000

test('a student finds a free seat within 10 s on a desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const start = Date.now()
  await page.goto('./')
  await expect(page.getByRole('note')).toContainText('Demo with example data')
  await page.getByRole('button', { name: 'Find me a free seat', exact: true }).click()
  await expect(page).toHaveURL(/spot=/)
  const panel = page.locator('.inspector')
  // The panel already shows a place before the press, so also check that Find
  // moved focus to the name of the place it opened.
  const title = panel.getByRole('heading', { level: 2 })
  await expect(title).toHaveText(/^(Table|Seat) \d+$/)
  await expect(title).toBeFocused()
  await expect(panel.locator('.inspector-head .status')).toContainText(/free/i)
  const ms = Date.now() - start
  console.log('Desktop: opened the site and found a free seat in ' + ms + ' ms')
  expect(ms).toBeLessThan(limit)
})

test.describe('on a phone', () => {
  // The configured browser with iPhone 13 emulation, as in phone.spec.js.
  const { defaultBrowserType, ...iPhone } = devices['iPhone 13']
  test.use(iPhone)

  test('a student finds a free seat within 10 s on a phone', async ({ page }) => {
    const start = Date.now()
    await page.goto('./')
    await expect(page.getByRole('note')).toContainText('Demo with example data')
    await page.getByRole('button', { name: 'Find me a free seat', exact: true }).tap()
    const sheet = page.locator('.sheet')
    await expect(sheet.getByRole('heading', { level: 2 })).toHaveText(/^(Table|Seat) \d+$/)
    await expect(sheet.locator('.inspector-head .status')).toContainText(/free/i)
    const ms = Date.now() - start
    console.log('Phone: opened the site and found a free seat in ' + ms + ' ms')
    expect(ms).toBeLessThan(limit)
  })
})
