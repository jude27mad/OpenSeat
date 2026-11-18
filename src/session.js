import { useCallback, useEffect, useRef, useState } from 'react'
import { merge, seedDemo } from './model.js'
const API =
  import.meta.env.VITE_OPENSEAT_API ||
  'https://openseat-slc-data.floot.app/_api'
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
export function ticket(room) {
  const k = 'openseat.ticket.' + room
  if (!ticket.memory) ticket.memory = new Map()
  const existing = ticket.memory.get(k) || get(k)
  if (existing) return existing
  const value = crypto.randomUUID()
  ticket.memory.set(k, value)
  set(k, value)
  return value
}
export async function requestApi(path, options = {}) {
  const { body, signal } = options
  const res = await fetch(API + '/' + path, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal: signal || AbortSignal.timeout(12000),
    ...(body
      ? {
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify(body),
        }
      : {}),
  })
  if (!res.ok) {
    let message
    try {
      message = (await res.json()).error
    } catch {}
    const e = new Error(
      message || 'The shared service could not save this update.',
    )
    e.status = res.status
    throw e
  }
  return res.json()
}
export function useFloor(room) {
  const demo = room.id !== 'floor8'
  const [updates, setUpdates] = useState(
    () => get('openseat.cache.' + room.id) || [],
  )
  const [online, setOnline] = useState('connecting')
  const current = useRef(true),
    channel = useRef(null)
  const save = useCallback(
    (rows) => {
      if (!current.current) return
      setUpdates((previous) => {
        const next = merge(previous, rows).filter(
          (e) => Date.now() - e.at < 86400000,
        )
        set('openseat.cache.' + room.id, next)
        return next
      })
    },
    [room.id],
  )
  useEffect(() => {
    current.current = true
    let disposed = false,
      ws,
      timer,
      retry = 0,
      expiry,
      inFlight = false,
      needsRefresh = false
    const bus =
      'BroadcastChannel' in window
        ? new BroadcastChannel('openseat:' + room.id)
        : null
    channel.current = bus
    if (bus)
      bus.onmessage = (e) => {
        if (e.data?.event) save([e.data.event])
      }
    async function load(listen) {
      const data = await requestApi(
        'seat-state?room=' + room.id + (listen ? '&listen=1' : ''),
      )
      if (!disposed) save(data.events)
      return data
    }
    function later(ms) {
      clearTimeout(timer)
      if (!disposed) timer = setTimeout(connect, ms)
    }
    async function connect() {
      if (disposed || document.hidden) return
      if (inFlight) {
        needsRefresh = true
        return
      }
      inFlight = true
      try {
        const data = await load(!ws || ws.readyState !== WebSocket.OPEN)
        if (disposed) return
        setOnline('shared')
        if (data.socket && (!ws || ws.readyState > 1)) {
          const endpoint = new URL(data.socket.url)
          endpoint.searchParams.set('token', data.socket.token)
          const sock = new WebSocket(endpoint)
          ws = sock
          sock.onopen = () => {
            if (disposed) return
            sock.send(
              JSON.stringify({
                action: 'subscribe',
                channel: data.socket.channel,
              }),
            )
            retry = 0
            clearTimeout(expiry)
            expiry = setTimeout(() => sock.close(), 50 * 60000)
            load(false).catch(() => {})
          }
          sock.onmessage = (e) => {
            try {
              const frame = JSON.parse(e.data)
              if (frame.channel === data.socket.channel && frame.data?.event)
                save([frame.data.event])
            } catch {}
          }
          sock.onclose = () => {
            if (disposed) return
            ws = null
            later(Math.min(3000 * 2 ** retry++, 30000))
          }
          sock.onerror = () => sock.close()
        }
        // Recover missed events even when a socket or a proxy silently drops frames.
        later(ws && ws.readyState === WebSocket.OPEN ? 60000 : 4000)
      } catch {
        if (!disposed) {
          setOnline('offline')
          later(Math.min(4000 * 2 ** retry++, 30000))
        }
      } finally {
        inFlight = false
        if (needsRefresh && !disposed) {
          needsRefresh = false
          later(0)
        }
      }
    }
    const visible = () => {
      if (!document.hidden) connect()
    }
    connect()
    window.addEventListener('online', visible)
    window.addEventListener('focus', visible)
    document.addEventListener('visibilitychange', visible)
    return () => {
      disposed = true
      current.current = false
      clearTimeout(timer)
      clearTimeout(expiry)
      ws?.close()
      bus?.close()
      window.removeEventListener('online', visible)
      window.removeEventListener('focus', visible)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [room.id, save])
  async function record(input) {
    const result = await requestApi('seat-update', {
      body: {
        ...input,
        room: room.id,
        id: crypto.randomUUID(),
        ...(input.source === 'qr' ? { ticket: ticket(room.id) } : {}),
      },
    })
    if (current.current) {
      save([result.event])
      channel.current?.postMessage({ event: result.event })
      setOnline('shared')
    }
    return result.event
  }
  return {
    events: merge(demo ? seedDemo(room.anchor) : [], updates),
    online,
    record,
    updates,
  }
}
