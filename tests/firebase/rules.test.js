import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { databaseRequest, digest, postObservation } from '../../backend/firebase/observations.js'
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
const record = (user, input, id = room, previousTicket) =>
  postObservation({ ...user, room: id, input, previousTicket })
const qr = (value) => ({ source: 'qr', target: 'T17-B', value })
const report = (target, value) => ({ source: 'report', target, value })
before(async () => { [a, b] = await Promise.all([anonymous(), anonymous()]) })

test('two visitors share observations and only the holder can release a chair', async () => {
  const claims = await Promise.allSettled([record(a, qr('occupied')), record(b, qr('occupied'))])
  assert.equal(claims.filter((r) => r.status === 'fulfilled').length, 1)
  const [holder, other] = claims[0].status === 'fulfilled' ? [a, b] : [b, a]
  await assert.rejects(record(other, qr('free')), /belongs/)
  await record(other, report('T17-B', 'free'))
  const events = await (await read('/rooms/' + room + '/events')).json()
  assert.equal(events.qr['T17-B'].value, 'occupied')
  assert.equal(events.report['T17-B'].value, 'free')
  assert.deepEqual(Object.keys(events.qr['T17-B']).sort(), ['at', 'id', 'simulated', 'value'])
  for (const path of ['/rooms', '/rooms/' + room, '/rooms/' + room + '/owners/T17-B', '/private']) {
    assert.ok([401, 403].includes((await other.request(path)).status))
  }
  await record(holder, qr('free'))
  await record(other, qr('occupied'))
  await assert.rejects(record(holder, qr('free')), /belongs/)
})

test('a legacy ticket can release its imported check-in and an expired chair can be claimed', async () => {
  const oldRoom = randomUUID(), ticket = randomUUID(), id = randomUUID()
  await seed('/rooms/' + oldRoom, {
    owners: { 'T17-B': { legacy: await digest(ticket), id } },
    events: { qr: { 'T17-B': { id, at: Date.now() - 3000, value: 'occupied', simulated: false } } },
  })
  await assert.rejects(record(b, qr('free'), oldRoom, randomUUID()), /belongs/)
  await record(a, qr('free'), oldRoom, ticket)
  await record(b, qr('occupied'), oldRoom)
  await seed('/rooms/' + oldRoom + '/events/qr/T17-B/at', Date.now() - 3601000)
  await record(a, qr('occupied'), oldRoom)
})

test('source, seat, scope, timestamps and read-only public data are enforced', async () => {
  for (const target of ['I091', 'I092']) {
    assert.equal((await record(b, report(target, 'free'))).value, 'free')
    const checkIn = { source: 'qr', target, value: 'occupied' }
    assert.equal((await record(a, checkIn)).value, 'occupied')
    const checkOut = { ...checkIn, value: 'free' }
    await assert.rejects(record(b, checkOut))
    assert.equal((await record(a, checkOut)).value, 'free')
    assert.equal((await record(a, { source: 'sensor', target, value: 'free', simulated: true })).value, 'free')
  }
  const invalid = [
    report('T41-A', 'free'), report('T00-B', 'occupied'), report('I093', 'free'),
    report('T01', 'free'), report('I001', 'other'),
    { source: 'sensor', target: 'T17-B', value: 'occupied', simulated: true },
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
  const sensor = { source: 'sensor', target: 'T40', value: 'occupied', measuredAt: Date.now() }
  assert.equal((await record(a, sensor, 'floor8')).value, 'occupied')
  await seed('/private/feedDigest', await digest(randomUUID()))
  await assert.rejects(record(a, { ...sensor, id: randomUUID() }, 'floor8'))
})
