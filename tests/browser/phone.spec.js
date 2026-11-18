import { test, expect, devices } from '@playwright/test'
import { randomUUID } from 'node:crypto'

// Phone layout checks run on the configured browser with iPhone 13 emulation.
const { defaultBrowserType, ...iPhone } = devices['iPhone 13']
test.use(iPhone)
const demo = () => './#demo=' + randomUUID() + '&start=' + Date.now()
const sheet = (page) => page.locator('.sheet')
async function tapCentre(page, locator) {
  const box = await locator.boundingBox()
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
}

test('the first phone screen answers “where can I sit?” and finds a free seat in one tap', async ({
  page,
}, testInfo) => {
  await page.goto(demo())
  await expect(page.getByRole('note')).toContainText('Demo with example data')
  await expect(page.locator('.hero h1')).toHaveText(/^\d+ seats? free$/)
  const find = page.getByRole('button', { name: 'Find me a free seat' })
  await expect(find).toBeInViewport()
  expect((await find.boundingBox()).height).toBeGreaterThanOrEqual(48)
  await find.tap()
  await expect(sheet(page)).toBeVisible()
  await expect(sheet(page).locator('.inspector-head .status')).toContainText(/free/i)
  await page.screenshot({ path: testInfo.outputPath('phone-find.png') })
  // Every control on the first screen is a comfortable size for a thumb.
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('.phone button, .phone a, .phone input')]
      .filter((el) => el.offsetParent && !el.closest('.plan-svg'))
      .map((el) => [el.getAttribute('aria-label') || el.textContent.trim(), el.getBoundingClientRect()])
      .filter(([, r]) => r.height < 44 && r.width > 0)
      .map(([name, r]) => name + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)),
  )
  expect(small).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('a tap on crowded seats zooms in first, then picks exactly the seat tapped', async ({
  page,
}) => {
  await page.goto(demo())
  await page.locator('.plan-viewport').scrollIntoViewIfNeeded()
  for (const n of [1, 5, 12, 20, 33, 47, 58, 66, 80, 92]) {
    const id = 'I' + String(n).padStart(3, '0')
    const name = 'Seat ' + String(n).padStart(2, '0')
    const fit = page.getByRole('button', { name: 'Show the whole floor' })
    if (await fit.isEnabled()) await fit.tap()
    const marker = page.locator(`[data-id="${id}"]`)
    await tapCentre(page, marker)
    await expect(page.locator('.map-hint')).toContainText('Tap the seat you want')
    await expect(sheet(page)).toHaveCount(0)
    await marker.scrollIntoViewIfNeeded()
    await tapCentre(page, marker)
    await expect(sheet(page).getByRole('heading', { level: 2 })).toHaveText(name)
    await sheet(page).getByRole('button', { name: 'Close' }).tap()
  }
})

test('reporting a seat or a whole table takes one tap from the sheet', async ({ page }) => {
  await page.goto(demo())
  await page.getByRole('button', { name: 'List', exact: true }).tap()
  await page.getByLabel('Search seats').fill('seat 7')
  await expect(page.locator('.list-location')).toHaveCount(1)
  await page.locator('.list-location').tap()
  await expect(sheet(page).getByRole('heading', { level: 2 })).toHaveText('Seat 07')
  await sheet(page).getByRole('button', { name: "It's taken" }).tap()
  await expect(sheet(page).getByRole('status')).toHaveText(
    'Thanks! Seat 07 marked taken. Reports last 15 minutes.',
  )
  await sheet(page).getByRole('button', { name: 'Close' }).tap()
  await page.getByLabel('Search seats').fill('table 6')
  await page.locator('.list-location').tap()
  await sheet(page).getByRole('button', { name: 'Report or check in' }).tap()
  await sheet(page).getByRole('button', { name: 'All free' }).tap()
  await expect(sheet(page).getByRole('status')).toContainText('Table 06: 4 chairs marked free.')
  await expect(sheet(page).locator('.inspector-head .status')).toHaveText('4 of 4 chairs free')
})

test('a table QR opens straight to check-in, says how long it lasts, and checks out from anywhere', async ({
  page,
}, testInfo) => {
  const room = demo()
  await page.goto(room + '&spot=T17&checkin=1')
  const checkIn = page.getByRole('button', { name: /^Check in to Chair [A-D]$/ })
  await expect(checkIn).toBeInViewport()
  await expect(sheet(page)).toContainText('hold it for 60 minutes')
  await page.screenshot({ path: testInfo.outputPath('phone-qr.png') })
  await checkIn.tap()
  await expect(sheet(page).getByRole('status')).toContainText('Held until')
  await expect(page.locator('.mine-banner')).toContainText("You're checked in at Table 17")
  await page.goto(room)
  await expect(page.locator('.mine-banner')).toContainText('min left')
  await page.locator('.mine-banner').getByRole('button', { name: 'Check out' }).tap()
  await expect(page.locator('.mine-banner')).toHaveCount(0)
  await expect(page.locator('.floating-note')).toContainText('Checked out of Table 17')
})

test('the phone menu reaches the data page, and Back returns to the map', async ({ page }) => {
  await page.goto(demo())
  await page.getByRole('button', { name: 'Menu' }).tap()
  await page.getByRole('button', { name: 'How the data works' }).tap()
  await expect(page.getByRole('heading', { name: 'How the data works' })).toBeVisible()
  await page.goBack()
  await expect(page.locator('.hero')).toBeVisible()
  await page.getByRole('button', { name: 'Menu' }).tap()
  await page.getByRole('button', { name: 'Live floor' }).tap()
  await expect(page.getByRole('note')).toHaveCount(0)
  await expect(page.locator('.hero h1')).toHaveText('No seat updates yet')
})

test('the phone layout fits a 320 px screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto(demo())
  await page.getByRole('button', { name: 'Find me a free seat' }).tap()
  await sheet(page).getByRole('button', { name: /Report or check in|More details/ }).tap()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
