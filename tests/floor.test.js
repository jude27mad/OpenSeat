import test from 'node:test'
import assert from 'node:assert/strict'
import {
  byId,
  chairs,
  individuals,
  rooms,
  seats,
  tables,
} from '../src/floor.js'
import {
  age,
  derive,
  fresh,
  merge,
  parseSpot,
  scanCount,
  seedDemo,
  ttl,
} from '../src/model.js'
import { observation } from '../src/ble.js'
const now = 1700000000000
const event = (source, target, value, offset = 0) => ({
  id: source + target + offset,
  source,
  target,
  value,
  at: now - offset,
})
test('Floor 8 has exactly 252 distinct open seats and 20 separate rooms', () => {
  assert.equal(tables.length, 40)
  assert.equal(individuals.length, 92)
  assert.equal(rooms.length, 20)
  assert.equal(new Set(seats).size, 252)
  assert.equal(chairs(byId.get('T40')).length, 4)
})
test('All live seats start unknown without evidence', () =>
  assert.deepEqual(derive([], now).counts, {
    unknown: 252,
    free: 0,
    occupied: 0,
    mixed: 0,
  }))
test('Bluetooth threshold includes −75 and deduplicates identifiers within one scan', () => {
  assert.equal(
    scanCount([
      { addr: 'a', rssi: -76 },
      { addr: 'b', rssi: -75 },
      { addr: ' B ', rssi: -63 },
      { addr: 'c', rssi: -73 },
    ]),
    2,
  )
  assert.equal(scanCount([]), 0)
  assert.throws(() => scanCount([{ addr: 'x', rssi: null }]))
})
test('Historical Bluetooth readings do not become fresh through replay', () => {
  assert.throws(() =>
    observation([{ addr: 'x', rssi: -68, measuredAt: now - ttl.ble }], now),
  )
  assert.deepEqual(
    observation([
      { addr: 'a', rssi: -75, measuredAt: now },
      { addr: 'stale', rssi: -62, measuredAt: now - ttl.ble },
      { addr: 'future', rssi: -60, measuredAt: now + 60000 },
      { addr: 'undated', rssi: -68 },
    ], now),
    { value: 1, measuredAt: now },
  )
})
test('Nearby device counts and shared-table sensors never occupy four chairs', () => {
  const m = derive(
    [event('ble', 'tables', 128), event('sensor', 'T12', 'occupied')],
    now,
  )
  assert.equal(m.ble.tables.value, 128)
  assert.equal(m.locations.get('T12').status, 'inuse')
  assert.equal(m.counts.unknown, 252)
})
test('A chair can be free at a table that is in use', () => {
  const m = derive(
    [event('report', 'T08-A', 'free'), event('sensor', 'T08', 'occupied')],
    now,
  )
  assert.equal(m.states.get('T08-A').status, 'free')
  assert.equal(m.locations.get('T08').status, 'free')
  assert.equal(m.counts.free, 1)
})
test('The newer of a report and a check-in wins, and both stay as evidence', () => {
  const released = derive(
    [event('qr', 'I020', 'occupied', 60000), event('report', 'I020', 'free', 100)],
    now,
  )
  assert.equal(released.states.get('I020').status, 'free')
  assert.equal(released.states.get('I020').evidence.length, 2)
  assert.equal(released.counts.free, 1)
  const seated = derive(
    [event('report', 'I020', 'free', 60000), event('qr', 'I020', 'occupied', 100)],
    now,
  )
  assert.equal(seated.states.get('I020').status, 'occupied')
})
test('A table sensor that disagrees with every chair still shows mixed reports', () => {
  const m = derive(
    [
      ...['A', 'B', 'C', 'D'].map((c) => event('report', 'T08-' + c, 'free')),
      event('sensor', 'T08', 'occupied'),
    ],
    now,
  )
  assert.equal(m.locations.get('T08').status, 'mixed')
})
test('Evidence expires at the specified boundary and retains its source and age', () => {
  const stale = event('report', 'I020', 'free', ttl.report)
  const m = derive([stale], now)
  assert.equal(m.states.get('I020').status, 'unknown')
  assert.equal(m.states.get('I020').latest.source, 'report')
  assert.equal(age(stale.at, now), '15m ago')
  assert.equal(fresh(event('qr', 'I020', 'free', 300000), now), false)
})
test('Replays keep the newer event and duplicate packets keep one result', () => {
  const a = event('sensor', 'I090', 'free'),
    b = event('sensor', 'I090', 'occupied', 1000)
  assert.deepEqual(merge([a], [b, a]), [a])
  assert.equal(derive([a], now).states.get('I090').status, 'free')
})
test('QR deep links validate table, chair and exact seat', () => {
  assert.deepEqual(parseSpot('t01-b'), { id: 'T01', seat: 'T01-B' })
  assert.deepEqual(parseSpot('I090'), { id: 'I090', seat: 'I090' })
  assert.deepEqual(parseSpot('I091'), { id: 'I091', seat: 'I091' })
  assert.deepEqual(parseSpot('I092'), { id: 'I092', seat: 'I092' })
  assert.equal(parseSpot('I093'), null)
  assert.equal(parseSpot('T40-Z'), null)
})
test('Demo fixtures are labelled and actual input supersedes a fixture at its location', () => {
  const fixture = seedDemo(now),
    r = event('qr', 'T01-A', 'occupied')
  assert.ok(fixture.every((e) => e.simulated))
  const m = derive(merge(fixture, [r]), now)
  assert.equal(m.states.get('T01-A').status, 'occupied')
  assert.equal(
    Object.values(m.counts).reduce((s, n) => s + n, 0),
    252,
  )
})
test('A tap picks the seat a fingertip can tell apart and zooms into crowded seats first', async () => {
  const { resolveTap, mapPoints, MAX_ZOOM } = await import('../src/hit.js')
  const at = mapPoints.get('I020')
  // Whole floor on a phone: seats are about 9 px apart, so the tap zooms instead of guessing.
  const crowded = resolveTap({ at, pxPerUnit: 0.48, zoom: 1, touch: true })
  assert.equal(crowded.action, 'zoom')
  assert.ok(crowded.zoom > 3 && crowded.zoom <= MAX_ZOOM)
  // Zoomed in, the same tap selects that exact seat, even slightly off centre.
  const near = [at[0] + 4, at[1] - 3]
  assert.deepEqual(resolveTap({ at: near, pxPerUnit: 1.75, zoom: 3.6, touch: true }), {
    action: 'select',
    id: 'I020',
  })
  // A mouse is precise enough at desktop size.
  assert.deepEqual(resolveTap({ at, pxPerUnit: 0.63, zoom: 1, touch: false }), {
    action: 'select',
    id: 'I020',
  })
  // Round tables are far enough apart to pick on a phone straight away.
  assert.deepEqual(resolveTap({ at: mapPoints.get('T17'), pxPerUnit: 0.48, zoom: 1, touch: true }), {
    action: 'select',
    id: 'T17',
  })
  // Empty floor selects nothing.
  assert.equal(resolveTap({ at: [700, 640], pxPerUnit: 1, zoom: 1, touch: false }).action, 'none')
  // A highlighted neighbour wins over a faded seat within reach.
  const [x, y] = mapPoints.get('I020')
  const [neighbour] = [...mapPoints]
    .filter(([id]) => id !== 'I020')
    .sort(([, a], [, b]) => Math.hypot(a[0] - x, a[1] - y) - Math.hypot(b[0] - x, b[1] - y))[0]
  const [nx, ny] = mapPoints.get(neighbour)
  const between = [x + (nx - x) * 0.45, y + (ny - y) * 0.45]
  assert.equal(resolveTap({ at: between, pxPerUnit: 2, zoom: 4, touch: true }).id, 'I020')
  assert.equal(
    resolveTap({ at: between, pxPerUnit: 2, zoom: 4, touch: true, dim: (id) => id === 'I020' }).id,
    neighbour,
  )
})
test('Search understands seat names the way people type them', async () => {
  const { matchesQuery } = await import('../src/model.js')
  const find = (q) => [...byId.values()].filter((p) => matchesQuery(p, q)).map((p) => p.id)
  assert.deepEqual(find('table 5'), ['T05'])
  assert.deepEqual(find('T5'), ['T05'])
  assert.deepEqual(find('seat 1'), ['I001'])
  assert.deepEqual(find('Seat 01'), ['I001'])
  assert.deepEqual(find('12'), ['T12', 'I012'])
  assert.deepEqual(find('t17-b'), ['T17'])
  assert.deepEqual(find('I091'), ['I091'])
  assert.equal(find('round').length, 40)
  assert.equal(find('').length, 132)
})
test('Suggestions put the most free chairs first and include tables a sensor reports free', async () => {
  const { suggestions } = await import('../src/model.js')
  const m = derive(
    [
      event('report', 'T03-A', 'free'),
      event('report', 'T09-A', 'free'),
      event('report', 'T09-B', 'free'),
      event('sensor', 'T30', 'free'),
      event('report', 'I005', 'occupied'),
    ],
    now,
  )
  assert.deepEqual(suggestions(m.locations, now).map((p) => p.id), ['T09', 'T03', 'T30'])
  assert.deepEqual(suggestions(m.locations, now, 'individuals'), [])
})
test('A tap between two round tables zooms in instead of guessing', async () => {
  const { resolveTap, mapPoints } = await import('../src/hit.js')
  const [ax, ay] = mapPoints.get('T13'),
    [bx, by] = mapPoints.get('T14')
  const between = [ax + (bx - ax) * 0.4, ay + (by - ay) * 0.4]
  assert.equal(resolveTap({ at: between, pxPerUnit: 0.48, zoom: 1, touch: true }).action, 'zoom')
  // A tap on the table itself still opens it at once.
  assert.equal(resolveTap({ at: [ax + 2, ay], pxPerUnit: 0.48, zoom: 1, touch: true }).id, 'T13')
})
test('Demo readings never expire: only a new report or check-in changes a seat', async () => {
  const { holdsUntil } = await import('../src/model.js')
  const { endingSoon, holdText } = await import('../src/checkin.js')
  const lasting = (e) => ({ ...e, lasting: true })
  const later = now + 10 * 3600000
  const m = derive(
    [
      lasting(event('qr', 'I020', 'free', 5 * 60000)),
      lasting(event('report', 'I021', 'occupied')),
      lasting(event('sensor', 'T08', 'occupied')),
    ],
    later,
  )
  assert.equal(m.states.get('I020').status, 'free')
  assert.equal(m.states.get('I021').status, 'occupied')
  assert.equal(m.locations.get('T08').status, 'inuse')
  const hold = lasting(event('qr', 'I022', 'occupied'))
  assert.equal(holdsUntil(hold), Infinity)
  assert.equal(endingSoon(hold, later), false)
  assert.equal(holdText(hold, later), 'Held until you check out')
  // Live readings still expire.
  assert.equal(derive([event('report', 'I021', 'occupied')], later).states.get('I021').status, 'unknown')
})
