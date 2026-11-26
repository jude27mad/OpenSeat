import { expect, test } from '@playwright/test'


const relay = /^https:\/\/openseat-classroom-relay\.[^/]+\/(?:status|watch)$/
test('classroom reads the shared count after switching apps without a token', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let scan = null
  await page.route(relay, route => route.fulfill({ json: { listening: true, scan } }))
  await page.goto('./')
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  const link = page.getByRole('link', { name: 'Classroom demo' })
  await expect(link).toBeVisible()
  expect(await link.evaluate((el) => el.previousElementSibling.textContent)).toMatch(/Share this map/)
  await link.click()
  await expect(page.getByRole('heading', { name: 'Classroom count' })).toBeVisible()
  await expect(page.getByLabel('Scanner section')).toHaveCount(0)
  await expect(page.getByLabel('flespi read token')).toHaveCount(0)
  await expect(page.getByText('Listening for scan')).toBeVisible()
  await expect(page.getByText('No count yet')).toHaveCount(1)
  const update = async value => {
    scan = {value, measuredAt: Date.now()}
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  }
  await update(22)
  await expect(page.getByText('10 to 22 estimated people', {exact:true})).toHaveCount(1)
  await page.reload()
  await expect(page.getByText('10 to 22 estimated people', {exact:true})).toHaveCount(1)
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.getByText('Listening for scan')).toBeVisible()
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/status')),
    page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))),
  ])
  await expect(page.getByText('No count yet')).toHaveCount(1)
  await update(1)
  await expect(page.getByText('1 estimated person', {exact:true})).toHaveCount(1)
  await update(30)
  await expect(page.getByText('14 to 30 estimated people', {exact:true})).toHaveCount(1)
  await update(0)
  await expect(page.getByText('0 estimated people', {exact:true})).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

// Pixels between the ring's inner edge and the nearest corner of the count or its label.
const ringClearance = dial => {
  const ring = dial.querySelector('svg').getBoundingClientRect()
  const centreX = ring.x + ring.width / 2, centreY = ring.y + ring.height / 2
  // The inner edge is 101 of the drawing's 240 units from the centre.
  const inner = ring.width * 101 / 240
  return Math.min(...[...dial.querySelectorAll('.dial-number, .dial-label')].flatMap(element => {
    const box = element.getBoundingClientRect()
    return [box.left, box.right].flatMap(x => [box.top, box.bottom].map(y =>
      inner - Math.hypot(x - centreX, y - centreY)))
  }))
}

// The count first left the ring in another browser, so CI measures it in WebKit as well.
// Set OPENSEAT_PHONE_ENGINE=chromium where WebKit is unavailable.
for (const engine of new Set(['chromium', process.env.OPENSEAT_PHONE_ENGINE || 'webkit'])) {
  test(`the count stays inside the ring on projector, laptop and phone screens in ${engine}`, async ({ playwright, baseURL }) => {
    const browser = await playwright[engine].launch()
    try {
      const page = await browser.newPage({ baseURL, reducedMotion: 'reduce' })
      let scan = null
      await page.route(relay, route => route.fulfill({ json: { listening: true, scan } }))
      await page.goto('./classroom/')
      await expect(page.getByText('Listening for scan')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      let measuredAt = Date.now()
      for (const enlarged of [false, true]) {
        // Safari can enlarge small text to a minimum font size. A larger label stands in for that here.
        if (enlarged) await page.addStyleTag({ content: '.dial-label { font-size: 30px !important }' })
        for (const [width, height] of [[1920, 1080], [1366, 650], [1280, 620], [1280, 550], [1024, 600], [390, 844], [320, 568]]) {
          await page.setViewportSize({ width, height })
          for (const [value, count] of [[1, '1'], [22, '10–22'], [100, '46–100'], [1000, '455–1000']]) {
            scan = { value, measuredAt: ++measuredAt }
            await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
            await expect(page.locator('.dial-number')).toHaveText(count)
            expect(await page.locator('.count-dial').evaluate(ringClearance),
              `${count} at ${width}×${height}${enlarged ? ' with enlarged text' : ''}`).toBeGreaterThan(0)
          }
        }
      }
    } finally {
      await browser.close()
    }
  })
}

test('projector layout opens from the desktop menu and fits the count on screen', async ({ page }, testInfo) => {
  await page.route(relay, route => route.fulfill({json:{listening:true, scan:null}}))
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./')
  await page.getByRole('link', { name: 'Classroom demo' }).click()
  await expect(page.getByRole('heading', { name: 'Classroom count' })).toBeVisible()
  const panel = await page.locator('.count-panel').boundingBox()
  expect(panel.y).toBeGreaterThanOrEqual(0)
  expect(panel.y + panel.height).toBeLessThanOrEqual(800)
  await expect(page.getByText('Ready for your phone')).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('classroom-projector.png') })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Classroom count' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to map' }).click()
  await expect(page.getByRole('heading', { name: 'Floor overview' })).toBeVisible()
})
