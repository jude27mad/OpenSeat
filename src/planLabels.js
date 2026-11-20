// Label positions are in the same plan coordinates as the seat hit targets.
// Size caps keep longer names inside their aisles on narrow screens.
export function planLabels(number, size) {
  switch (number) {
    case 5:
      return [
        [103, 62, 0, 'LIFTS', size, 'middle'],
        [169, 418, 0, 'INDIVIDUAL SEATS', Math.min(size, 18), 'middle'],
        [476, 373, -39, 'BOOKABLE ROOMS', Math.min(size, 17)],
        [243, 239, -40, 'SEMINAR ROOM', Math.min(size, 16)],
        [616, 387, 0, 'MEDIA ROOMS', Math.min(size, 17), 'middle'],
      ]
    case 7:
      return [
        [143, 64, 0, 'LIFTS', size, 'middle'],
        [653, 43, 0, 'INDIVIDUAL SEATS', Math.min(size, 18), 'middle'],
        [298, 34, 0, 'BOOKABLE ROOMS', Math.min(size, 17), 'middle'],
        [242, 256, 0, 'QUIET FLOOR', Math.min(size, 15), 'middle'],
        [100, 583, -90, 'GRAD SPACE', Math.min(size, 11)],
        [758, 327, -90, 'SILENT SPACE', Math.min(size, 13)],
      ]
    case 8:
      return [
        [141, 103, 0, 'LIFTS', size, 'middle'],
        [745, 198, 0, 'ROUND TABLES', size, 'end'],
        [270, 257, 40, 'INDIVIDUAL SEATS', Math.min(size, 22)],
        [242, 471, -48, 'BOOKABLE ROOMS', Math.min(size, 22)],
        [468, 216, -49, 'BOOKABLE ROOMS', Math.min(size, 22)],
      ]
    default:
      return []
  }
}
