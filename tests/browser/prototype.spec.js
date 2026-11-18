import { test, expect, devices } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { PNG } from 'pngjs'
import jsQR from 'jsqr'
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
test('Floor inventory, filter and independent mobile QR session use all four sources', async ({
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
  await page.getByRole('button', { name: 'Find a seat' }).click()
  await expect(page.locator('.list-location').first()).toContainText(
    /available/i,
  )
  await page.locator('.list-location').first().click()
  await expect(page.locator('.seat-reading .status')).toHaveText('Available')
  await page.getByRole('button', { name: 'Floor overview' }).click()
  await page.getByRole('button', { name: /^Table 17,/ }).click()
  await page.getByRole('button', { name: 'Show table QR code' }).click()
  const img = page.getByRole('img', { name: 'QR code for Table 17' })
  await expect(img).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('table-qr.png'), animations: 'disabled' })
  const png = PNG.sync.read(
    Buffer.from((await img.getAttribute('src')).split(',')[1], 'base64'),
  )
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
  expect(decoded.data).toContain('spot=T17')
  expect(decoded.data).toContain('checkin=1')
  const mobileBrowser = await playwright.webkit.launch()
  const mobile = await mobileBrowser.newContext({
    ...devices['iPhone 13'],
    baseURL,
  })
  const phone = await mobile.newPage()
  observeService(phone, 'mobile')
  await phone.goto(decoded.data)
  await phone.getByRole('button', { name: /^Chair B,/ }).click()
  await expect(
    phone.getByRole('button', { name: 'Check in', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: /^Chair B,/ }).click()
  await expect(page.locator('.sync')).toHaveText('Connected', {
    timeout: 25000,
  })
  await expect(phone.locator('.sync')).toHaveText('Connected', {
    timeout: 25000,
  })
  const t = Date.now()
  await phone.getByRole('button', { name: 'Check in', exact: true }).click()
  await expect(page.locator('.inspector .origin').first()).toContainText(
    /^QR check-in ·/,
    { timeout: 10000 },
  )
  await expect(page.locator('.seat-reading .status')).toHaveText('Occupied')
  console.log(
    'QR check-in propagated to independent browser in ' +
      (Date.now() - t) +
      ' ms',
  )
  await page.getByRole('button', { name: 'Free', exact: true }).click()
  await expect(phone.locator('.seat-reading .status')).toHaveText(
    'Conflicting',
    { timeout: 10000 },
  )
  await phone.getByRole('button', { name: 'Check out', exact: true }).click()
  await expect(page.locator('.seat-reading .status')).toHaveText('Available', {
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
  await page.getByRole('button', { name: 'Data sources', exact: true }).click()
  await page.getByRole('button', { name: 'Device inputs' }).click()
  await page.getByRole('button', { name: 'Simulate in use' }).click()
  await expect(page.getByRole('status')).toContainText(
    'Simulated sensor reading saved.',
    { timeout: 17000 },
  )
  await page.getByRole('button', { name: 'Bluetooth', exact: true }).click()
  await page.getByText('Try a Bluetooth reading').click()
  await page.getByLabel('Simulated nearby devices').fill('37')
  await page.getByRole('button', { name: 'Apply demo count' }).click()
  await expect(page.getByRole('status')).toContainText(
    'Simulated section count saved.',
    { timeout: 17000 },
  )
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('.activity')).toContainText('37 devices')
  await page.getByRole('button', { name: 'Floor overview' }).click()
  await expect(
    page.locator('.metric').filter({ hasText: 'Nearby devices' }),
  ).toContainText('37')
  await expect(page.locator('.inspector')).toContainText('Table in use')
  await page.screenshot({
    path: testInfo.outputPath('dashboard.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: /^Seat 92,/ }).click()
  await page.getByRole('button', { name: 'Free', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Report saved for Seat 92.')
  await page.goto(roomUrl + '&spot=I091&checkin=1')
  await expect(page.getByRole('heading', { name: 'Seat 91' })).toBeVisible()
  await page.getByRole('button', { name: 'Check in', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Checked in at Seat 91.')
  await page.getByRole('button', { name: 'Check out', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Checked out of Seat 91.')
  await mobile.close()
  await mobileBrowser.close()
})
test('Live floor contains no demonstration fixtures', async ({ page }) => {
  await page.goto('./#floor=8')
  await expect(page.getByLabel('Floor data mode')).toHaveValue('live')
  await page.getByRole('button', { name: 'Data sources', exact: true }).click()
  await expect(page.locator('.source-cards')).not.toContainText('Simulated')
})
