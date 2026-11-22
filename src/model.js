import { places, chairs, seats, byId } from './floor.js'
export const sources = {
  report: 'Student report',
  sensor: 'Seat sensor',
  ble: 'Bluetooth',
}
// The database may still hold updates from sources OpenSeat no longer uses,
// such as old QR check-ins. Those are left out everywhere.
export const known = (event) => !!event && Object.hasOwn(sources, event.source)
export const cutoff = -75
export const ttl = {
  report: 15 * 60000,
  sensor: 5 * 60000,
  ble: 2 * 60000,
}
// In a demo room nothing expires: a `lasting` reading counts until it is
// replaced by a new report or sensor reading.
export function lifetime(event) {
  if (!known(event)) return 0
  return event.lasting ? Infinity : ttl[event.source]
}
export const fresh = (event, now) =>
  !!event && now >= event.at - 5000 && now - event.at < lifetime(event)
export const statuses = {
  free: 'Free',
  occupied: 'Taken',
  unknown: 'No recent info',
}
export function age(at, now) {
  if (!Number.isFinite(at)) return 'No update'
  const seconds = Math.max(0, Math.floor((now - at) / 1000))
  if (seconds < 5) return 'Just now'
  if (seconds < 60) return seconds + 's ago'
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago'
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago'
  return Math.floor(seconds / 86400) + 'd ago'
}
export const keyOf = (e) => e.source + '/' + e.target
export function merge(latest, updates) {
  const next = new Map(latest.map((e) => [keyOf(e), e]))
  for (const e of updates) {
    const key = keyOf(e),
      prev = next.get(key)
    if (!prev || e.at > prev.at || (e.at === prev.at && e.id > prev.id))
      next.set(key, e)
  }
  return [...next.values()]
}
export function seedDemo(anchor) {
  const rows = []
  const put = (source, target, value, minutes) =>
    rows.push({
      source,
      target,
      value,
      at: anchor - minutes * 60000,
      simulated: true,
      fixture: true,
      id: 'example-' + source + '-' + target,
    })
  seats.forEach((seat, i) => {
    const n = (i * 43 + 7) % 101
    if (n >= 80) return
    put('report', seat, n < 34 ? 'free' : 'occupied', 1 + (i % 10))
  })
  return rows
}
// How a seat's status is decided, in three rules:
// 1. A current seat-sensor reading decides the seat. It overrides reports.
// 2. Otherwise the newest student report decides.
// 3. Old updates stop counting, and the seat shows No recent info.
export function resolveSeat(events, now) {
  // Equal times settle the same way on every device: report, then sensor, then id.
  const rank = { report: 2, sensor: 1 }
  const ordered = events
    .filter(known)
    .sort((a, b) =>
      b.at - a.at ||
      (rank[b.source] || 0) - (rank[a.source] || 0) ||
      String(b.id).localeCompare(String(a.id)))
  const active = ordered.filter((e) => fresh(e, now))
  const sensor = active.find((e) => e.source === 'sensor')
  const decides = sensor || active.find((e) => e.source === 'report')
  if (!decides)
    return {
      status: 'unknown',
      evidence: ordered,
      latest: ordered[0],
      stale: !!ordered.length,
    }
  return {
    status: decides.value,
    evidence: ordered,
    latest: decides,
    stale: false,
    sensor,
  }
}
export function derive(events, now) {
  const bucket = new Map()
  for (const event of events.filter(known)) {
    const group = bucket.get(event.target) || []
    group.push(event)
    bucket.set(event.target, group)
  }
  function forTarget(target) {
    const group = bucket.get(target) || []
    return group.some((e) => !e.fixture)
      ? group.filter((e) => !e.fixture)
      : group
  }
  const states = new Map(
    seats.map((id) => [id, resolveSeat(forTarget(id), now)]),
  )
  const counts = { free: 0, occupied: 0, unknown: 0 }
  for (const item of states.values()) counts[item.status]++
  const locations = new Map()
  for (const p of places) {
    const ids = chairs(p),
      member = ids.map((id) => states.get(id)),
      tally = { free: 0, occupied: 0, unknown: 0 }
    for (const item of member) tally[item.status]++
    // A table is free if any chair is, taken if all are, partly in use otherwise.
    const status = tally.free
      ? 'free'
      : tally.occupied === ids.length
        ? 'occupied'
        : tally.occupied
          ? 'inuse'
          : 'unknown'
    const evidence = member.flatMap((s) => s.evidence).sort((a, b) => b.at - a.at)
    locations.set(p.id, {
      ...p,
      ids,
      tally,
      status,
      latest:
        member
          .filter((s) => !s.stale && s.latest)
          .map((s) => s.latest)
          .sort((a, b) => b.at - a.at)[0] || evidence[0],
      evidence,
    })
  }
  return {
    counts,
    states,
    locations,
    ble: Object.fromEntries(
      ['tables', 'individuals'].map((z) => [
        z,
        forTarget(z).find((e) => e.source === 'ble'),
      ]),
    ),
  }
}
export function scanCount(rows) {
  if (!Array.isArray(rows) || rows.length > 20000)
    throw new Error('Select one BLE2MQTT JSON scan array.')
  if (
    rows.some(
      (r) =>
        !r ||
        typeof r.addr !== 'string' ||
        !r.addr.trim() ||
        !Number.isInteger(r.rssi) ||
        r.rssi > 0 ||
        r.rssi < -127,
    )
  )
    throw new Error('Each reading needs a device identifier and a valid RSSI.')
  return new Set(
    rows
      .filter((r) => r.rssi >= cutoff)
      .map((r) => r.addr.trim().toUpperCase()),
  ).size
}
export function placeDescription(p) {
  if (!p) return ''
  if (p.status === 'unknown') return 'No recent info'
  if (p.ids.length === 1) return statuses[p.status]
  if (p.status === 'inuse')
    return p.tally.occupied
      ? p.tally.occupied + ' of 4 chairs taken'
      : 'Someone is at this table'
  return p.status === 'free'
    ? p.tally.free + ' of 4 chairs free'
    : 'All 4 chairs taken'
}
// A place worth suggesting: at least one free chair or seat.
export const looksFree = (p) => p.status === 'free'
// Best suggestions first: most free chairs, then the freshest evidence.
export function suggestions(locations, now, section = 'all') {
  return [...locations.values()]
    .filter((p) => looksFree(p) && (section === 'all' || p.section === section))
    .sort(
      (a, b) =>
        b.tally.free - a.tally.free ||
        (fresh(b.latest, now) ? b.latest.at : 0) -
          (fresh(a.latest, now) ? a.latest.at : 0) ||
        a.id.localeCompare(b.id),
    )
}
// Matches what people type: "table 5", "T5", "seat 12", "12", "T17-B".
export function matchesQuery(p, query) {
  const q = query.toLowerCase().trim()
  if (!q) return true
  const spot = parseSpot(q.replace(/\s+/g, ''))
  if (spot) return spot.id === p.id
  const words = q.match(/^(table|tbl|t|seat|s|i|chair)?\s*0*(\d+)$/)
  if (words) {
    const n = Number(words[2]),
      kind = words[1]
    const number = Number(p.id.slice(1))
    if (n !== number) return false
    if (!kind || kind === 'chair') return true
    return /^t/.test(kind) ? p.section === 'tables' : p.section === 'individuals'
  }
  const area = p.section === 'tables' ? 'round table' : 'individual seat solo'
  return area.includes(q)
}
export function parseSpot(input) {
  if (typeof input !== 'string') return null
  const [id, letter, ...rest] = input.toUpperCase().split('-'),
    p = byId.get(id)
  if (
    !p ||
    rest.length ||
    (letter !== undefined &&
      (p.section !== 'tables' || !/^[A-D]$/.test(letter)))
  )
    return null
  return {
    id,
    seat: letter ? id + '-' + letter : p.section === 'individuals' ? id : null,
  }
}
