import { test, expect } from '@playwright/test'
import { createHash, randomInt } from 'node:crypto'
import { databaseRequest } from '../../backend/firebase/observations.js'
import { localSettings } from '../../backend/firebase/settings.js'

test('floor controls open with a PIN prompt', async ({ page }) => {
  await page.goto('./admin/')
  await expect(page.getByRole('heading', { name: 'Floor controls' })).toBeVisible()
  await expect(page.getByLabel('Admin PIN')).toHaveAttribute('type', 'password')
  await expect(page.getByRole('button', { name: 'Unlock', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mark all taken' })).toHaveCount(0)
})

test('a PIN unlocks floor controls on a fresh browser and locking removes access', async ({ page, browser }) => {
  test.skip(process.env.OPENSEAT_TEST_URL && process.env.VITE_OPENSEAT_EMULATORS !== '1',
    'PIN fixtures and floor changes require the local Firebase emulator.')
  const pin = String(randomInt(1e12)).padStart(12, '0')
  const proof = createHash('sha256').update('OpenSeat admin PIN v1:' + pin).digest('hex')
  const credentialPath = '/private/adminPin/proof'
  const markerPath = (id) => '/rooms/' + id + '/events/floorAdmin/status'
  const livePaths = [5, 7, 8].map((n) => markerPath('floor' + n))

  async function read(path) {
    const res = await databaseRequest(localSettings, true, path, undefined, { headers: { Authorization: 'Bearer owner' } })
    expect(res.ok).toBe(true)
    return res.json()
  }
  async function seed(path, data) {
    const res = await databaseRequest(localSettings, true, path, undefined, {
      method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(data),
    })
    expect(res.ok).toBe(true)
  }

  const paths = [credentialPath, ...livePaths]
  const previous = await Promise.all(paths.map(read))
  const other = await browser.newContext()
  try {
    await seed(credentialPath, proof)
    const wrong = await other.newPage()
    await page.goto('./admin/')
    await wrong.goto(page.url())
    const differentPin = (pin[0] === '0' ? '1' : '0') + pin.slice(1)
    await wrong.getByLabel('Admin PIN').fill(differentPin)
    await wrong.getByRole('button', { name: 'Unlock', exact: true }).click()
    await expect(wrong.getByRole('alert')).toContainText(/incorrect pin/i)
    await expect(wrong.getByRole('button', { name: 'Mark all taken' })).toHaveCount(0)

    await page.getByLabel('Admin PIN').fill(pin)
    await page.getByRole('button', { name: 'Unlock', exact: true }).click()
    const floor = page.getByLabel('Floor', { exact: true })
    await expect(floor).toBeVisible()
    await page.reload()
    await floor.selectOption('5')
    const map = page.getByRole('link', { name: 'Open this demo' })
    const mapUrl = new URL(await map.getAttribute('href'), page.url())
    const room = new URLSearchParams(mapUrl.hash.slice(1)).get('demo')

    page.once('dialog', (dialog) => dialog.dismiss())
    await page.getByRole('button', { name: 'Mark all free' }).click()
    expect(await read(markerPath(room))).toBe(null)

    for (const [button, status] of [['Mark all free', 'free'], ['Mark all taken', 'occupied'], ['Clear all statuses', 'unknown']]) {
      page.once('dialog', async (dialog) => {
        expect(dialog.message()).toContain('166 seats on Floor 5 · demo')
        await dialog.accept()
      })
      await page.getByRole('button', { name: button }).click()
      await expect.poll(async () => (await read(markerPath(room)))?.value).toBe(status)
    }

    await page.getByLabel('Map', { exact: true }).selectOption('live')
    await floor.selectOption({ label: 'All three floors' })
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('626 seats on live Floors 5, 7 and 8')
      await dialog.accept()
    })
    await page.getByRole('button', { name: 'Mark all taken' }).click()
    await expect(page.getByRole('status')).toContainText('All 626 seats set to “Taken”')
    const markers = await Promise.all(livePaths.map(read))
    expect(markers.map((m) => m.value)).toEqual(['occupied', 'occupied', 'occupied'])
    expect(new Set(markers.map((m) => m.at)).size).toBe(1)

    await page.getByRole('button', { name: 'Lock this browser' }).click()
    await expect(page.getByLabel('Admin PIN')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mark all taken' })).toHaveCount(0)
  } finally {
    await other.close()
    await Promise.all(paths.map((path, i) => seed(path, previous[i])))
  }
})
