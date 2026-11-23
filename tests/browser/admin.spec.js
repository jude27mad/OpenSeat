import { test, expect } from '@playwright/test'
import { databaseRequest } from '../../backend/firebase/observations.js'
import { localSettings } from '../../backend/firebase/settings.js'

test('floor controls require device approval', async ({ page }) => {
  await page.goto('./admin/')
  await expect(page.getByRole('heading', { name: 'Floor controls' })).toBeVisible()
  await expect(page.getByLabel('Device ID')).toHaveValue(/.+/)
  await expect(page.getByRole('link', { name: 'Approve this browser on GitHub' })).toHaveAttribute('href', /admin-device\.yml$/)
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mark all free' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mark all taken' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Clear all statuses' })).toHaveCount(0)
})

test('an approved browser can reset its selected demo and loses access after revocation', async ({ page }) => {
  test.skip(process.env.OPENSEAT_TEST_URL && process.env.VITE_OPENSEAT_EMULATORS !== '1',
    'Device approval is granted only in the local emulator.')
  await page.goto('./admin/')
  const deviceId = page.getByLabel('Device ID')
  await expect(deviceId).toHaveValue(/.+/)
  const uid = await deviceId.inputValue()
  async function approve(value) {
    const result = await databaseRequest(localSettings, true, '/private/adminDevices/' + uid, undefined, {
      method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(value),
    })
    expect(result.ok).toBe(true)
  }
  try {
    await approve(true)
    await page.getByLabel('Floor', { exact: true }).selectOption('5')
    const map = page.getByRole('link', { name: 'Open this demo' })
    await expect(map).toHaveAttribute('href', /demo=.*level=5/)
    const mapUrl = new URL(await map.getAttribute('href'), page.url())
    const room = new URLSearchParams(mapUrl.hash.slice(1)).get('demo')
    const readStatus = async () => (await databaseRequest(localSettings, true,
      '/rooms/' + room + '/events/floorAdmin/status')).json()

    page.once('dialog', (dialog) => dialog.dismiss())
    await page.getByRole('button', { name: 'Mark all free' }).click()
    expect(await readStatus()).toBe(null)

    for (const [button, status] of [['Mark all free', 'free'], ['Mark all taken', 'occupied'], ['Clear all statuses', 'unknown']]) {
      page.once('dialog', async (dialog) => {
        expect(dialog.message()).toContain('166 seats on Floor 5 · demo')
        await dialog.accept()
      })
      await page.getByRole('button', { name: button }).click()
      await expect(page.getByRole('status')).toContainText('All 166 seats set')
      await expect.poll(async () => (await readStatus())?.value).toBe(status)
    }
  } finally {
    await approve(null)
  }
  await expect(deviceId).toHaveValue(uid)
  await expect(page.getByRole('button', { name: 'Mark all free' })).toHaveCount(0)
})
