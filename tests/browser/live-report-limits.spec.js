import { expect, test } from '@playwright/test'
import { emulatorClient } from '../../backend/firebase/cleanup.mjs'

test('live map limits follow a browser across floors and count a whole table once', async ({ page, baseURL }) => {
  test.skip(process.env.VITE_OPENSEAT_EMULATORS !== '1' || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname),
    'This test writes only to the local emulator-backed map.')
  const db = emulatorClient()
  const table = ['A', 'B', 'C', 'D'].map((chair) => '/rooms/floor8/events/report/T35-' + chair)
  const second = '/rooms/floor5/events/report/I150'
  const third = '/rooms/floor7/events/report/I150'
  const paths = [...table, second, third]
  const previous = await Promise.all(paths.map((path) => db(path)))
  const press = (name) => page.getByRole('button', { name, exact: true }).click()
  const feedback = page.locator('.inspector .toast-region')
  await page.setViewportSize({ width: 1280, height: 800 })
  try {
    await Promise.all(paths.map((path) => db(path, { method: 'DELETE' })))
    await page.goto('./#floor=8&spot=T35-A')
    await press('All free')
    await expect(feedback).toContainText(/marked free/i)
    const rows = await Promise.all(table.map((path) => db(path)))
    expect(rows.map((r) => r.value)).toEqual(['free', 'free', 'free', 'free'])
    expect(new Set(rows.map((r) => r.id)).size).toBe(1)

    await press('All free')
    await expect(feedback).toContainText(/already/i)
    expect(await Promise.all(table.map((path) => db(path)))).toEqual(rows)

    await page.goto('./#floor=5&spot=I150')
    await press("It's taken")
    await expect(feedback).toContainText(/marked taken/i)

    await page.goto('./#floor=7&spot=I150')
    await press("It's free")
    await expect(feedback).toContainText(/2 (different )?spots/i)
    expect(await db(third)).toBeNull()

    await page.goto('./#floor=8&spot=T35-A')
    await press("It's taken")
    await expect(feedback).toContainText(/marked taken/i)
    expect((await db(table[0])).value).toBe('occupied')

    await page.goto('./#floor=5&spot=I150')
    await press("It's free")
    await expect(feedback).toContainText(/3 (live )?reports/i)
    expect((await db(second)).value).toBe('occupied')
  } finally {
    await Promise.all(paths.map((path, i) => db(path, { method: 'PUT', body: previous[i] })))
  }
})
