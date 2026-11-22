import { test, expect, devices } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { PNG } from 'pngjs'
import jsQR from 'jsqr'
// CI drives the phone with WebKit. Set OPENSEAT_PHONE_ENGINE=chromium where WebKit is unavailable.
const phoneEngine = process.env.OPENSEAT_PHONE_ENGINE || 'webkit'
const demo = () => './#demo=' + randomUUID() + '&start=' + Date.now()
function observeService(page, label) {
  page.on('requestfailed', (request) => {
    const path = new URL(request.url()).pathname
    if (path.endsWith('.json'))
      console.log(label, path, request.failure()?.errorText)
  })
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname
    if (path.endsWith('.json') && !response.ok())
      console.log(label, path, response.status())
  })
  page.on('pageerror', (error) => console.log(label, error.message))
}
test('Free only excludes taken map markers and clears their details', async ({ page }) => {
  await page.goto(demo() + '&level=7')
  await page.getByRole('combobox', { name: 'Map area' }).selectOption('individuals')
  const taken = page.locator('.plan-svg .map-marker.occupied[role="button"]').first()
  const id = await taken.getAttribute('data-id')
  const marker = page.locator(`.plan-svg .map-marker[data-id="${id}"]`).first()
  await marker.click()
  await expect(page).toHaveURL(new RegExp('spot=' + id))
  await page.getByRole('button', { name: 'Free only' }).click()
  await expect(marker).toHaveAttribute('aria-hidden', 'true')
  await expect(marker).not.toHaveAttribute('role', 'button')
  await expect(page).not.toHaveURL(new RegExp('spot=' + id))
  const panel = page.locator('.inspector-title h2')
  await expect(panel).not.toHaveText('Seat ' + String(Number(id.slice(1))).padStart(2, '0'))
  await marker.click()
  await expect(page).not.toHaveURL(new RegExp('spot=' + id))
  await page.getByRole('button', { name: 'List view' }).click()
  await page.getByRole('textbox', { name: 'Search seats' }).fill(id)
  await expect(page.locator('.list-location')).toHaveCount(0)
  await expect(panel).toHaveCount(0)
  await page.getByRole('button', { name: 'Free only' }).click()
  await expect(page.locator('.list-location')).toHaveCount(1)
  await expect(panel).toHaveText('Seat ' + String(Number(id.slice(1))).padStart(2, '0'))
})

test('desktop map controls zoom and fit the selected floor', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('./#floor=5&spot=I038')
  const viewport = page.locator('.plan-viewport')
  const controls = page.getByRole('group', { name: 'Map zoom' })
  const zoomIn = controls.getByRole('button', { name: 'Zoom in' })
  const zoomOut = controls.getByRole('button', { name: 'Zoom out' })
  const fit = controls.getByRole('button', { name: 'Fit', exact: true })
  const scale = () => viewport.locator('.plan-svg').evaluate((svg) => svg.getScreenCTM().a)

  // The shared seat link opens zoomed in.
  await fit.click()
  await expect(zoomOut).toBeDisabled()
  const fitted = await scale()
  await zoomIn.click()
  await expect.poll(scale).toBeGreaterThan(fitted)
  await zoomOut.click()
  await expect.poll(scale).toBeCloseTo(fitted)
  for (let i = 0; i < 4; i++) await zoomIn.click()
  await expect(zoomIn).toBeDisabled()
  await viewport.evaluate((el) => el.scrollTo(el.scrollWidth, el.scrollHeight))
  await fit.click()
  await expect.poll(scale).toBeCloseTo(fitted)
  await expect.poll(() => viewport.evaluate((el) => [el.scrollLeft, el.scrollTop])).toEqual([0, 0])
  await expect(page.locator('.inspector-title h2')).toHaveText('Seat 38')

  await page.getByRole('button', { name: 'List view' }).click()
  await expect(controls).toHaveCount(0)
  await page.getByRole('button', { name: 'Map view' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.phone-map .plan-svg')).toBeVisible()
  await expect(controls).toHaveCount(0)
})

test('the desktop floor overview finds free seats directly on the map', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(demo())
  const home = page.getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Floor overview' })
  await expect(home).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: 'Find a seat', exact: true })).toHaveCount(0)
  const find = page.getByRole('button', { name: 'Find me a free seat', exact: true })
  await expect(find).toBeInViewport()
  await page.getByRole('combobox', { name: 'Map area' }).selectOption('individuals')
  await page.getByRole('button', { name: 'List view' }).click()
  await find.click()

  const title = page.locator('.inspector-title h2')
  const status = page.locator('.inspector-title .status')
  const marker = page.locator('.floor-panel .map-marker.active')
  await expect(page.getByRole('button', { name: 'Map view' })).toHaveAttribute('aria-pressed', 'true')
  await expect(title).toHaveText(/^Seat \d+$/)
  await expect(status).toHaveText('Free')
  await expect(marker).toHaveAttribute('data-id', /^I\d+$/)
  await expect(marker).toBeInViewport()
  await expect(title).toBeFocused()
  const first = await title.textContent()
  await expect(page.getByRole('button', { name: /Show another free spot \(1 of \d+\)/ })).toBeVisible()
  await page.locator('.inspector').getByRole('button', { name: /Next free spot \(2 of \d+\)/ }).click()
  await expect(title).not.toHaveText(first)
  await expect(title).toHaveText(/^Seat \d+$/)
  await expect(status).toHaveText('Free')
  await expect(marker).toHaveAccessibleName(new RegExp('^' + (await title.textContent()) + ','))
  await expect(home).toHaveAttribute('aria-current', 'page')
})

test('Floor inventory and independent mobile QR session use all four sources', async ({
  page,
  playwright,
  baseURL,
}, testInfo) => {
  const roomUrl = demo()
  observeService(page, 'desktop')
  await page.goto(roomUrl)
  await expect(
    page.getByRole('heading', { name: 'Floor overview' }),
  ).toBeVisible()
  const metrics = page.locator('.metric strong')
  expect(
    (await metrics.allTextContents())
      .slice(0, 3)
      .map(Number)
      .reduce((a, b) => a + b, 0),
  ).toBe(252)
  await expect(page.getByText('40 round tables · 92 individual seats')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Seat 91,/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Seat 92,/ })).toBeVisible()
  await page.getByRole('button', { name: /^Table 17,/ }).click()
  await page.getByRole('button', { name: 'Show table QR code' }).click()
  const img = page.getByRole('img', { name: 'QR code for Table 17' })
  await expect(img).toBeVisible()
  const png = PNG.sync.read(
    Buffer.from((await img.getAttribute('src')).split(',')[1], 'base64'),
  )
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
  expect(decoded.data).toContain('spot=T17')
  expect(decoded.data).toContain('checkin=1')
  const mobileBrowser = await playwright[phoneEngine].launch()
  const mobile = await mobileBrowser.newContext({
    ...devices['iPhone 13'],
    baseURL,
  })
  const phone = await mobile.newPage()
  observeService(phone, 'mobile')
  await phone.goto(decoded.data)
  await phone.getByRole('button', { name: /^Chair B,/ }).click()
  await expect(
    phone.getByRole('button', { name: 'Check in to Chair B', exact: true }),
  ).toBeInViewport()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: /^Chair B,/ }).click()
  await expect(page.locator('.sync')).toHaveText('Connected', {
    timeout: 25000,
  })
  await expect(phone.locator('.sync')).toHaveText('Connected', {
    timeout: 25000,
  })
  const t = Date.now()
  await phone.getByRole('button', { name: 'Check in to Chair B', exact: true }).click()
  // The live check-in, not the demo's example reading for the same chair.
  await expect(page.locator('.inspector .origin').first()).toHaveText(
    /^QR check-in · (Just now|\d+s ago)$/,
    { timeout: 10000 },
  )
  await expect(page.locator('.seat-reading .status')).toHaveText('Taken')
  console.log(
    'QR check-in propagated to independent browser in ' +
      (Date.now() - t) +
      ' ms',
  )
  await page.getByRole('button', { name: "It's free", exact: true }).click()
  await page.getByRole('button', { name: "Yes, it's empty" }).click()
  // A confirmed free report clears the check-in for everyone else; the
  // student who checked in is told and can keep the chair or check out.
  await expect(phone.locator('.seat-reading .status')).toHaveText('Free', { timeout: 10000 })
  await expect(phone.locator('.sheet')).toContainText('Someone marked your chair free')
  await expect(phone.locator('.mine-banner')).toContainText(
    "You're checked in at Table 17 · Chair B",
  )
  await phone
    .locator('.sheet')
    .getByRole('button', { name: 'Check out', exact: true })
    .click()
  await expect(phone.locator('.mine-banner')).toHaveCount(0)
  await expect(page.locator('.seat-reading .status')).toHaveText('Free', {
    timeout: 10000,
  })
  await expect(phone.locator('body')).toBeVisible()
  expect(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await phone.screenshot({
    path: testInfo.outputPath('phone.png'),
    fullPage: true,
  })
  // In the demo, a seat sensor is tried right where it shows, and it decides the chair.
  const inspector = page.locator('.inspector')
  const chair = (await inspector.locator('.chair-tabs [aria-pressed="true"] b').textContent()).trim()
  await inspector.getByRole('button', { name: 'Sensor: in use', exact: true }).click()
  await expect(inspector.getByRole('status')).toContainText(
    'Demo sensor reading: Table 17 · Chair ' + chair + ' is in use.',
    { timeout: 17000 },
  )
  await expect(inspector).toContainText("Chair " + chair + " sensor: someone's in this seat")
  await expect(inspector.locator('.chair-tabs [aria-pressed="true"]')).toContainText('Taken')
  await page.screenshot({
    path: testInfo.outputPath('dashboard.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: /^Seat 92,/ }).click()
  await expect(page.getByRole('heading', { name: 'Seat 92' })).toBeVisible()
  await page.getByRole('button', { name: "It's free", exact: true }).click()
  const panelStatus = page.locator('.inspector').getByRole('status')
  await expect(panelStatus).toHaveText(
    'Thanks! Seat 92 marked free.',
  )
  await page.goto(roomUrl + '&spot=I091&checkin=1')
  await expect(page.getByRole('heading', { name: 'Seat 91' })).toBeVisible()
  await page
    .getByRole('button', { name: 'Check in to this seat', exact: true })
    .click()
  await expect(panelStatus).toContainText('Checked in at Seat 91. Held until')
  await page
    .locator('.inspector')
    .getByRole('button', { name: 'Check out', exact: true })
    .click()
  await expect(panelStatus).toContainText('Checked out of Seat 91.')
  await mobile.close()
  await mobileBrowser.close()
})
test('Live floor contains no demonstration fixtures', async ({ page }) => {
  await page.goto('./#floor=8')
  await expect(page.getByLabel('Floor data mode')).toHaveValue('live')
  await page.getByRole('button', { name: 'Data sources', exact: true }).click()
  await expect(page.locator('.source-cards')).not.toContainText(/Simulated|Demo/)
})
