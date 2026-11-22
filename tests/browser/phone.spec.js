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

test('all floors draw the same map symbols and keep seats at their rotated locations', async ({ page }, testInfo) => {
  await page.goto(demo())
  const map = page.locator('.phone-map .plan-svg')
  const baseline = {}
  for (const [number, seats, tables] of [[8, 92, 40], [5, 166, 0], [7, 196, 3]]) {
    await page.getByRole('combobox', { name: 'Floor', exact: true }).selectOption(String(number))
    await expect(map).toHaveAttribute('aria-label', new RegExp('Floor ' + number + '$'))
    await expect(page.getByRole('group', { name: 'Area', exact: true })).toHaveCount(tables ? 1 : 0)
    await expect(map.locator('image')).toHaveCount(0)
    await expect(map.locator('.plan-label').filter({ hasText: /^LIFTS$/ })).toBeVisible()
    await expect(map.locator('.room-shape[fill^="url(#"]')).not.toHaveCount(0)
    await expect(map.locator('.map-marker[data-id^="I"] .seat-symbol')).toHaveCount(seats)
    await expect(map.locator('.map-marker[data-id^="T"] .table-symbol')).toHaveCount(tables)
    await expect(map.locator('.lift-symbol')).toHaveCount(4)

    // Compare the drawn seat, table chairs and lift arrows independently of position,
    // marker orientation, occupancy color and optional table sensor readings.
    for (const symbol of tables ? ['seat', 'lift', 'table'] : ['seat', 'lift']) {
      const glyph = map.locator('.' + symbol + '-symbol').first()
      await expect(glyph).toBeVisible()
      const shapes = await glyph.evaluate((group) =>
        [...group.querySelectorAll('rect, path')].map((shape) => [
          shape.tagName, shape.getAttribute('width'), shape.getAttribute('height'),
          shape.getAttribute('rx'), shape.getAttribute('d'),
        ]),
      )
      expect(shapes.length).toBeGreaterThan(0)
      if (number === 8) baseline[symbol] = shapes
      else expect(shapes).toEqual(baseline[symbol])
    }

    await map.screenshot({ path: testInfo.outputPath('phone-floor-' + number + '.png') })
    if (number === 8) continue
    // On both quarter-turned plans the first desk is in the lower-left area.
    const desk = map.locator('[data-id="I001"]')
    await desk.scrollIntoViewIfNeeded()
    const artwork = await map.boundingBox()
    const cell = await desk.boundingBox()
    expect(cell.x + cell.width / 2).toBeLessThan(artwork.x + artwork.width / 2)
    expect(cell.y + cell.height / 2).toBeGreaterThan(artwork.y + artwork.height / 2)
    await tapCentre(page, desk)
    await expect(page.locator('.map-hint')).toContainText('Tap the seat you want')
    await tapCentre(page, desk)
    await expect(sheet(page).getByRole('heading', { level: 2 })).toHaveText('Seat 01')
    await sheet(page).getByRole('button', { name: 'Close' }).tap()
  }
})

test('a tap on crowded seats zooms in first, then picks exactly the seat tapped', async ({
  page,
}) => {
  for (const n of [1, 5, 12, 20, 33, 47, 58, 66, 80, 92]) {
    await page.goto(demo())
    await page.locator('.plan-viewport').scrollIntoViewIfNeeded()
    const id = 'I' + String(n).padStart(3, '0')
    const name = 'Seat ' + String(n).padStart(2, '0')
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
  await sheet(page).getByRole('button', { name: 'Report this table' }).tap()
  await sheet(page).getByRole('button', { name: 'All free' }).tap()
  await expect(toast(page)).toContainText('Table 06: 4 chairs marked free.')
  await expect(toast(page)).toBeInViewport()
  await expect(sheet(page).locator('.inspector-head .status')).toHaveText('4 of 4 chairs free')
})

test('a table or seat QR link opens that spot with its report buttons, old check-in links too', async ({
  page,
}, testInfo) => {
  const room = demo()
  const spots = [
    ['T17', 'Table 17', 'Is Chair [A-D] free\\?'],
    ['I020', 'Seat 20', 'Is this seat free\\?'],
    // QR codes printed before check-in was removed carry checkin=1. They still open the spot.
    ['T05-C&checkin=1', 'Table 05', 'Is Chair C free\\?'],
    ['I012&checkin=1', 'Seat 12', 'Is this seat free\\?'],
  ]
  for (const [spot, name, question] of spots) {
    await page.goto(room + '&spot=' + spot)
    await expect(sheet(page).getByRole('heading', { level: 2 })).toHaveText(name)
    await expect(sheet(page).locator('.inspector-head .status')).toBeVisible()
    await expect(sheet(page).getByText(new RegExp('^' + question + '$'))).toBeVisible()
    await expect(sheet(page).getByRole('button', { name: "It's free" })).toBeInViewport()
    await expect(sheet(page).getByRole('button', { name: "It's taken" })).toBeInViewport()
    await expect(page.getByRole('button', { name: /check in|check out|keep it/i })).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(/check(ed)? in/i)
    if (spot === 'T17') await page.screenshot({ path: testInfo.outputPath('phone-qr.png') })
  }
  await sheet(page).getByRole('button', { name: "It's taken" }).tap()
  await expect(toast(page)).toHaveText('Thanks! Seat 12 marked taken.')
  expect(page.url()).not.toContain('checkin')
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
  await expect(page.locator('.hero h1')).toHaveText(
    /No seat updates yet|No free seats reported|Every seat is taken|seats? free/,
  )
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
  await sheet(page).getByRole('button', { name: /Report this table|More details/ }).tap()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
