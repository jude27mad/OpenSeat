import test from 'node:test'
import assert from 'node:assert/strict'
import { recommendationPaused, reportHistory } from '../backend/firebase/report-history.js'
import { floorEvents } from '../src/floor-events.js'
import { derive, suggestions } from '../src/model.js'
import { setFloor } from '../src/floor.js'

const start = 1_000_000
function report(value, seconds, previous, target = 'I005', resetAt = 0) {
  const at = start + seconds * 1000
  return { source: 'report', target, value, at, ...reportHistory(previous, value, at, resetAt) }
}
function reversal(target) {
  const first = report('free', 0, undefined, target)
  const second = report('occupied', 25, first, target)
  return report('free', 60, second, target)
}

test('a rapid live reversal pauses suggestions for 15 minutes, even after a same-value confirmation', () => {
  const third = reversal('I005')
  assert.equal(recommendationPaused(third, third.at), true)
  const confirmed = report('free', 100, third)
  assert.equal(recommendationPaused(confirmed, third.at + 899_999), true)
  assert.equal(recommendationPaused(confirmed, third.at + 900_000), false)
  const held = report('occupied', 135, confirmed)
  assert.equal(recommendationPaused(held, held.at), true)
  assert.equal(recommendationPaused(held, third.at + 900_000), false)
})

test('a single correction and a slower sequence stay eligible; each rapid reversal extends the pause', () => {
  const first = report('occupied', 0)
  const second = report('free', 25, first)
  assert.equal(recommendationPaused(second, second.at), false)
  const slow = report('occupied', 61, second)
  assert.equal(recommendationPaused(slow, slow.at), false)
  const quick = report('free', 80, slow)
  assert.equal(recommendationPaused(quick, quick.at), true)
  const again = report('occupied', 100, quick)
  assert.equal(recommendationPaused(again, quick.at + 900_000), true)
  assert.equal(recommendationPaused(again, again.at + 900_000), false)
})

test('automatic picks count eligible chairs without changing the reported floor and table counts', () => {
  setFloor(8)
  const contested = reversal('T01-A'), single = reversal('I005')
  const available = report('free', 5, undefined, 'T01-B')
  const model = derive([available, contested, single], contested.at)
  assert.equal(model.counts.free, 3)
  assert.equal(model.recommendableFree, 1)
  assert.equal(model.locations.get('T01').tally.free, 2)
  assert.equal(model.locations.get('T01').latestFree.target, 'T01-B')
  assert.deepEqual(suggestions(model.locations, contested.at).map((p) => p.id), ['T01'])
  const sensor = { source: 'sensor', target: 'I005', value: 'free', at: single.at }
  assert.equal(derive([sensor, single], single.at).recommendableFree, 1)
  assert.equal(derive([{ ...single, lasting: true }], single.at).recommendableFree, 1)
})

test('reports after an admin reset start new history when old observations precede the reset', () => {
  setFloor(8)
  const rapid = reversal('I005')
  const reset = { source: 'floorAdmin', target: 'status', at: rapid.at, value: 'unknown' }
  const after = report('free', 65, rapid, 'I005', reset.at)
  const corrected = report('occupied', 70, after, 'I005', reset.at)
  assert.equal(after.cycleEnd, undefined)
  assert.equal(corrected.holdAt, undefined)
  const rows = floorEvents({ id: 'floor8', floor: 8 }, [reset, after])
  assert.equal(derive(rows, after.at).recommendableFree, 1)
})
