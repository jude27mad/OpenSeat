import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'

test('desktop sidebar restores the starting seats on the selected demo floor', async ({ page }) => {
  const demo = randomUUID()
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./#demo=' + demo + '&start=' + Date.now() + '&level=5&spot=I001')
  const free = page.locator('.metric.green strong')
  const initialFree = Number(await free.innerText())
  expect(initialFree).toBeGreaterThan(0)
  await page.getByRole('button', { name: "It's taken", exact: true }).click()
  await expect(free).toHaveText(String(initialFree - 1))

  const reset = page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: 'Reset demo data' })
  await expect(reset).toBeInViewport()
  await expect(reset.locator('+ a')).toHaveText('Walk & Drive')
  await expect(page.getByRole('link', { name: 'Walk & Drive' })).toHaveCount(1)
  await reset.click()
  await expect(page.getByLabel('Floor', { exact: true })).toHaveValue('5')
  await expect(free).toHaveText(String(initialFree))
  expect(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('demo')).not.toBe(demo)
  await page.getByLabel('Floor data mode').selectOption('live')
  await expect(reset).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'Walk & Drive' })).toBeVisible()
})
