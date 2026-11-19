import positions from './individual-layout.json' with { type: 'json' }
import floor5 from './floor5-layout.json' with { type: 'json' }
export const TABLE_ROWS = [
  [
    [67, 276],
    [104, 311],
    [140, 344],
    [176, 377],
    [212, 410],
    [248, 442],
    [284, 477],
    [320, 510],
    [356, 543],
    [394, 576],
  ],
  [
    [84, 368],
    [120, 400],
    [156, 432],
    [192, 466],
    [226, 498],
    [262, 530],
    [297, 562],
    [332, 595],
    [369, 628],
    [404, 660],
    [439, 694],
  ],
  [
    [84, 457],
    [119, 488],
    [154, 520],
    [190, 553],
    [224, 586],
    [260, 618],
    [294, 650],
    [330, 682],
    [366, 716],
  ],
  [
    [88, 544],
    [124, 578],
    [162, 610],
    [200, 646],
    [236, 682],
    [274, 714],
  ],
  [
    [82, 610],
    [115, 642],
    [148, 675],
    [182, 706],
  ],
]
export const rooms = [
  [80, 172],
  [110, 141],
  [118, 206],
  [146, 174],
  [156, 240],
  [186, 210],
  [194, 273],
  [222, 243],
  [232, 306],
  [259, 276],
  [287, 327],
  [355, 416],
  [384, 386],
  [392, 449],
  [422, 420],
  [430, 482],
  [458, 452],
  [470, 515],
  [497, 484],
  [540, 521],
]
// Every floor shares the same shape of data. Floor 8 was traced in its own
// frame and is turned a quarter turn to draw; Floor 5 is stored as drawn.
const floor8Tables = TABLE_ROWS.flat().map(([x, y], i) => ({
  id: 'T' + String(i + 1).padStart(2, '0'),
  x,
  y,
  section: 'tables',
}))
const floor8Seats = positions.map(([x, y], i) => ({
  id: 'I' + String(i + 1).padStart(3, '0'),
  x,
  y,
  section: 'individuals',
}))
const floor5Seats = floor5.seats.map(([x, y, angle], i) => ({
  id: 'I' + String(i + 1).padStart(3, '0'),
  x,
  y,
  angle,
  section: 'individuals',
}))
export const FLOORS = {
  8: {
    number: 8,
    name: 'Floor 8',
    title: 'Floor 8 · The Sky',
    viewBox: [790, 680],
    point: (x, y) => [y, 662 - x],
    tables: floor8Tables,
    individuals: floor8Seats,
    rooms,
    notCounted: rooms.length + ' bookable rooms',
  },
  5: {
    number: 5,
    name: 'Floor 5',
    title: 'Floor 5 · The Sun',
    viewBox: floor5.viewBox,
    point: (x, y) => [x, y],
    tables: [],
    individuals: floor5Seats,
    rooms: [],
    plan: floor5,
    notCounted:
      floor5.bookable.length +
      ' bookable rooms, a seminar room and ' +
      floor5.media.length +
      ' media rooms',
  },
}
export const floorNumbers = [5, 8]

export function chairs(place) {
  return place.section === 'tables'
    ? ['A', 'B', 'C', 'D'].map((c) => place.id + '-' + c)
    : [place.id]
}
// The floor on screen. These are live bindings: setFloor() swaps them, and
// every module that imports them sees the new floor.
export let floor, tables, individuals, places, byId, seats, mapPoints, spacing
export function setFloor(number) {
  const next = FLOORS[number] || FLOORS[8]
  if (next === floor) return floor
  floor = next
  tables = floor.tables
  individuals = floor.individuals
  places = [...tables, ...individuals]
  byId = new Map(places.map((p) => [p.id, p]))
  seats = places.flatMap(chairs)
  mapPoints = new Map(places.map((p) => [p.id, floor.point(p.x, p.y)]))
  // Distance from each place to its closest neighbour, in plan units.
  spacing = new Map(
    places.map((p) => {
      const [x, y] = mapPoints.get(p.id)
      let best = Infinity
      for (const q of places) {
        if (q === p) continue
        const [qx, qy] = mapPoints.get(q.id)
        best = Math.min(best, Math.hypot(qx - x, qy - y))
      }
      return [p.id, best]
    }),
  )
  return floor
}
setFloor(8)
export const parentId = (id) => id?.split('-')[0]
export function label(id) {
  if (id === 'tables') return 'Round-table area'
  if (id === 'individuals') return 'Individual-seat area'
  const [parent, letter] = id.split('-')
  return (
    (id.startsWith('T') ? 'Table ' : 'Seat ') +
    parent.slice(1).replace(/^0(?=\d{2})/, '') +
    (letter ? ' · Chair ' + letter : '')
  )
}
