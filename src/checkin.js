import { seats } from './floor.js'
import { clearsHold, fresh, holdsUntil, ttl } from './model.js'

export const ownedKey = (room, seat) => 'openseat.owned.' + room.id + '.' + seat

// Kept in memory as well, so a check-in stays yours when storage is blocked.
const memory = new Map()
function stored(room, seat) {
  const key = ownedKey(room, seat)
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null
  } catch {
    return memory.get(key) ?? null
  }
}
export function remember(room, seat, id, previous = null) {
  // Either event may be visible until Firebase acknowledges a renewal.
  if (id && previous) id = previous + ' ' + id
  const key = ownedKey(room, seat)
  if (id) memory.set(key, id)
  else memory.delete(key)
  try {
    if (id) localStorage.setItem(key, id)
    else localStorage.removeItem(key)
  } catch {
    /* Storage can be unavailable in private mode. */
  }
}

// The newest check-in on a seat while it still holds the seat, whoever made it.
function liveCheckIn(state, now) {
  const qr = state?.evidence.find((e) => e.source === 'qr' && !e.fixture)
  return qr && qr.value === 'occupied' && fresh(qr, now) ? qr : null
}
// A student confirmed the seat is empty after this check-in was made.
export function released(state, qr, now) {
  return !!state?.evidence.some((e) => clearsHold(e, qr, now))
}
// The check-in that is holding a seat for someone, if any. A current seat
// sensor that reads free overrides it, like everything else.
export function activeCheckIn(state, now) {
  const qr = liveCheckIn(state, now)
  return qr && !released(state, qr, now) && state.sensor?.value !== 'free' ? qr : null
}
// This browser's own check-in, even if someone has since reported the seat free.
export function ownCheckIn(room, seat, state, now) {
  const qr = liveCheckIn(state, now)
  return qr && (stored(room, seat) || '').split(' ').includes(qr.id) ? qr : null
}
// Every seat this browser currently holds on this floor, newest first.
export function myCheckIns(room, model, now) {
  return seats
    .map((seat) => ({ seat, event: ownCheckIn(room, seat, model.states.get(seat), now) }))
    .filter((c) => c.event)
    .sort((a, b) => b.event.at - a.event.at)
}

export const clock = (at) =>
  new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
export function remaining(event, now) {
  const minutes = Math.min(
    ttl.qr / 60000,
    Math.max(1, Math.ceil((holdsUntil(event) - now) / 60000)),
  )
  return minutes + ' min left'
}
// Under ten minutes left: worth offering to keep the seat.
export const endingSoon = (event, now) => !event.lasting && holdsUntil(event) - now < 10 * 60000
// How long a check-in holds the seat, in words.
export const holdText = (event, now) =>
  event.lasting
    ? 'Held until you check out'
    : 'Held until ' + clock(holdsUntil(event)) + ' · ' + remaining(event, now)

// Errors where the request never got a definite answer.
export const uncertain = (error) =>
  /network|fetch|timed? ?out|offline|load failed|abort/i.test(String(error?.message || error || ''))

// Turn transport and service errors into something a student can act on.
export function friendly(error) {
  const text = String(error?.message || error || '')
  if (uncertain(error)) return 'Could not reach OpenSeat. Check your connection and try again.'
  if (/belongs to another browser|already ended/i.test(text))
    return 'Someone else is checked in to this seat, or your check-in has already ended.'
  if (/declined/i.test(text)) return 'That update was not accepted. Please try again.'
  return text || 'Something went wrong. Please try again.'
}
