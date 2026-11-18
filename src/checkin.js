import { seats } from './floor.js'
import { fresh, holdsUntil } from './model.js'

export const ownedKey = (room, seat) => 'openseat.owned.' + room.id + '.' + seat

function stored(room, seat) {
  try {
    return localStorage.getItem(ownedKey(room, seat))
  } catch {
    return null
  }
}
export function remember(room, seat, id) {
  try {
    if (id) localStorage.setItem(ownedKey(room, seat), id)
    else localStorage.removeItem(ownedKey(room, seat))
  } catch {
    /* Storage can be unavailable in private mode. */
  }
}

// The live check-in on a seat, whoever made it.
export function activeCheckIn(state, now) {
  const qr = state?.evidence.find((e) => e.source === 'qr' && !e.fixture)
  return qr && qr.value === 'occupied' && fresh(qr, now) ? qr : null
}
export function ownCheckIn(room, seat, state, now) {
  const qr = activeCheckIn(state, now)
  return qr && stored(room, seat) === qr.id ? qr : null
}
// Every seat this browser currently holds on this floor.
export function myCheckIns(room, model, now) {
  return seats
    .map((seat) => ({ seat, event: ownCheckIn(room, seat, model.states.get(seat), now) }))
    .filter((c) => c.event)
}

export const clock = (at) =>
  new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
export function remaining(event, now) {
  const minutes = Math.max(1, Math.ceil((holdsUntil(event) - now) / 60000))
  return minutes + ' min left'
}

// Turn transport and service errors into something a student can act on.
export function friendly(error) {
  const text = String(error?.message || error || '')
  if (/network|fetch|timed? ?out|offline|load failed|abort/i.test(text))
    return 'Could not reach OpenSeat. Check your connection and try again.'
  if (/belongs to another browser|already ended/i.test(text))
    return 'Someone else is checked in to this seat, or your check-in has already ended.'
  if (/declined/i.test(text)) return 'That update was not accepted. Please try again.'
  return text || 'Something went wrong. Please try again.'
}
