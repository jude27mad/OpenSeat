import { test, expect, devices } from '@playwright/test'
import { createHash, randomInt } from 'node:crypto'
import { databaseRequest } from '../../backend/firebase/observations.js'
import { emulatorClient } from '../../backend/firebase/cleanup.mjs'
import { localSettings } from '../../backend/firebase/settings.js'

test('turning OpenSeat off and back on reaches existing tabs and counts waiting visitors', async ({ page, browser, playwright, baseURL }) => {
  test.skip(process.env.VITE_OPENSEAT_EMULATORS !== '1' || !!process.env.OPENSEAT_TEST_URL,
    'The website switch is exercised only on the local emulator.')
  const request = emulatorClient()
  const pinPath = '/private/adminPin/proof'
  const previous = await request(pinPath)
  const pin = String(randomInt(1_000_000)).padStart(6, '0')
  const guests = await browser.newContext({ baseURL })
  const phone = await playwright[process.env.OPENSEAT_PHONE_ENGINE || 'webkit'].launch()
  const secondGuest = await phone.newContext({ ...devices['iPhone 13'], baseURL })
  const visitorCount = page.locator('.admin-visitor-count strong')
  const closed = (tab) => tab.getByRole('heading', { name: 'Even the website couldn’t find a seat.' })
  try {
    await request(pinPath, {
      method: 'PUT', body: createHash('sha256').update('OpenSeat admin PIN v1:' + pin).digest('hex'),
    })
    await page.goto('./admin/')
    await page.getByLabel('Admin PIN').fill(pin)
    await page.getByRole('button', { name: 'Unlock', exact: true }).click()
    await expect(visitorCount).toHaveText('0 online')
    const student = await guests.newPage()
    const evidence = await guests.newPage()
    await Promise.all([student.goto('./#floor=7&spot=I009'), evidence.goto('./evidence/#verification')])
    await expect(student.getByRole('heading', { name: 'Seat 09', exact: true })).toBeVisible()
    const seatUrl = student.url()
    const verification = evidence.getByRole('heading', { name: 'Verification', exact: true })
    await expect(verification).toBeVisible()
    await expect(visitorCount).toHaveText('1 online')

    await page.getByRole('button', { name: 'Turn off OpenSeat' }).click()
    const turnOn = page.getByRole('button', { name: 'Turn on OpenSeat' })
    await expect(turnOn).toBeVisible()
    await expect(closed(student)).toBeVisible()
    await expect(closed(evidence)).toBeVisible()
    await expect(visitorCount).toHaveText('1 waiting')
    await expect(verification).toHaveCount(0)
    await page.reload()
    await expect(turnOn).toBeVisible()
    const ownerMap = await page.context().newPage()
    await ownerMap.goto(seatUrl)
    await expect(ownerMap.getByRole('heading', { name: 'Seat 09', exact: true })).toBeVisible()

    const direct = await secondGuest.newPage()
    for (const route of ['./admin/', './classroom/', './walk-drive/', './evidence/', seatUrl]) {
      await direct.goto(route)
      await expect(closed(direct)).toBeVisible()
      await expect(direct.getByText('OpenSeat · Error 503')).toBeVisible()
      await expect(direct.getByRole('button')).toHaveCount(0)
    }
    await expect(visitorCount).toHaveText('2 waiting')
    await page.getByRole('button', { name: 'Turn on OpenSeat' }).click()
    await expect(page.getByRole('button', { name: 'Turn off OpenSeat' })).toBeVisible()
    await expect(student.getByRole('heading', { name: 'Seat 09', exact: true })).toBeVisible()
    await expect(student).toHaveURL(seatUrl)
    await expect(verification).toBeInViewport()
    await expect(closed(direct)).toHaveCount(0)
    await expect(visitorCount).toHaveText('2 online')
    await student.close()
    await expect(visitorCount).toHaveText('2 online')
    await evidence.close()
    await expect(visitorCount).toHaveText('1 online')
    await direct.goto('about:blank')
    await expect(visitorCount).toHaveText('0 online')
    await direct.goBack()
    await expect(visitorCount).toHaveText('1 online')
    await direct.close()
    await expect(visitorCount).toHaveText('0 online')
  } finally {
    await request('/siteClosure', { method: 'DELETE' })
    await request(pinPath, { method: 'PUT', body: previous })
    await Promise.all([guests.close(), phone.close()])
  }
})

for (const width of [390, 820, 1280]) {
  test('the last menu item opens the locked admin page at width ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('./')
    let menu = page.locator('.sidebar')
    if (width === 390) {
      await page.getByRole('button', { name: 'Menu', exact: true }).click()
      menu = page.getByRole('dialog', { name: 'Menu' })
    } else if (width === 820) {
      await page.getByRole('button', { name: 'Open navigation' }).click()
    }
    const lastItem = menu.locator('a, button, select').last()
    await expect(lastItem).toHaveAccessibleName('Admin')
    await lastItem.click()
    await expect(page).toHaveURL(/\/admin\/$/)
    await expect(page.getByRole('heading', { name: 'Floor controls' })).toBeVisible()
    await expect(page.getByLabel('Admin PIN')).toHaveAttribute('type', 'password')
    await expect(page.getByRole('button', { name: 'Unlock', exact: true })).toBeVisible()
    await expect(page.getByRole('combobox')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Mark all taken' })).toHaveCount(0)
    await expect(page.getByText('Live visitors')).toHaveCount(0)
  })
}

test('a PIN unlocks floor controls on a fresh browser and locking removes access', async ({ page, browser }) => {
  test.skip(process.env.OPENSEAT_TEST_URL && process.env.VITE_OPENSEAT_EMULATORS !== '1',
    'PIN fixtures and floor changes require the local Firebase emulator.')
  // Exercise a leading zero through the input and the Firebase verifier.
  const pin = String(randomInt(100_000)).padStart(6, '0')
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
    const differentPin = '1' + pin.slice(1)
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
