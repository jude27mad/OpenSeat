import { chairs, FLOORS } from './floor.js'
import { known, seedDemo } from './model.js'

const seatsByFloor = Object.fromEntries(Object.entries(FLOORS).map(([number, plan]) => [
  number, [...plan.tables, ...plan.individuals].flatMap(chairs),
]))

// A single server-timestamped write changes the whole floor together. Keeping
// the marker means an old reading (or the original demo seed) cannot reappear.
export function floorEvents(room, rows) {
  const demo = !room.id.startsWith('floor')
  const ids = seatsByFloor[room.floor]
  const reset = rows.find((row) => row.source === 'floorAdmin' && row.target === 'status')
  const events = reset || !demo ? [] : seedDemo(room.anchor, ids)
  if (reset && reset.value !== 'unknown') {
    for (const target of ids)
      events.push({ ...reset, source: 'admin', target, simulated: demo })
  }
  for (const event of rows) {
    if (known(event) && (!reset || event.source === 'ble' || event.at > reset.at))
      events.push(event)
  }
  return demo ? events.map((event) => ({ ...event, lasting: true })) : events
}
