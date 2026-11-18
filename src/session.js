import { useEffect, useRef, useState } from 'react'
import { merge, seedDemo } from './model.js'
import { sendObservation, watchFloor } from './firebase.js'
const SESSION = 'openseat.room.v1',
  uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
function get(key) {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}
function set(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* Storage can be unavailable in private mode. */
  }
}
export function chosenRoom(live = false, forceNew = false) {
  if (live) return { id: 'floor8', anchor: 0 }
  const params = new URLSearchParams(location.hash.slice(1)),
    id = params.get('demo'),
    anchor = Number(params.get('start'))
  if (
    !forceNew &&
    uuid.test(id || '') &&
    anchor > 0 &&
    anchor <= Date.now() + 60000
  )
    return { id, anchor }
  const existing = get(SESSION)
  if (!forceNew && existing && Date.now() - existing.anchor < 6 * 3600000)
    return existing
  const room = { id: crypto.randomUUID(), anchor: Date.now() }
  set(SESSION, room)
  return room
}
export function roomUrl(room, spot, checkin = false) {
  const target = new URL(location.pathname, location.origin),
    params = new URLSearchParams()
  if (room.id === 'floor8') params.set('floor', '8')
  else {
    params.set('demo', room.id)
    params.set('start', String(room.anchor))
  }
  if (spot) params.set('spot', spot)
  if (spot && checkin) params.set('checkin', '1')
  target.hash = params.toString()
  return target.href
}
const recent = (rows) => rows.filter((row) => Date.now() - row.at < 86400000)
export function useFloor(room) {
  const demo = room.id !== 'floor8'
  const cache = 'openseat.cache.' + room.id
  const [updates, setUpdates] = useState(() => recent(get(cache) || []))
  const [online, setOnline] = useState('connecting')
  const current = useRef(true)
  useEffect(() => {
    current.current = true
    const stop = watchFloor(room.id, (rows) => {
      const snapshot = recent(rows)
      setUpdates(snapshot)
      set(cache, snapshot)
    }, setOnline)
    return () => { current.current = false; stop() }
  }, [room.id, cache])

  async function record(input) {
    const previousTicket = input.source === 'qr' ? get('openseat.ticket.' + room.id) : null
    const event = await sendObservation(room.id, input, previousTicket)
    // Only acknowledged writes are shown immediately; the subscription receives every device's changes.
    if (current.current) setUpdates((prior) => merge(prior, [event]))
    return event
  }
  return { events: merge(demo ? seedDemo(room.anchor) : [], updates), online, record, updates }
}
