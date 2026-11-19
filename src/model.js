import { places, chairs, seats, byId, tables } from './floor.js'
export const sources = {
  report: 'Student report',
  qr: 'QR check-in',
  sensor: 'Table sensor',
  ble: 'Bluetooth',
}
export const cutoff = -75
export const ttl = {
  report: 15 * 60000,
  qr: 60 * 60000,
  sensor: 5 * 60000,
  ble: 2 * 60000,
}
// In a demo room nothing expires: a `lasting` reading counts until someone
// replaces it by reporting the seat, checking in or checking out.
export function lifetime(event) {
  if (event.lasting) return Infinity
  return event.source === 'qr' && event.value === 'free'
    ? 5 * 60000
    : ttl[event.source]
}
export const fresh = (event, now) =>
  !!event && now >= event.at - 5000 && now - event.at < lifetime(event)
export const statuses = {
  free: 'Free',
  occupied: 'Taken',
  unknown: 'No recent info',
  mixed: 'Mixed reports',
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
    const source = n % 3 === 0 ? 'qr' : 'report'
    put(source, seat, n < 34 ? 'free' : 'occupied', 1 + (i % 10))
  })
  for (const [i, p] of tables.entries())
    if (i % 4 === 0) put('sensor', p.id, 'occupied', 1)
  if (tables.length) put('ble', 'tables', 18, 0.5)
  put('ble', 'individuals', 9, 1)
  return rows
}
export function resolveSeat(events, now) {
  const ordered = [...events].sort((a, b) => b.at - a.at)
  const active = ordered.filter((e) => fresh(e, now))
  if (!active.length)
    return {
      status: 'unknown',
      evidence: ordered,
      latest: ordered[0],
      stale: !!ordered.length,
    }
  // A student's report and a check-in describe the same moment-to-moment fact,
  // so the newer one wins: a confirmed "It's free" clears an abandoned check-in,
  // and checking in after a free report shows the seat as taken.
  const people = active.filter((e) => e.source === 'report' || e.source === 'qr')
  const kept = people.length ? [people[0], ...active.filter((e) => !people.includes(e))] : active
  return {
    status: new Set(kept.map((e) => e.value)).size > 1 ? 'mixed' : kept[0].value,
    evidence: ordered,
    latest: active[0],
    stale: false,
  }
}
export function derive(events, now) {
  const bucket = new Map()
  for (const event of events) {
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
  const counts = { free: 0, occupied: 0, unknown: 0, mixed: 0 }
  for (const item of states.values()) counts[item.status]++
  const locations = new Map()
  for (const p of places) {
    const ids = chairs(p),
      member = ids.map((id) => states.get(id)),
      tally = { free: 0, occupied: 0, unknown: 0, mixed: 0 }
    for (const item of member) tally[item.status]++
    const sensor =
      p.section === 'tables'
        ? forTarget(p.id).find((e) => e.source === 'sensor')
        : null
    const sensorActive = fresh(sensor, now)
    let status = 'unknown'
    if (tally.free) status = 'free'
    else if (tally.occupied === ids.length) status = 'occupied'
    else if (tally.occupied || (sensorActive && sensor.value === 'occupied'))
      status = 'inuse'
    else if (sensorActive && sensor.value === 'free') status = 'sensorfree'
    if (
      tally.mixed ||
      (sensorActive &&
        ((sensor.value === 'free' && tally.occupied > 0) ||
          (sensor.value === 'occupied' && tally.free === ids.length)))
    )
      status = 'mixed'
    const evidence = [
      ...member.flatMap((s) => s.evidence),
      ...(sensor ? [sensor] : []),
    ].sort((a, b) => b.at - a.at)
    locations.set(p.id, {
      ...p,
      ids,
      tally,
      status,
      sensor,
      latest: evidence.find((e) => fresh(e, now)) || evidence[0],
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
  if (p.status === 'mixed') return 'Mixed reports'
  if (p.status === 'sensorfree') return 'Table sensor says free'
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
// A place worth suggesting: a reported free chair, or a table its sensor reports free.
export const looksFree = (p) => p.tally.free > 0 || p.status === 'sensorfree'
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
// When the latest check-in on this seat stops holding it.
export const holdsUntil = (event) => (event.lasting ? Infinity : event.at + ttl.qr)
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
