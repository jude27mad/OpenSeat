import { useEffect, useRef, useState } from 'react'
import { merge } from './model.js'
import { floorEvents } from './floor-events.js'
import { sendObservation, serverNow, watchFloor } from './firebase.js'
export { serverNow }
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
// The live floors are rooms named after them; a demo is a random room id.
export const isLive = (room) => room.id.startsWith('floor')
const sessionKey = (number) => (number === 8 ? SESSION : SESSION + '.f' + number)
export function chosenRoom(live = false, forceNew = false, number = 8) {
  if (live) return { id: 'floor' + number, anchor: 0, floor: number }
  const params = new URLSearchParams(location.hash.slice(1)),
    id = params.get('demo'),
    anchor = Number(params.get('start')),
    level = Number(params.get('level')) || 8
  if (
    !forceNew &&
    level === number &&
    uuid.test(id || '') &&
    anchor > 0 &&
    anchor <= Date.now() + 60000
  ) {
    // Remember a demo opened from a link, so Live floor and back returns to it.
    if (Date.now() - anchor < 6 * 3600000) set(sessionKey(number), { id, anchor })
    return { id, anchor, floor: number }
  }
  const existing = get(sessionKey(number))
  if (!forceNew && existing && Date.now() - existing.anchor < 6 * 3600000)
    return { ...existing, floor: number }
  const room = { id: crypto.randomUUID(), anchor: Date.now() }
  set(sessionKey(number), room)
  return { ...room, floor: number }
}
export function roomUrl(room, spot) {
  const target = new URL(location.pathname, location.origin),
    params = new URLSearchParams()
  if (isLive(room)) params.set('floor', String(room.floor))
  else {
    params.set('demo', room.id)
    params.set('start', String(room.anchor))
    if (room.floor !== 8) params.set('level', String(room.floor))
  }
  if (spot) params.set('spot', spot)
  target.hash = params.toString()
  return target.href
}
const recent = (rows) => rows.filter((row) => row.source === 'floorAdmin' || Date.now() - row.at < 86400000)
export function useFloor(room) {
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
    const event = await sendObservation(room.id, input)
    // Only acknowledged writes are shown immediately; the subscription receives every device's changes.
    if (current.current) setUpdates((prior) => merge(prior, [event]))
    return event
  }
  return { events: floorEvents(room, updates), online, record, updates }
}
