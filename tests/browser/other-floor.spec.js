import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { databaseRequest } from '../../backend/firebase/observations.js'
import { localSettings } from '../../backend/firebase/settings.js'

// These fixtures are written only to the local emulator. The published-site
// smoke tests run against real rooms and use the regular public demo flows.
test.skip(Boolean(process.env.OPENSEAT_TEST_URL) && process.env.VITE_OPENSEAT_EMULATORS !== '1',
  'The cross-floor fixtures require the local Firebase emulator.')

function seed(room, path, value) {
  return databaseRequest(localSettings, true, '/rooms/' + room + '/events/' + path, undefined, {
    method: 'PUT',
    headers: { Authorization: 'Bearer owner' },
    body: JSON.stringify(value),
  }).then((res) => expect(res.ok).toBe(true))
}

for (const width of [390, 1280]) {
  test('offers current openings on another live floor at width ' + width, async ({ page }) => {
    const id = randomUUID()
    const time = Date.now()
    const clear = { id: randomUUID(), value: 'unknown', at: time }
    const free = { id, at: time + 1, value: 'free', simulated: false }
    try {
      // Rules tests share the emulator and may already have reported seats here.
      await seed('floor5', 'floorAdmin/status', clear)
      await seed('floor7', 'floorAdmin/status', clear)
      await seed('floor7', 'report/I195', free)
      await page.setViewportSize({ width, height: 844 })
      await page.goto('./#floor=5')
      const link = page.getByRole('link', { name: /View Floor 7 · \d+ seats? reported free/ })
      await expect(link).toBeVisible()
      // The same target becomes unavailable when its sensor reports it occupied.
      await seed('floor7', 'sensor/I195', { ...free, value: 'occupied' })
      await expect(link).toHaveCount(0)
      await seed('floor7', 'sensor/I195', null)
      await link.click()
      await expect(page).toHaveURL(/#floor=7$/)
      await expect(page.getByRole('button', { name: 'Find me a free seat' })).toBeVisible()
      await expect(page.getByRole('note')).toHaveCount(0)
    } finally {
      await seed('floor5', 'floorAdmin/status', null)
      await seed('floor7', 'floorAdmin/status', null)
      await seed('floor7', 'report/I195', null)
      await seed('floor7', 'sensor/I195', null)
    }
  })
}

test('an empty demo links to the same demo floor that supplied its opening count', async ({ page }) => {
  const current = randomUUID(), destination = randomUUID(), now = Date.now()
  await page.addInitScript(({ destination, now }) => {
    localStorage.setItem('openseat.room.v1.f7', JSON.stringify({ id: destination, anchor: now }))
  }, { destination, now })
  try {
    const clear = { id: randomUUID(), value: 'unknown', at: now - 12000 }
    await seed(current, 'floorAdmin/status', clear)
    await seed(destination, 'floorAdmin/status', clear)
    await seed(destination, 'report/I195', { id: randomUUID(), value: 'free', at: now, simulated: true })
    await page.goto('./#demo=' + current + '&start=' + now + '&level=5')
    const link = page.getByRole('link', { name: 'View Floor 7 · 1 seat free in demo' })
    await expect(link).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(new RegExp('demo=' + destination + '&start=' + now + '&level=7$'))
    await expect(page.getByRole('note')).toContainText('Demo with example data')
    await expect(page.locator('.metric strong').first()).toHaveText('1')
  } finally {
    await seed(current, 'floorAdmin/status', null)
    await seed(destination, 'floorAdmin/status', null)
    await seed(destination, 'report/I195', null)
  }
})
