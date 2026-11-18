import positions from './individual-layout.json' with { type: 'json' }
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
export const tables = TABLE_ROWS.flat().map(([x, y], i) => ({
  id: 'T' + String(i + 1).padStart(2, '0'),
  x,
  y,
  section: 'tables',
}))
export const individuals = positions.map(([x, y], i) => ({
  id: 'I' + String(i + 1).padStart(3, '0'),
  x,
  y,
  section: 'individuals',
}))
export const places = [...tables, ...individuals]
export const byId = new Map(places.map((p) => [p.id, p]))
export const chairs = (place) =>
  place.section === 'tables'
    ? ['A', 'B', 'C', 'D'].map((c) => place.id + '-' + c)
    : [place.id]
export const seats = places.flatMap(chairs)
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
