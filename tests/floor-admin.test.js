import assert from 'node:assert/strict'
import test from 'node:test'
import { floorEvents } from '../src/floor-events.js'
import { setFloor } from '../src/floor.js'
import { derive, ttl } from '../src/model.js'

const now = Date.now()
const marker = (value) => ({ id: 'reset', source: 'floorAdmin', target: 'status', value, at: now })
const reading = (source, value, at, target = 'I010') => ({ id: source + at, source, target, value, at })
const live = { id: 'floor5', floor: 5 }
test('one owner update resets a floor and accepts only subsequent seat observations', () => {
  setFloor(5)
  const rows = [reading('sensor', 'occupied', now - 10), reading('ble', 4, now - 100, 'individuals'), marker('free')]
  const model = (rows, time = now + 100) => derive(floorEvents(live, rows), time)
  assert.deepEqual(model(rows).counts, { free: 166, occupied: 0, unknown: 0 })
  assert.deepEqual(model([marker('occupied')]).counts, { free: 0, occupied: 166, unknown: 0 })
  assert.equal(model([marker('occupied'), reading('report', 'free', now + 20)]).counts.free, 1)
  assert.equal(model(rows).states.get('I010').latest.source, 'admin')
  assert.equal(model(rows).ble.individuals.value, 4)
  assert.equal(model(rows, now + ttl.admin).counts.unknown, 166)
  assert.equal(model([...rows, reading('report', 'occupied', now + 10)]).counts.occupied, 1)
  assert.equal(model([...rows, reading('sensor', 'occupied', now + 10), reading('report', 'free', now + 20)]).counts.occupied, 1)
})
test('clearing a demo keeps its example seats and earlier readings from reappearing', () => {
  setFloor(5)
  const demo = { id: 'demo', floor: 5, anchor: now }
  const before = reading('report', 'free', now - 10)
  const cleared = floorEvents(demo, [before, marker('unknown')])
  assert.equal(derive(cleared, now).counts.unknown, 166)
  const demoFree = floorEvents(demo, [before, marker('free')])
  assert.equal(derive(demoFree, now + 86400000).counts.free, 166)
})
