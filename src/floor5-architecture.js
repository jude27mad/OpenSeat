// Floor 5, in the landscape coordinate frame shared with its seat locations.
// The hatch footprints meet at the intersections of the source partitions.
// Walls are separate open paths so the doorways stay open through the hatch.
export default {
  rooms: [
    // Four bookable rooms along the seminar room's southeast edge.
    'M342 383 381 430 325 477 292 424Z',
    'M388 344 427 391 381 430 342 383Z',
    'M435 305 474 351 427 391 388 344Z',
    'M478 268 517 315 474 351 435 305Z',
    // Three more along its northeast edge, and the room across the aisle.
    'M377 145 408 183 364 220 332 182Z',
    'M408 183 442 224 398 261 364 220Z',
    'M442 224 478 268 435 305 398 261Z',
    'M549 210 587 256 544 295 504 248Z',
    // Three long tables. The right-hand room meets the stair landing.
    'M457 76 507 99 433 162 401 124Z',
    'M507 99 560 124 467 203 433 162Z',
    'M560 124 605 145 605 163 504 248 467 203Z',
    // Seminar room and three media rooms.
    'M332 182 435 305 292 424 208 289Z',
    'M431 431 524 548 403 603 342 505Z',
    'M509 364 625 502 524 548 431 431Z',
    'M674 225 713 462 625 502 509 364Z',
  ],
  walls: [
    // Seminar and bookable spaces. A shared wall is drawn only once.
    'M281 407 208 289 316 197 M332 182 383 139 M394 130 457 76',
    'M290 421 325 477 M341 463 412 403 M425 392 431 388 M443 378 517 315',
    'M292 424 383 348 M388 344 478 268',
    'M342 383 381 430 M388 344 427 391',
    'M332 182 395 257 M399 261 474 351',
    'M377 145 396 168 M406 180 409 185 M420 197 437 218 M442 224 466 253 M490 283 517 315',
    'M364 220 404 186 M398 261 437 228',
    'M401 124 420 147 M430 159 434 164 M445 177 491 232 M519 265 544 295',
    'M457 76 605 145 605 163 504 248 M507 99 438 158 M560 124 467 203',
    'M549 210 587 256 668 187 M587 256 544 295',
    // Media rooms have independent entrances along the northwest side.
    'M416 443 342 505 403 603 713 462 674 225 525 351',
    'M511 363 445 419 M432 429 427 434',
    'M431 431 524 548 M509 364 625 502',
  ].join(' '),
  services: [
    'M28 9V144 M28 300V432 M147 8V22 M147 56V382 M147 419V433H48',
    'M147 77H67V101 M67 127V174 M67 203V244 M67 274V315 M67 341V366H147',
    'M67 151H147 M67 223H147 M67 292H147',
    'M609 60V185 M668 59V187',
  ].join(' '),
  furniture: [
    { kind: 'round', x: 332.5, y: 430 },
    { kind: 'round', x: 382.6, y: 384.8 },
    { kind: 'round', x: 431.6, y: 346.6 },
    { kind: 'round', x: 476.9, y: 309.6 },
    { kind: 'round', x: 437.1, y: 262.7 },
    { kind: 'round', x: 402.2, y: 225.1 },
    { kind: 'round', x: 368.4, y: 183.1 },
    { kind: 'round', x: 548.3, y: 254.5 },
    { kind: 'long', x: 449.6, y: 115, angle: -42 },
    { kind: 'long', x: 493.8, y: 145, angle: -42 },
    { kind: 'long', x: 542.8, y: 175.5, angle: -42 },
  ],
  // Each straight row contains three adjacent desks, two chairs per desk.
  seminarRows: [
    { x: 283.7, y: 252.3, angle: -39.2, length: 113, seats: 6 },
    { x: 298.5, y: 270.7, angle: -39.2, length: 113, seats: 6 },
    { x: 313.2, y: 288.5, angle: -39.2, length: 113, seats: 6 },
    { x: 328.0, y: 307.2, angle: -39.2, length: 113, seats: 6 },
    { x: 343.2, y: 325.2, angle: -39.2, length: 113, seats: 6 },
  ],
  // The west stairs are cropped by the original floor drawing.
  stairs: [
    'M4 45H26V94H19V89H13V83H7V77H4Z M4 86H10V88L8 90 12 94 11 95 6 92 4 93Z',
    'M4 349H26V398H19V393H13V387H7V381H4Z M4 390H10V392L8 394 12 398 11 400 6 396 4 398Z',
    'M611 104H661V154H654V148H648V142H642V136H636V129H629V123H623V117H617V111H611Z M637 145H645V147L643 149 647 153 645 155 641 151 639 153H637Z',
  ],
}
