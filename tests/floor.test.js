import test from 'node:test'
import assert from 'node:assert/strict'
import {
  byId,
  arrivalCue,
  chairs,
  FLOORS,
  individuals,
  rooms,
  seats,
  setFloor,
  tables,
} from '../src/floor.js'
import {
  age,
  derive,
  fresh,
  looksFree,
  merge,
  parseSpot,
  scanCount,
  seedDemo,
  sources,
  suggestions,
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
test('Nearby device counts never mark seats taken', () => {
  const m = derive([event('ble', 'tables', 128)], now)
  assert.equal(m.ble.tables.value, 128)
  assert.equal(m.counts.unknown, 252)
})
test('A table is free if any chair is, partly in use if some are taken, taken if all are', () => {
  const free = derive([event('report', 'T08-A', 'free'), event('report', 'T08-B', 'occupied')], now)
  assert.equal(free.locations.get('T08').status, 'free')
  assert.equal(free.counts.free, 1)
  const some = derive([event('report', 'T08-B', 'occupied')], now)
  assert.equal(some.locations.get('T08').status, 'inuse')
  const all = derive(['A', 'B', 'C', 'D'].map((c) => event('report', 'T08-' + c, 'occupied')), now)
  assert.equal(all.locations.get('T08').status, 'occupied')
})
test('Three data sources and admin updates are recognized, and old QR check-ins are ignored', () => {
  assert.deepEqual(Object.keys(sources).sort(), ['admin', 'ble', 'report', 'sensor'])
  assert.equal('qr' in ttl, false)
  // A check-in saved before check-in was removed neither counts nor shows as evidence.
  const old = event('qr', 'I020', 'occupied')
  assert.equal(fresh(old, now), false)
  const alone = derive([old], now)
  assert.equal(alone.states.get('I020').status, 'unknown')
  assert.deepEqual(alone.states.get('I020').evidence, [])
  assert.equal(alone.locations.get('I020').latest, undefined)
  assert.deepEqual(alone.counts, { unknown: 252, free: 0, occupied: 0 })
  // A report still decides the seat, even if an old check-in is newer.
  const reported = derive([event('report', 'I020', 'free', 60000), old], now)
  assert.equal(reported.states.get('I020').status, 'free')
  assert.equal(reported.states.get('I020').evidence.length, 1)
  assert.equal(reported.counts.free, 1)
  // Even in the demo, where nothing expires, an old check-in does not count.
  assert.equal(derive([{ ...old, lasting: true }], now).states.get('I020').status, 'unknown')
})
test('A current seat sensor decides the seat, over a newer report', () => {
  // The sensor wins even when a report is newer.
  const reported = derive([event('sensor', 'T08-A', 'occupied', 60000), event('report', 'T08-A', 'free', 100)], now)
  assert.equal(reported.states.get('T08-A').status, 'occupied')
  assert.equal(looksFree(reported.locations.get('T08')), false)
  assert.deepEqual(suggestions(reported.locations, now), [])
  const empty = derive([event('report', 'I020', 'occupied', 100), event('sensor', 'I020', 'free', 60000)], now)
  assert.equal(empty.states.get('I020').status, 'free')
  assert.equal(empty.states.get('I020').evidence.length, 2)
  // Once the sensor reading is old, the newest report decides again.
  const old = derive([event('sensor', 'I020', 'free', ttl.sensor), event('report', 'I020', 'occupied', 100)], now)
  assert.equal(old.states.get('I020').status, 'occupied')
  // There is no Mixed state any more.
  assert.equal('mixed' in derive([], now).counts, false)
})
test('Reports expire after 15 minutes and sensor readings after 5, keeping their source and age', () => {
  assert.equal(ttl.report, 15 * 60000)
  assert.equal(ttl.sensor, 5 * 60000)
  const recent = event('report', 'I020', 'free', ttl.report - 1)
  assert.equal(derive([recent], now).states.get('I020').status, 'free')
  const stale = event('report', 'I020', 'free', ttl.report)
  const m = derive([stale], now)
  assert.equal(m.states.get('I020').status, 'unknown')
  assert.equal(m.states.get('I020').latest.source, 'report')
  assert.equal(age(stale.at, now), '15m ago')
  assert.equal(fresh(event('sensor', 'I020', 'free', ttl.sensor - 1), now), true)
  assert.equal(fresh(event('sensor', 'I020', 'free', ttl.sensor), now), false)
  assert.equal(derive([event('sensor', 'I020', 'occupied', ttl.sensor)], now).states.get('I020').status, 'unknown')
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
    r = event('report', 'T01-A', 'occupied')
  assert.ok(fixture.every((e) => e.simulated))
  // The example floor is made of student reports only.
  assert.ok(fixture.every((e) => e.source === 'report'))
  assert.ok(fixture.some((e) => e.value === 'free') && fixture.some((e) => e.value === 'occupied'))
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
test('filtered map locations cannot be selected by a mouse or touch', async () => {
  const { resolveTap, mapPoints } = await import('../src/hit.js')
  for (const touch of [false, true]) {
    const tap = { at: mapPoints.get('T17'), pxPerUnit: 2, zoom: 4, touch }
    assert.deepEqual(resolveTap({ ...tap, dim: (id) => id === 'T17' }), { action: 'none' })
    assert.deepEqual(resolveTap({ ...tap, dim: () => true }), { action: 'none' })
  }
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
test('Suggestions rank the newest open chair first, then free chair count and place ID', () => {
  const m = derive(
    [
      event('report', 'T03-A', 'free', 840000),
      event('report', 'T03-B', 'occupied'),
      event('report', 'T09-A', 'free', 860000),
      event('report', 'T09-B', 'free', 840000),
      event('sensor', 'T30-C', 'free', 80000),
      event('report', 'I005', 'free', 30000),
      event('report', 'I006', 'free', 30000),
    ],
    now,
  )
  assert.deepEqual(suggestions(m.locations, now).map((p) => p.id), ['I005', 'I006', 'T30', 'T09', 'T03'])
  assert.equal(m.locations.get('T09').latestFree.target, 'T09-B')
  assert.deepEqual(suggestions(m.locations, now, 'tables').map((p) => p.id), ['T30', 'T09', 'T03'])
})
test('Each suggested place has an elevator cue for its own floor and seating block', () => {
  try {
    for (const number of [5, 7, 8]) {
      setFloor(number)
      for (const place of [...FLOORS[number].individuals, ...FLOORS[number].tables]) {
        assert.match(arrivalCue(place), /^From the elevators, [^?]+\.$/)
        assert.doesNotMatch(arrivalCue(place), /undefined/)
      }
    }
    assert.match(arrivalCue(byId.get('T01')), /first row/)
    assert.match(arrivalCue(byId.get('T40')), /fifth row/)
    setFloor(7)
    assert.match(arrivalCue(byId.get('T01')), /grad space/)
    assert.match(arrivalCue(byId.get('I196')), /silent space/)
    setFloor(5)
    assert.match(arrivalCue(byId.get('I001')), /seminar room/)
  } finally {
    setFloor(8)
  }
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
test('Demo readings never expire: only a new report or sensor reading changes a seat', () => {
  const lasting = (e) => ({ ...e, lasting: true })
  const later = now + 10 * 3600000
  const m = derive(
    [
      lasting(event('report', 'I020', 'free', 5 * 60000)),
      lasting(event('report', 'I021', 'occupied')),
      lasting(event('sensor', 'T08-A', 'occupied')),
    ],
    later,
  )
  assert.equal(m.states.get('I020').status, 'free')
  assert.equal(m.states.get('I021').status, 'occupied')
  assert.equal(m.states.get('T08-A').status, 'occupied')
  // Live readings still expire.
  assert.equal(derive([event('report', 'I021', 'occupied')], later).states.get('I021').status, 'unknown')
})
test('Floor 5 counts its 166 individual seats and leaves the rooms out', async () => {
  const f = await import('../src/floor.js')
  const hit = await import('../src/hit.js')
  f.setFloor(5)
  try {
    const plan = f.FLOORS[5].plan
    assert.equal(f.tables.length, 0)
    assert.equal(f.individuals.length, 166)
    assert.equal(new Set(f.seats).size, 166)
    assert.equal(plan.bookable.length, 11)
    assert.equal(plan.media.length, 3)
    assert.deepEqual(derive([], now).counts, { unknown: 166, free: 0, occupied: 0 })
    assert.deepEqual(parseSpot('I166'), { id: 'I166', seat: 'I166' })
    assert.equal(parseSpot('I167'), null)
    assert.equal(parseSpot('T01-A'), null)
    const fixture = seedDemo(now)
    assert.ok(fixture.every((e) => /^I\d{3}$/.test(e.target) || e.target === 'individuals'))
    assert.equal(Object.values(derive(fixture, now).counts).reduce((s, n) => s + n, 0), 166)
    // Every seat is on the floor, outside the rooms that are not counted.
    const inside = ([x, y], shape) => {
      let hit = false
      for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
        const [xi, yi] = shape[i],
          [xj, yj] = shape[j]
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
      }
      return hit
    }
    const rooms = [...plan.bookable.map((r) => r.shape), plan.seminar.shape, ...plan.media]
    for (const p of f.individuals) {
      assert.ok(inside([p.x, p.y], plan.outline), p.id + ' is on the floor')
      assert.ok(!rooms.some((r) => inside([p.x, p.y], r)), p.id + ' is not in a room')
    }
    // Taps use this floor's seats.
    assert.equal(hit.mapPoints.size, 166)
    const at = hit.mapPoints.get('I120')
    assert.deepEqual(hit.resolveTap({ at, pxPerUnit: 2, zoom: 4, touch: true }), { action: 'select', id: 'I120' })
  } finally {
    f.setFloor(8)
  }
  assert.equal(seats.length, 252)
})
test('Floor 7 counts 196 individual seats and the three grad-space tables, not the rooms', async () => {
  const f = await import('../src/floor.js')
  const hit = await import('../src/hit.js')
  f.setFloor(7)
  try {
    const plan = f.FLOORS[7].plan
    assert.equal(f.tables.length, 3)
    assert.equal(f.individuals.length, 196)
    assert.equal(new Set(f.seats).size, 208)
    assert.equal(plan.bookable.length, 30)
    assert.deepEqual(derive([], now).counts, { unknown: 208, free: 0, occupied: 0 })
    assert.deepEqual(parseSpot('T03-D'), { id: 'T03', seat: 'T03-D' })
    assert.equal(parseSpot('T04-A'), null)
    assert.deepEqual(parseSpot('I196'), { id: 'I196', seat: 'I196' })
    assert.equal(parseSpot('I197'), null)
    const fixture = seedDemo(now)
    assert.equal(Object.values(derive(fixture, now).counts).reduce((s, n) => s + n, 0), 208)
    const inside = ([x, y], shape) => {
      let hit = false
      for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
        const [xi, yi] = shape[i],
          [xj, yj] = shape[j]
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
      }
      return hit
    }
    for (const p of f.places) {
      assert.ok(inside([p.x, p.y], plan.outline), p.id + ' is on the floor')
      assert.ok(!plan.bookable.some((r) => inside([p.x, p.y], r.shape)), p.id + ' is not in a room')
    }
    assert.equal(hit.mapPoints.size, 199)
    assert.deepEqual(hit.resolveTap({ at: hit.mapPoints.get('I150'), pxPerUnit: 2, zoom: 4, touch: true }), {
      action: 'select',
      id: 'I150',
    })
    assert.deepEqual(hit.resolveTap({ at: hit.mapPoints.get('T02'), pxPerUnit: 1.5, zoom: 3, touch: true }), {
      action: 'select',
      id: 'T02',
    })
  } finally {
    f.setFloor(8)
  }
})

test('Readings at the same time settle the same way everywhere', () => {
  const a = event('report', 'I030', 'free', 1000),
    b = event('sensor', 'I030', 'occupied', 1000)
  for (const at of [now, now + ttl.report]) {
    const one = derive([a, b], at).states.get('I030'),
      other = derive([b, a], at).states.get('I030')
    assert.equal(one.status, other.status)
    assert.equal(one.latest, other.latest)
    assert.deepEqual(one.evidence, other.evidence)
  }
})
