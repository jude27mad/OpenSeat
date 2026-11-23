import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { HOUR, cleanup, cleanupReportLimits, emulatorClient } from '../../backend/firebase/cleanup.mjs'

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
      [recent]: { events: { report: { I001: event(now - 30 * HOUR) }, sensor: { I002: event(now - 60000) } } },
      // A room with no readings at all, like an old room that only kept check-in owners.
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

test('expired private reporting limits are deleted unless a browser reported again', async () => {
  const request = emulatorClient()
  const root = '/private/reportLimits'
  const now = Date.now()
  const expired = randomUUID(), active = randomUUID(), changed = randomUUID()
  const ledger = (at) => ({ latest: { id: randomUUID(), at, spot: 'floor5/I001', value: 'free' } })
  const fresh = ledger(now), old = ledger(now - 25 * HOUR)
  await request(root, { method: 'PATCH', body: { [expired]: old, [active]: fresh, [changed]: old } })
  try {
    const opts = { request, now, log: () => {} }
    await cleanupReportLimits({ ...opts, dryRun: true })
    assert.deepEqual(await request(root + '/' + expired), old)
    // A report arrives after the candidate was re-read and before deletion.
    const racingRequest = async (path, options) => {
      if (path === root + '/' + changed && options?.method === 'DELETE')
        await request(path, { method: 'PUT', body: fresh })
      return request(path, options)
    }
    await cleanupReportLimits({ ...opts, request: racingRequest })
    assert.equal(await request(root + '/' + expired), null)
    assert.deepEqual(await request(root + '/' + active), fresh)
    assert.deepEqual(await request(root + '/' + changed), fresh)
  } finally {
    await request(root, { method: 'PATCH', body: { [expired]: null, [active]: null, [changed]: null } })
  }
})
