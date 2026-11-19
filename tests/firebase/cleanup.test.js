import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { HOUR, cleanup, emulatorClient } from '../../backend/firebase/cleanup.mjs'

test('demo rooms idle for over a day are deleted; recent rooms and the live floor stay', async () => {
  const request = emulatorClient()
  const now = Date.now(),
    idle = randomUUID(),
    recent = randomUUID(),
    empty = randomUUID()
  const event = (at) => ({ id: randomUUID(), at, value: 'free', simulated: true })
  await request('/rooms', {
    method: 'PATCH',
    body: {
      [idle]: { events: { report: { I001: event(now - 30 * HOUR) } } },
      // An old report does not count against a room someone used a minute ago.
      [recent]: { events: { report: { I001: event(now - 30 * HOUR) }, qr: { I002: event(now - 60000) } } },
      [empty]: { owners: { I003: { uid: 'someone', id: randomUUID() } } },
    },
  })
  await request('/rooms/floor8/events/report/I004', { method: 'PUT', body: event(now - 30 * HOUR) })
  await request('/rooms/floor5/events/report/I120', { method: 'PUT', body: event(now - 30 * HOUR) })
  await request('/rooms/floor7/events/report/I190', { method: 'PUT', body: event(now - 30 * HOUR) })
  const exists = async (id) => (await request('/rooms/' + id, { query: { shallow: 'true' } })) !== null

  const preview = await cleanup({ request, now, dryRun: true, log: () => {} })
  assert.ok(preview.deleted.includes(idle))
  assert.ok(await exists(idle), 'a dry run deletes nothing')

  const result = await cleanup({ request, now, log: () => {} })
  assert.ok(result.deleted.includes(idle))
  assert.ok(result.deleted.includes(empty))
  assert.ok(!result.deleted.includes(recent))
  assert.ok(!result.deleted.includes('floor8'))
  assert.ok(!result.deleted.includes('floor5'))
  assert.ok(!result.deleted.includes('floor7'))
  assert.equal(await exists(idle), false)
  assert.equal(await exists(empty), false)
  assert.equal(await exists(recent), true)
  assert.equal(await exists('floor8'), true)
  assert.equal(await exists('floor5'), true)
  assert.equal(await exists('floor7'), true)
})
