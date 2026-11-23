import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { adminPinProof, databaseRequest, digest, postObservation } from '../../backend/firebase/observations.js'
import { localSettings } from '../../backend/firebase/settings.js'

const room = randomUUID()
let a, b
async function anonymous() {
  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-openseat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
  })
  assert.equal(res.status, 200)
  const { idToken, localId } = await res.json()
  return { uid: localId, request: (path, options) => databaseRequest(localSettings, true, path, idToken, options) }
}
const read = (path) => databaseRequest(localSettings, true, path)
function seed(path, value) {
  return databaseRequest(localSettings, true, path, undefined, {
    method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(value),
  })
}
const record = (user, input, id = room) => postObservation({ ...user, room: id, input })
// OpenSeat no longer has QR check-ins. These writes must now be refused.
const qr = (value, target = 'T17-B') => ({ source: 'qr', target, value })
const report = (target, value) => ({ source: 'report', target, value })
before(async () => { [a, b] = await Promise.all([anonymous(), anonymous()]) })

test('two visitors share reports, and QR check-ins and owners are refused', async () => {
  await record(a, report('T17-B', 'occupied'))
  const free = await record(b, report('T17-B', 'free'))
  const events = await (await read('/rooms/' + room + '/events')).json()
  assert.equal(events.report['T17-B'].value, 'free')
  assert.deepEqual(Object.keys(events.report['T17-B']).sort(), ['at', 'id', 'lastFreeAt', 'simulated', 'value'])
  assert.equal(events.report['T17-B'].lastFreeAt, free.at)
  for (const value of ['occupied', 'free']) await assert.rejects(record(a, qr(value)), /declined/)
  // The old check-in write: an event and its owner saved together.
  const id = randomUUID()
  const checkIn = {
    ['events/qr/T17-B']: { id, value: 'occupied', simulated: false, at: { '.sv': 'timestamp' } },
    ['owners/T17-B']: { uid: a.uid, id },
  }
  assert.ok([401, 403].includes((await a.request('/rooms/' + room, { method: 'PATCH', body: JSON.stringify(checkIn) })).status))
  const owner = { method: 'PUT', body: JSON.stringify({ uid: a.uid, id }) }
  assert.ok([401, 403].includes((await a.request('/rooms/' + room + '/owners/T17-B', owner)).status))
  assert.equal((await (await read('/rooms/' + room + '/events/qr')).json()), null)
  for (const path of ['/rooms', '/rooms/' + room, '/rooms/' + room + '/owners/T17-B', '/private']) {
    assert.ok([401, 403].includes((await b.request(path)).status))
  }
})

test('a taken report keeps the time the seat was last reported free', async () => {
  const id = randomUUID()
  const cleared = await record(b, report('I030', 'free'), id)
  assert.equal(cleared.lastFreeAt, cleared.at)
  const occupied = await record(a, report('I030', 'occupied'), id)
  assert.equal(occupied.lastFreeAt, cleared.at)
  assert.equal((await record(b, report('I030', 'occupied'), id)).lastFreeAt, cleared.at)
  // The same works when the free report is older than 15 minutes.
  const older = Date.now() - 20 * 60000
  await seed('/rooms/' + id + '/events/report/I034', { id: randomUUID(), value: 'free', at: older, simulated: false })
  assert.equal((await record(b, report('I034', 'occupied'), id)).lastFreeAt, older)
})

test('reports can still be saved on installations running older rules', async () => {
  const oldSchema = randomUUID()
  const request = (path, options) => {
    if (options?.body && 'lastFreeAt' in JSON.parse(options.body))
      return Promise.resolve(new Response(null, { status: 403 }))
    return a.request(path, options)
  }
  const empty = await postObservation({ request, room: oldSchema, uid: a.uid, input: report('I003', 'free') })
  assert.equal(empty.value, 'free')
  assert.equal(empty.lastFreeAt, undefined)
})

test('a room with old check-ins still takes reports but no new check-ins', async () => {
  const oldRoom = randomUUID(), id = randomUUID()
  await seed('/rooms/' + oldRoom, {
    owners: { 'T17-B': { legacy: await digest(randomUUID()), id } },
    events: { qr: { 'T17-B': { id, at: Date.now() - 3000, value: 'occupied', simulated: false } } },
  })
  assert.equal((await record(a, report('T17-B', 'free'), oldRoom)).value, 'free')
  assert.equal((await record(b, report('T17-B', 'occupied'), oldRoom)).value, 'occupied')
  await assert.rejects(record(a, qr('free'), oldRoom), /declined/)
  await assert.rejects(record(b, qr('occupied'), oldRoom), /declined/)
  for (const floor of ['floor8', 'floor7', 'floor5']) {
    await assert.rejects(record(a, qr('occupied', floor === 'floor5' ? 'I001' : 'T01-A'), floor), /declined/)
  }
})

test('source, seat, scope, timestamps and read-only public data are enforced', async () => {
  for (const target of ['I091', 'I092']) {
    assert.equal((await record(b, report(target, 'free'))).value, 'free')
    assert.equal((await record(a, report(target, 'occupied'))).value, 'occupied')
    assert.equal((await record(a, { source: 'sensor', target, value: 'free', simulated: true })).value, 'free')
  }
  const invalid = [
    report('T41-A', 'free'), report('T00-B', 'occupied'), report('I197', 'free'),
    report('T01', 'free'), report('I001', 'other'), qr('occupied', 'I001'),
    { source: 'sensor', target: 'T17', value: 'occupied', simulated: true },
    { source: 'ble', target: 'I001', value: 1, simulated: true },
    { source: 'ble', target: 'tables', value: 1.5, simulated: true },
    { source: 'ble', target: 'tables', value: 10001, simulated: true },
  ]
  for (const input of invalid) await assert.rejects(record(a, input))
  await assert.rejects(record(a, report('I001', 'free'), 'another-floor'))
  const path = '/rooms/' + room + '/events/report/I001'
  const valid = { id: randomUUID(), at: { '.sv': 'timestamp' }, value: 'free', simulated: false }
  const put = (value) => a.request(path, { method: 'PUT', body: JSON.stringify(value) })
  assert.ok([401, 403].includes((await put({ ...valid, extra: 'disallowed' })).status))
  assert.ok([401, 403].includes((await put({ ...valid, at: Date.now() - 60000 })).status))
  assert.ok([401, 403].includes((await databaseRequest(localSettings, true, path, null, { method: 'PUT', body: JSON.stringify(valid) })).status))
  assert.equal((await put(valid)).status, 200)
  assert.ok([401, 403].includes((await a.request(path + '/value', { method: 'PUT', body: '"occupied"' })).status))
  assert.ok([401, 403].includes((await a.request(path, { method: 'DELETE' })).status))
})

test('Floor 5 takes its own 166 seats and no tables, and a demo can be either floor', async () => {
  assert.equal((await record(a, report('I166', 'free'), 'floor5')).value, 'free')
  assert.equal((await record(b, report('I093', 'occupied'), 'floor5')).value, 'occupied')
  const invalid = [
    report('I167', 'free'), report('I000', 'free'), report('T01-A', 'free'),
    { source: 'sensor', target: 'T01', value: 'free' },
    { source: 'report', target: 'I120', value: 'free', simulated: true },
  ]
  for (const input of invalid) await assert.rejects(record(a, input, 'floor5'))
  await assert.rejects(record(a, report('I093', 'free'), 'floor8'))
  assert.equal((await record(a, report('I150', 'free'))).value, 'free')
  assert.equal((await record(a, report('T40-D', 'free'))).value, 'free')
})

test('Floor 7 takes its 196 seats and its three grad-space tables', async () => {
  assert.equal((await record(a, report('I196', 'free'), 'floor7')).value, 'free')
  assert.equal((await record(b, report('T03-D', 'occupied'), 'floor7')).value, 'occupied')
  const invalid = [
    report('I197', 'free'), report('T04-A', 'free'), report('T03', 'free'),
    { source: 'report', target: 'I120', value: 'free', simulated: true },
  ]
  for (const input of invalid) await assert.rejects(record(a, input, 'floor7'))
  await assert.rejects(record(a, report('I196', 'free'), 'floor5'))
  assert.equal((await record(a, report('I196', 'free'))).value, 'free')
})

test('live hardware needs station authorization, retains original sample time and accepts retries', async () => {
  const sample = { id: randomUUID(), source: 'ble', target: 'tables', value: 5, measuredAt: Date.now() - 1100 }
  await assert.rejects(record(a, sample, 'floor8'))
  await assert.rejects(record(a, { ...sample, simulated: true }, 'floor8'))
  const proof = await digest(randomUUID())
  assert.equal((await seed('/private/feedDigest', proof)).status, 200)
  const station = '/private/stations/' + a.uid
  assert.ok([401, 403].includes((await a.request(station, { method: 'PUT', body: '"incorrect"' })).status))
  assert.equal((await a.request(station, { method: 'PUT', body: JSON.stringify(proof) })).status, 200)
  const saved = await record(a, sample, 'floor8')
  assert.equal(saved.at, sample.measuredAt)
  assert.deepEqual(await record(a, sample, 'floor8'), saved)
  await assert.rejects(record(a, { ...sample, id: randomUUID(), measuredAt: sample.measuredAt - 1000 }, 'floor8'))
  await assert.rejects(record(b, { ...sample, id: randomUUID() }, 'floor8'))
  await assert.rejects(record(a, { ...sample, id: randomUUID(), simulated: true }, 'floor8'))
  const sensor = { source: 'sensor', target: 'T40-D', value: 'occupied', measuredAt: Date.now() }
  assert.equal((await record(a, sensor, 'floor8')).value, 'occupied')
  const seat = { source: 'sensor', target: 'I140', value: 'free', measuredAt: Date.now() }
  assert.equal((await record(a, seat, 'floor5')).value, 'free')
  assert.equal((await record(a, { ...sensor, id: randomUUID(), target: 'T03-D', measuredAt: Date.now() }, 'floor7')).value, 'occupied')
  await assert.rejects(record(a, { ...sensor, id: randomUUID(), target: 'T04-A', measuredAt: Date.now() }, 'floor7'))
  await assert.rejects(record(a, { ...sample, id: randomUUID(), measuredAt: Date.now() }, 'floor5'))
  assert.equal((await record(a, { ...sample, id: randomUUID(), target: 'individuals', measuredAt: Date.now() }, 'floor5')).value, 5)
  await seed('/private/feedDigest', await digest(randomUUID()))
  await assert.rejects(record(a, { ...sensor, id: randomUUID() }, 'floor8'))
})

test('only browsers with a PIN session can set floor-wide state, and locking is immediate', async () => {
  const roomId = randomUUID(), marker = '/rooms/' + roomId + '/events/floorAdmin/status'
  const approvals = '/private/adminPinSessions'
  const attempts = '/private/adminPinAttempts'
  const proof = await adminPinProof('617904283501')
  await seed('/private/adminPin', { proof })
  const attempt = (proof) => ({ proof, at: { '.sv': 'timestamp' } })
  const enter = (client) => client.request('/private', { method: 'PATCH', body: JSON.stringify({
    ['adminPinSessions/' + client.uid]: true, ['adminPinAttempts/' + client.uid + '/proof']: null,
  }) }).then((r) => r.status)
  const write = (client, path, value) =>
    client.request(path, { method: 'PUT', body: JSON.stringify(value) }).then((r) => r.status)
  const deny = (status) => assert.ok([401, 403].includes(status), 'Expected permission denial, got ' + status)
  const action = (value) => ({ id: randomUUID(), at: { '.sv': 'timestamp' }, value, simulated: true })
  for (const visitor of [a, b]) {
    deny(await write(visitor, marker, action('free')))
    deny(await write(visitor, approvals + '/' + visitor.uid, true))
    deny((await visitor.request(approvals)).status)
  }
  deny((await b.request(approvals + '/' + a.uid)).status)
  // A former GitHub-approved browser needs the PIN as well.
  await seed('/private/adminDevices/' + b.uid, true)
  deny(await write(b, marker, action('free')))
  for (const path of ['/private/adminPin', '/private/adminPin/proof', attempts + '/' + a.uid])
    deny((await a.request(path)).status)
  deny(await write(a, '/private/adminPin/proof', proof))
  deny(await write(b, attempts + '/' + a.uid, attempt(proof)))
  // A rejected PIN still uses the five-second window for this identity.
  assert.equal(await write(b, attempts + '/' + b.uid, attempt(await digest('wrong pin'))), 200)
  deny(await enter(b))
  deny(await write(b, attempts + '/' + b.uid, attempt(proof)))
  deny((await b.request(attempts + '/' + b.uid, { method: 'DELETE' })).status)
  assert.equal(await write(a, attempts + '/' + a.uid, attempt(proof)), 200)
  assert.equal(await enter(a), 200)
  deny(await write(b, approvals + '/' + a.uid, null))
  // The successful proof was consumed and the session reveals only a boolean.
  assert.equal(await (await a.request(approvals + '/' + a.uid)).json(), true)
  deny(await write(b, marker, action('unknown')))
  for (const value of ['free', 'occupied', 'unknown']) assert.equal(await write(a, marker, action(value)), 200)
  assert.equal((await (await read(marker)).json()).value, 'unknown')
  deny(await write(a, marker, action('invalid')))
  deny(await write(a, marker.replace('/status', '/I001'), action('free')))
  deny(await write(a, marker.replace(roomId, 'invalid-room'), action('free')))
  deny(await write(a, marker, { ...action('free'), at: Date.now() - 10000 }))
  deny((await a.request(marker, { method: 'DELETE' })).status)
  assert.equal(await write(a, marker.replace(roomId, 'floor7'), { ...action('free'), simulated: false }), 200)
  deny(await write(a, marker.replace(roomId, 'floor5'), action('free')))
  const updates = Object.fromEntries(['floor5', 'floor7', 'floor8'].map((id) => [
    id + '/events/floorAdmin/status', { ...action('occupied'), simulated: false },
  ]))
  const body = JSON.stringify(updates)
  deny((await b.request('/rooms', { method: 'PATCH', body })).status)
  assert.equal((await a.request('/rooms', { method: 'PATCH', body })).status, 200)
  const times = new Set()
  for (const [path, update] of Object.entries(updates)) {
    const saved = await (await read('/rooms/' + path)).json()
    assert.equal(saved.id, update.id)
    assert.equal(saved.value, 'occupied')
    times.add(saved.at)
  }
  assert.equal(times.size, 1)
  assert.equal((await a.request(approvals + '/' + a.uid, { method: 'DELETE' })).status, 200)
  deny(await enter(a))
  deny(await write(a, marker, action('free')))
  // Ordinary reports still work on the same map after revocation.
  assert.equal((await record(a, report('I001', 'occupied'), roomId)).value, 'occupied')
})
