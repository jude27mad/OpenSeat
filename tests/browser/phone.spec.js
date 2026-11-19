import { test, expect, devices } from '@playwright/test'
import { randomUUID } from 'node:crypto'

// Phone layout checks run on the configured browser with iPhone 13 emulation.
const { defaultBrowserType, ...iPhone } = devices['iPhone 13']
test.use(iPhone)
const demo = () => './#demo=' + randomUUID() + '&start=' + Date.now()
const sheet = (page) => page.locator('.sheet')
const toast = (page) => page.locator('.phone-toast')
async function tapCentre(page, locator) {
  const box = await locator.boundingBox()
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
}
// The chosen place's marker is on screen, below the top bar and above the sheet.
async function markerAboveSheet(page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const sheet = document.querySelector('.sheet'),
          id = sheet?.getAttribute('aria-label')
        const marker = [...document.querySelectorAll('.phone-map [data-id]')].find(
          (m) => m.classList.contains('active'),
        )
        if (!sheet || !marker || !id) return 'missing'
        const r = marker.getBoundingClientRect(),
          top = sheet.getBoundingClientRect().top,
          bar = document.querySelector('.phone-top').getBoundingClientRect().bottom
        return r.top >= bar && r.bottom <= top ? 'visible' : 'hidden ' + [r.top, r.bottom, bar, top].map(Math.round)
      }),
    )
    .toBe('visible')
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
  await markerAboveSheet(page)
  await page.screenshot({ path: testInfo.outputPath('phone-find.png') })
  // The next suggestion is one tap away, right in the sheet.
  const first = await sheet(page).getByRole('heading', { level: 2 }).textContent()
  const next = sheet(page).getByRole('button', { name: /Next free spot \(2 of \d+\)/ })
  await expect(next).toBeInViewport()
  await next.tap()
  await expect(sheet(page).getByRole('heading', { level: 2 })).not.toHaveText(first)
  await markerAboveSheet(page)
  // Every control on the first screen is a comfortable size for a thumb.
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('.phone button, .phone a, .phone input')]
      .filter((el) => el.offsetParent && !el.closest('.plan-svg') && !el.matches('.sr-only'))
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
    await marker.scrollIntoViewIfNeeded()
    const box = await marker.boundingBox(),
      x = box.x + box.width / 2,
      y = box.y + box.height / 2
    await page.touchscreen.tap(x, y)
    await expect(page.locator('.map-hint')).toContainText('Tap the seat you want')
    await expect(sheet(page)).toHaveCount(0)
    // The seat stays under the finger, so tapping the same spot again picks it.
    await page.touchscreen.tap(x, y)
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
  await expect(toast(page)).toHaveText('Thanks! Seat 07 marked taken.')
  await expect(toast(page)).toBeInViewport()
  await sheet(page).getByRole('button', { name: 'Close' }).tap()
  await page.getByLabel('Search seats').fill('table 6')
  await page.locator('.list-location').tap()
  await sheet(page).getByRole('button', { name: 'Report or check in' }).tap()
  await sheet(page).getByRole('button', { name: 'All free' }).tap()
  await expect(toast(page)).toContainText('Table 06: 4 chairs marked free.')
  await expect(toast(page)).toBeInViewport()
  await expect(sheet(page).locator('.inspector-head .status')).toHaveText('4 of 4 chairs free')
})

test('an abandoned check-in can be cleared, and the student sitting there can check in', async ({
  page,
  browser,
}) => {
  const room = demo()
  await page.goto(room + '&spot=T17&checkin=1')
  const first = page.getByRole('button', { name: /^Check in to Chair [A-D]$/ })
  const chair = (await first.textContent()).slice(-1)
  await first.tap()
  await expect(page.locator('.mine-banner')).toContainText('Table 17 · Chair ' + chair)
  // A second student scans the same table: they start on a chair nobody holds.
  const other = await browser.newContext({ ...iPhone })
  const phone = await other.newPage()
  await phone.goto(room + '&spot=T17-' + chair + '&checkin=1')
  await expect(sheet(phone).getByRole('button', { name: 'Chair ' + chair + ' is taken' })).toBeVisible()
  await sheet(phone).getByRole('button', { name: "It's free" }).tap()
  const confirm = sheet(phone).getByRole('alertdialog')
  await expect(confirm).toBeInViewport()
  await confirm.getByRole('button', { name: "Yes, it's empty" }).tap()
  await expect(toast(phone)).toContainText('Anyone sitting there can now check in.')
  await expect(toast(phone)).toBeInViewport()
  const checkIn = sheet(phone).getByRole('button', { name: 'Check in to Chair ' + chair })
  await expect(checkIn).toBeVisible()
  await checkIn.tap()
  await expect(phone.locator('.mine-banner')).toContainText('Table 17 · Chair ' + chair)
  // The first student's hold is gone once someone else checks in.
  await expect(page.locator('.mine-banner')).toHaveCount(0, { timeout: 10000 })
  await other.close()
})

test('a second student scanning a table starts on a chair nobody holds', async ({ page, browser }) => {
  const room = demo()
  await page.goto(room + '&spot=T05&checkin=1')
  const first = page.getByRole('button', { name: /^Check in to Chair [A-D]$/ })
  const chair = (await first.textContent()).slice(-1)
  await first.tap()
  await expect(page.locator('.mine-banner')).toBeVisible()
  const other = await browser.newContext({ ...iPhone })
  const phone = await other.newPage()
  await phone.goto(room + '&spot=T05&checkin=1')
  await expect(phone.locator('.sync')).toHaveText('Connected', { timeout: 25000 })
  const next = phone.getByRole('button', { name: /^Check in to Chair [A-D]$/ })
  await expect(next).toBeVisible()
  await expect(next).not.toHaveText('Check in to Chair ' + chair)
  await other.close()
})

test('a table QR opens straight to check-in, says how long it lasts, and checks out from anywhere', async ({
  page,
}, testInfo) => {
  const room = demo()
  await page.goto(room + '&spot=T17&checkin=1')
  const checkIn = page.getByRole('button', { name: /^Check in to Chair [A-D]$/ })
  await expect(checkIn).toBeInViewport()
  await expect(sheet(page)).toContainText('hold it until you check out')
  await page.screenshot({ path: testInfo.outputPath('phone-qr.png') })
  await checkIn.tap()
  await expect(toast(page)).toContainText('Held until')
  await expect(toast(page)).toBeInViewport()
  await expect(page.locator('.mine-banner')).toContainText("You're checked in at Table 17")
  // Your own chair offers Check out, not a report that would end it by accident.
  await expect(sheet(page).getByRole('button', { name: 'Check out' })).toBeVisible()
  await expect(sheet(page).getByRole('button', { name: "It's free" })).toHaveCount(0)
  await page.goto(room)
  await expect(page.locator('.mine-banner')).toContainText('Held until you check out')
  await page.locator('.mine-banner').getByRole('button', { name: /^Check out/ }).tap()
  await expect(page.locator('.mine-banner')).toHaveCount(0)
  await expect(page.locator('.floating-note')).toContainText('Checked out of Table 17')
  await page.locator('.floating-note').getByRole('button', { name: 'Undo' }).tap()
  await expect(page.locator('.mine-banner')).toContainText("You're checked in at Table 17")
})

test('Back closes the sheet, the menu and the list before it leaves OpenSeat', async ({ page }) => {
  await page.goto('about:blank')
  await page.goto(demo())
  await page.getByRole('button', { name: 'Find me a free seat' }).tap()
  await expect(sheet(page)).toBeVisible()
  await page.goBack()
  await expect(sheet(page)).toHaveCount(0)
  await expect(page.locator('.hero')).toBeVisible()
  await page.getByRole('button', { name: 'Menu' }).tap()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'List', exact: true }).tap()
  await expect(page.getByLabel('Search seats')).toBeVisible()
  await page.goBack()
  await expect(page.locator('.phone-map')).toBeVisible()
  expect(page.url()).toContain('#demo=')
})

test('the phone menu reaches the data page, and Back returns to the map', async ({ page }) => {
  await page.goto(demo())
  await page.getByRole('button', { name: 'Menu' }).tap()
  await page.getByRole('button', { name: 'How the data works' }).tap()
  await expect(page.getByRole('heading', { name: 'How the data works' })).toBeVisible()
  await page.goBack()
  await expect(page.locator('.hero')).toBeVisible()
  const demoUrl = page.url()
  await page.getByRole('button', { name: 'Menu' }).tap()
  await page.getByRole('button', { name: 'Live floor' }).tap()
  await expect(page.getByRole('note')).toHaveCount(0)
  await expect(page.locator('.hero h1')).toHaveText(/No seat updates yet|seats? free/)
  // Coming back to the demo returns to the same session, by menu or by Back.
  await page.getByRole('button', { name: 'Menu' }).tap()
  await page.getByRole('button', { name: 'Demo', exact: true }).tap()
  await expect(page.getByRole('note')).toBeVisible()
  expect(new URL(page.url()).hash).toBe(new URL(demoUrl).hash)
  await page.goBack()
  await expect(page.getByRole('note')).toHaveCount(0)
  await page.goBack()
  await expect(page.getByRole('note')).toBeVisible()
})

test('the phone layout fits a 320 px screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto(demo())
  await page.getByRole('button', { name: 'Find me a free seat' }).tap()
  await sheet(page).getByRole('button', { name: /Report or check in|More details/ }).tap()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
