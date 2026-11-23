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
