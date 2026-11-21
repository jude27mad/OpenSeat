import test from 'node:test'
import assert from 'node:assert/strict'
import { observation } from '../src/ble.js'

const reading = (time, msec) => ({ addr: 'test', rssi: -75, time, msec })

test('offsetless scanner times follow the Toronto clock in winter and summer', () => {
  for (const [date, utcHour] of [['2026-11-17', 22], ['2026-07-17', 21]]) {
    const measuredAt = Date.parse(`${date}T${utcHour}:25:27.282Z`)
    assert.deepEqual(observation([reading(`${date} 17:25:27`, '282')], measuredAt + 900), {
      measuredAt,
      value: 1,
    })
  }
})

test('the fresh window spans both Toronto daylight-saving transitions', () => {
  const fromSpring = Date.parse('2026-03-08T06:59:59.950Z')
  const afterSpring = Date.parse('2026-03-08T07:00:20Z')
  assert.equal(observation([reading('2026-03-08 01:59:59', 950)], afterSpring).measuredAt, fromSpring)
  assert.throws(() => observation([reading('2026-03-08 02:00:19')], afterSpring), /old scanner/)

  const afterFall = Date.parse('2026-11-01T06:00:20Z')
  assert.equal(observation([reading('2026-11-01 01:59:59')], afterFall).measuredAt,
    Date.parse('2026-11-01T05:59:59Z'))
  assert.equal(observation([reading('2026-11-01 01:00:19')], afterFall).measuredAt,
    Date.parse('2026-11-01T06:00:19Z'))
})

test('explicit offsets and milliseconds represent the same instant across scan formats', () => {
  const measuredAt = Date.parse('2026-11-17T22:25:27.005Z')
  for (const time of [
    '2026-11-17 17:25:27.005',
    '2026-11-17T14:25:27-0800',
    '2026-11-17T23:25:27+01:00',
    '2026-11-17T22:25:27.005Z',
  ])
    assert.equal(observation([reading(time, '5')], measuredAt + 1000).measuredAt, measuredAt)
})
