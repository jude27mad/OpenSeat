import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { adminPinProof, databaseRequest, digest, postObservation } from '../../backend/firebase/observations.js'
import { recommendationPaused } from '../../backend/firebase/report-history.js'
import { postLiveReport } from '../../backend/firebase/live-reports.js'
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

test('visitors can maintain their own presence and only an unlocked admin can read the count', async (t) => {
  const [admin, guest] = await Promise.all([anonymous(), anonymous()])
  const presence = '/visitorPresence'
  const marker = presence + '/' + guest.uid + '/-0123456789abcdefghi'
  const write = (who, screen) => who.request(marker, { method: 'PUT', body: JSON.stringify({ profile: guest.uid, screen }) })
  const denied = (response) => assert.ok([401, 403].includes(response.status))
  t.after(async () => {
    await seed('/siteClosure', null)
    await seed(presence + '/' + guest.uid, null)
    await seed('/private/adminPinSessions/' + admin.uid, null)
  })
  denied(await read(presence))
  denied(await guest.request(presence))
  denied(await write(admin, 'online'))
  denied(await write(guest, 'waiting'))
  denied(await write(guest, 2))
  assert.ok((await write(guest, 'online')).ok)
  await seed('/private/adminPinSessions/' + admin.uid, true)
  assert.deepEqual(await (await admin.request(marker)).json(), { profile: guest.uid, screen: 'online' })
  assert.ok((await admin.request(presence)).ok)
  await seed('/siteClosure', admin.uid)
  assert.ok((await write(guest, 'waiting')).ok)
  denied(await write(guest, 'online'))
  denied(await guest.request(presence))
  assert.deepEqual(await (await admin.request(marker)).json(), { profile: guest.uid, screen: 'waiting' })
  assert.ok((await guest.request(marker, { method: 'DELETE' })).ok)
  assert.equal(await (await admin.request(marker)).json(), null)
})

test('only the closing admin browser retains map access and can reopen the site', async (t) => {
  const [first, second] = await Promise.all([anonymous(), anonymous()])
  const demo = randomUUID()
  const path = '/siteClosure'
  const events = '/rooms/' + demo + '/events'
  const close = (user, uid = user.uid) => user.request(path, { method: 'PUT', body: JSON.stringify(uid) })
  const reopen = (user) => user.request(path, { method: 'DELETE' })
  const denied = (response) => assert.ok([401, 403].includes(response.status))
  t.after(async () => {
    await seed(path, null)
    await seed('/rooms/' + demo, null)
    for (const user of [first, second]) await seed('/private/adminPinSessions/' + user.uid, null)
  })
  denied(await close(first))
  for (const user of [first, second]) await seed('/private/adminPinSessions/' + user.uid, true)
  denied(await close(first, second.uid))
  const attempts = await Promise.all([close(first), close(second)])
  assert.equal(attempts.filter((r) => r.ok).length, 1)
  const [owner, other] = attempts[0].ok ? [first, second] : [second, first]
  assert.equal(await (await read(path)).json(), owner.uid)
  denied(await reopen(other))
  denied(await close(other))
  denied(await read(events))
  denied(await other.request('/rooms/floor7/events'))
  denied(await other.request(events))
  const write = (user) => user.request(events + '/report/I001', { method: 'PUT', body: JSON.stringify({
    id: randomUUID(), at: { '.sv': 'timestamp' }, value: 'occupied', simulated: false,
  }) })
  denied(await write(other))
  assert.ok((await write(owner)).ok)
  assert.ok((await owner.request(events)).ok)
  assert.ok((await reopen(owner)).ok)
  assert.equal(await (await read(path)).json(), null)
  assert.ok((await read(events)).ok)
  assert.ok((await write(other)).ok)
})

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

test('changing the PIN consumes a fresh current proof and revokes every prior browser session', async () => {
  const oldProof = await adminPinProof(randomUUID())
  const newProof = await adminPinProof(randomUUID())
  await seed('/private/adminPin', { proof: oldProof, revision: 'initial', encryptedPin: 'original envelope' })
  await seed('/private/adminPinSessions/' + b.uid, true)
  const c = await anonymous()
  const attemptPath = '/private/adminPinAttempts/' + c.uid
  const attempt = (proof) => c.request(attemptPath, { method: 'PUT', body: JSON.stringify({ proof, at: { '.sv': 'timestamp' } }) })
  const rotate = (changes) => c.request('/private', { method: 'PATCH', body: JSON.stringify(changes) })
  const rotation = { adminPin: { proof: newProof, rotated: true }, adminPinSessions: null, adminPinAttempts: null }
  const reject = async (promise) => assert.ok([401, 403].includes((await promise).status))
  await reject(rotate(rotation))
  await reject(rotate({ adminPinSessions: null }))
  await reject(rotate({ adminPinAttempts: null }))
  await seed(attemptPath, { proof: oldProof, at: Date.now() - 61_000 })
  await reject(rotate(rotation))
  assert.equal((await attempt(oldProof)).status, 200)
  await reject(rotate({ adminPin: rotation.adminPin, adminPinAttempts: null }))
  await reject(rotate({ adminPin: rotation.adminPin, adminPinSessions: null }))
  await reject(rotate({ ...rotation, adminPin: { ...rotation.adminPin, proof: oldProof } }))
  await reject(rotate({ ...rotation, 'unrelated': true }))
  assert.equal(await (await b.request('/private/adminPinSessions/' + b.uid)).json(), true)
  assert.equal((await rotate(rotation)).status, 200)
  assert.equal(await (await b.request('/private/adminPinSessions/' + b.uid)).json(), null)
  await reject(rotate(rotation))
  const enter = () => rotate({ ['adminPinSessions/' + c.uid]: true, ['adminPinAttempts/' + c.uid + '/proof']: null })
  await reject(enter())
  assert.equal((await attempt(oldProof)).status, 200)
  await reject(enter())
  await seed(attemptPath, null)
  assert.equal((await attempt(newProof)).status, 200)
  assert.equal((await enter()).status, 200)
})

const livePath = (floor, target) => '/rooms/' + floor + '/events/report/' + target
const ledgerPath = (user) => '/private/reportLimits/' + user.uid
const serverTime = { '.sv': 'timestamp' }

async function valueAt(path) {
  const response = await read(path)
  assert.equal(response.status, 200)
  return response.json()
}

async function ledgerOf(user) {
  const response = await user.request(ledgerPath(user))
  assert.equal(response.status, 200)
  return response.json()
}

// Rules and browser tests share the emulator. Put the original live seats back.
async function isolateReports(t, floor, targets) {
  for (const target of targets) {
    const path = livePath(floor, target)
    const original = await valueAt(path)
    t.after(() => seed(path, original))
    await seed(path, null)
  }
}

test('live report quotas span floors and leave demo reporting unrestricted', async (t) => {
  const visitor = await anonymous()
  for (const floor of ['floor5', 'floor7', 'floor8']) await isolateReports(t, floor, ['I055'])
  const first = await record(visitor, report('I055', 'free'), 'floor5')
  await record(visitor, report('I055', 'free'), 'floor7')
  const before = await ledgerOf(visitor)
  assert.equal(before.latest.spot, 'floor7/I055')
  assert.equal(before.previous.spot, 'floor5/I055')
  await assert.rejects(record(visitor, report('I055', 'occupied'), 'floor8'), /2 (?:different |distinct )?spots/i)
  // A browser with an incorrect clock may think its allowance already reset.
  // Firebase still enforces the limit when the client submits that write.
  const clockAhead = (floor, value) => postLiveReport({
    ...visitor, room: floor, targets: ['I055'], value, serverNow: () => Date.now() + 16 * 60000,
  })
  await assert.rejects(clockAhead('floor8', 'occupied'))
  assert.equal(await valueAt(livePath('floor8', 'I055')), null)
  assert.deepEqual(await ledgerOf(visitor), before)

  const correction = await record(visitor, report('I055', 'occupied'), 'floor5')
  assert.equal(correction.lastFreeAt, first.at)
  await assert.rejects(record(visitor, report('I055', 'free'), 'floor5'), /3 reports/i)
  await assert.rejects(clockAhead('floor5', 'free'))
  assert.equal((await valueAt(livePath('floor5', 'I055'))).id, correction.id)
  assert.ok([401, 403].includes((await b.request(ledgerPath(visitor))).status))
  for (const target of ['I001', 'I002', 'I003', 'I004'])
    assert.equal((await record(visitor, report(target, 'free'))).value, 'free')
})

test('one whole-table action preserves unchanged chairs and repeated taps consume no allowance', async (t) => {
  const visitor = await anonymous(), observer = await anonymous()
  const floor = 'floor8', targets = ['T32-A', 'T32-B', 'T32-C', 'T32-D']
  await isolateReports(t, floor, targets)
  const batch = (user, value) => postLiveReport({ ...user, room: floor, targets, value })
  const first = await record(visitor, report(targets[0], 'free'), floor)
  await batch(visitor, 'free')
  const rows = () => Promise.all(targets.map((target) => valueAt(livePath(floor, target))))
  const original = await rows()
  const ledger = await ledgerOf(visitor)
  assert.equal(ledger.oldest, undefined)
  assert.equal(ledger.previous.id, first.id)
  assert.equal(original[0].id, first.id)
  assert.equal(original[0].at, first.at)
  assert.ok(original.slice(1).every((row) => row.id === ledger.latest.id && row.at === ledger.latest.at))
  assert.ok(original.every((row) => row.value === 'free'))

  assert.equal((await batch(visitor, 'free')).unchanged, true)
  assert.deepEqual(await ledgerOf(visitor), ledger)
  assert.deepEqual(await rows(), original)

  const correction = await batch(visitor, 'occupied')
  assert.equal(correction.unchanged, false)
  const corrected = await rows()
  assert.ok(corrected.every((row) => row.id === corrected[0].id && row.at === corrected[0].at))
  assert.equal((await batch(visitor, 'occupied')).unchanged, true)
  assert.deepEqual(await rows(), corrected)
  // A different browser can personally confirm a still-taken table.
  assert.equal((await batch(observer, 'occupied')).unchanged, false)
  assert.notEqual((await rows())[0].id, corrected[0].id)
})

test('rolling quota releases actions individually as their 15-minute windows pass', async (t) => {
  const visitor = await anonymous(), now = Date.now(), minute = 60000
  await isolateReports(t, 'floor8', ['I064'])
  const entry = (spot, age) => ({ id: randomUUID(), at: now - age, spot, value: 'free' })
  const ledger = {
    latest: entry('floor7/I063', 2 * minute),
    previous: entry('floor5/I063', 9 * minute),
    oldest: entry('floor5/I063', 16 * minute),
  }
  await seed(ledgerPath(visitor), ledger)
  await assert.rejects(record(visitor, report('I064', 'free'), 'floor8'), /2 (?:different |distinct )?spots/i)
  assert.deepEqual(await ledgerOf(visitor), ledger)
  ledger.previous.at = now - 15 * minute - 1000
  await seed(ledgerPath(visitor), ledger)
  const fresh = await record(visitor, report('I064', 'free'), 'floor8')
  const saved = await ledgerOf(visitor)
  assert.equal(saved.latest.id, fresh.id)
  assert.deepEqual(saved.previous, ledger.latest)
})

test('concurrent live submissions preserve both the two-spot and three-action limits', async (t) => {
  const visitor = await anonymous(), floor = 'floor8', targets = ['I076', 'I077', 'I078']
  await isolateReports(t, floor, targets)
  const outcomes = await Promise.allSettled(targets.map((target) => record(visitor, report(target, 'free'), floor)))
  const accepted = targets.filter((_, i) => outcomes[i].status === 'fulfilled')
  assert.equal(accepted.length, 2, JSON.stringify(outcomes))
  const declined = targets.find((target) => !accepted.includes(target))
  assert.equal(await valueAt(livePath(floor, declined)), null)
  const changes = await Promise.allSettled(accepted.map((target) => record(visitor, report(target, 'occupied'), floor)))
  assert.equal(changes.filter((result) => result.status === 'fulfilled').length, 1, JSON.stringify(changes))
  const ledger = await ledgerOf(visitor)
  assert.equal(new Set(Object.values(ledger).map((e) => e.id)).size, 3)
  const rows = await Promise.all(accepted.map((target) => valueAt(livePath(floor, target))))
  assert.equal(rows.filter((row) => row.value === 'occupied').length, 1)
})

test('old live reports can be updated while direct writes without quota accounting are refused', async (t) => {
  const visitor = await anonymous(), floor = 'floor8', target = 'I083', path = livePath(floor, target)
  await isolateReports(t, floor, [target])
  const legacy = { id: randomUUID(), at: Date.now() - 5000, simulated: false, value: 'free' }
  await seed(path, legacy)
  const write = (url, body, method = 'PUT') => visitor.request(url, { method, body: JSON.stringify(body) })
  const deny = (result) => assert.ok([401, 403].includes(result.status), 'Expected permission denial, got ' + result.status)
  const id = randomUUID()
  deny(await write(path, { ...legacy, id, at: serverTime, lastFreeAt: serverTime }))
  deny(await write(path + '/value', 'occupied'))
  assert.deepEqual(await valueAt(path), legacy)
  const occupied = await record(visitor, report(target, 'occupied'), floor)
  assert.equal(occupied.lastFreeAt, legacy.at)

  const ledger = await ledgerOf(visitor)
  const previous = await valueAt(path)
  const next = { id, spot: floor + '/' + target, value: 'occupied', at: serverTime }
  // Even a well-formed action cannot refresh its own current, identical report.
  deny(await write('/', {
    [ledgerPath(visitor).slice(1)]: { latest: next, previous: ledger.latest },
    [path.slice(1)]: { ...previous, id, at: serverTime },
  }, 'PATCH'))
  assert.deepEqual(await ledgerOf(visitor), ledger)
  assert.deepEqual(await valueAt(path), previous)
})

test('a lost live-report acknowledgement can be retried without consuming another action', async (t) => {
  const visitor = await anonymous(), floor = 'floor8', target = 'I085'
  await isolateReports(t, floor, [target])
  let committed = 0
  async function request(path, options) {
    const result = await visitor.request(path, options)
    if (path === '/' && options?.method === 'PATCH' && result.ok && ++committed === 1)
      throw new Error('Test lost the first response after the server committed the write.')
    return result
  }
  const id = randomUUID()
  const result = await postLiveReport({ request, uid: visitor.uid, room: floor, targets: [target], value: 'free', id })
  assert.equal(committed, 1)
  assert.equal(result.events[0].id, id)
  const ledger = await ledgerOf(visitor)
  assert.deepEqual(Object.keys(ledger), ['latest'])
  assert.equal(ledger.latest.id, id)
})

test('an accepted reversal holds only that seat out of recommendations until the two-minute pause ends', async (t) => {
  const visitor = await anonymous(), floor = 'floor8', target = 'I086'
  await isolateReports(t, floor, [target])
  const first = await record(visitor, report(target, 'free'), floor)
  const middle = await record(visitor, report(target, 'occupied'), floor)
  const last = await record(visitor, report(target, 'free'), floor)
  assert.equal(last.cycleStart, first.at)
  assert.equal(last.cycleEnd, last.at)
  assert.equal(last.oppositeAt, middle.at)
  const observer = await anonymous()
  const confirmation = await record(observer, report(target, 'free'), floor)
  assert.equal(confirmation.cycleEnd, last.at)
  assert.equal(recommendationPaused(confirmation, last.at + 119999), true)
  assert.equal(recommendationPaused(confirmation, last.at + 120000), false)
})
