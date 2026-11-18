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
test('Conflicting fresh sources show both observations', () => {
  const m = derive(
    [event('qr', 'I020', 'occupied'), event('report', 'I020', 'free', 100)],
    now,
  )
  assert.equal(m.states.get('I020').status, 'mixed')
  assert.equal(m.states.get('I020').evidence.length, 2)
  assert.equal(m.counts.mixed, 1)
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
