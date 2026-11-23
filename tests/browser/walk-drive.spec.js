import { expect, test } from '@playwright/test'

test('Walk & Drive opens from the demo menu and pauses both journeys', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('./')
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  const link = page.getByRole('link', { name: 'Walk & Drive' })
  expect(await link.evaluate((el) => [
    el.previousElementSibling.textContent.trim(),
    el.nextElementSibling.textContent.trim(),
  ])).toEqual(['Start the demo again', 'Prototype evidence'])
  await link.click()
  await expect(page.getByRole('heading', { name: 'Walk & Drive' })).toBeVisible()
  await page.getByRole('button', { name: 'Pause animation' }).click()
  const journey = page.locator('#journey')
  expect(await journey.evaluate((el) => {
    const svg = el.contentDocument.rootElement
    return svg.animationsPaused() && ['.walker-trip', '.car-trip'].every((selector) => {
      const actor = svg.querySelector(selector)
      return el.contentWindow.getComputedStyle(actor).animationPlayState === 'paused'
    })
  })).toBe(true)
  await page.getByRole('button', { name: 'Resume animation' }).click()
  expect(await journey.evaluate((el) => el.contentDocument.rootElement.animationsPaused())).toBe(false)
})

test('the phone comparison is centered, uses the map theme and shows the faster drive', async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 860 })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'no-preference' })
  await page.addInitScript(() => localStorage.setItem('openseat.theme', 'light'))
  await page.goto('./walk-drive/')
  await page.getByRole('button', { name: 'Pause animation' }).click()

  const card = await page.locator('.journey-card').boundingBox()
  const stage = await page.locator('main').boundingBox()
  expect(Math.abs(card.x * 2 + card.width - 440)).toBeLessThan(2)
  expect(Math.abs(card.y + card.height / 2 - (stage.y + stage.height / 2))).toBeLessThan(2)
  const samples = await page.locator('#journey').evaluate(el => {
    const svg = el.contentDocument.rootElement
    function travelAt(ms) {
      return ['.walker-trip', '.car-trip'].map(selector => {
        const actor = svg.querySelector(selector)
        actor.getAnimations()[0].currentTime = ms
        return new DOMMatrix(el.contentWindow.getComputedStyle(actor).transform).e
      })
    }
    return { theme: svg.dataset.theme, threeSecondsIn: travelAt(3500), finish: travelAt(14500) }
  })
  expect(samples.theme).toBe('light')
  const [walker, car] = samples.threeSecondsIn
  expect(walker).toBeGreaterThan(0)
  expect(walker).toBeLessThan(car)
  expect(car).toBeCloseTo(samples.finish[1], 1)
  expect(samples.finish[0]).toBeCloseTo(car, 1)
})
