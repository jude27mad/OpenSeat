import { expect, test } from '@playwright/test'
import mqttPacket from 'mqtt-packet'

const topic = 'ble/data/cen100-iphone-01'

test('classroom demo listens on its own page and holds one estimate per scan', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let publish
  let allow = false
  await page.routeWebSocket('wss://mqtt.flespi.io/**', (socket) => {
    const parser = mqttPacket.parser()
    const send = (packet) => socket.send(mqttPacket.generate(packet))
    parser.on('packet', (packet) => {
      if (packet.cmd === 'connect') send({ cmd: 'connack', returnCode: 0 })
      if (packet.cmd === 'subscribe') {
        expect(packet.subscriptions[0].topic).toBe(topic)
        send({ cmd: 'suback', messageId: packet.messageId, granted: [allow ? 0 : 128] })
        publish = (rows, retain = false) => send({
          cmd: 'publish', qos: 0, topic, retain, payload: JSON.stringify(rows),
        })
      }
    })
    socket.onMessage((data) => parser.parse(Buffer.from(data)))
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  const link = page.getByRole('link', { name: 'Classroom demo' })
  await expect(link).toBeVisible()
  expect(await link.evaluate((el) => el.previousElementSibling.textContent)).toMatch(/Share this map/)
  await link.click()
  await expect(page.getByRole('heading', { name: 'Classroom count' })).toBeVisible()
  await expect(page.getByLabel('Scanner section')).toHaveCount(0)
  await page.getByLabel('flespi read token').fill('test-only')
  const connect = page.getByRole('button', { name: 'Connect scanner' })
  await connect.click()
  await expect(page.getByText('Subscription refused.', { exact: false })).toBeVisible()
  allow = true
  await connect.click()
  await expect(page.getByText('Listening for scan')).toBeVisible()
  const reading = (addr, rssi = -75) => ({ addr, rssi, measuredAt: Date.now() })
  publish([reading('old')], true)
  publish([{ ...reading('stale'), measuredAt: Date.now() - 300000 }])
  await expect(page.getByText('No count yet')).toHaveCount(1)
  const rows = Array.from({ length: 22 }, (_, i) => reading('device-' + i))
  publish([...rows, rows[0], reading('weak', -76)])
  await expect(page.getByText('10 estimated people', { exact: true })).toHaveCount(1)
  await expect(page.locator('.count-stats dd').first()).toHaveText('22')
  await page.getByRole('button', { name: 'Take another scan' }).click()
  await expect(page.getByText('Listening for scan')).toBeVisible()
  publish([reading('weak', -76)])
  await expect(page.getByText('0 estimated people', { exact: true })).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('projector layout opens from the desktop menu and fits the count on screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./')
  await page.getByRole('link', { name: 'Classroom demo' }).click()
  await expect(page.getByRole('heading', { name: 'Classroom count' })).toBeVisible()
  const panel = await page.locator('.count-panel').boundingBox()
  expect(panel.y).toBeGreaterThanOrEqual(0)
  expect(panel.y + panel.height).toBeLessThanOrEqual(800)
  await expect(page.getByRole('button', { name: 'Connect scanner' })).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('classroom-projector.png') })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Classroom count' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to map' }).click()
  await expect(page.getByRole('heading', { name: 'Floor overview' })).toBeVisible()
})
