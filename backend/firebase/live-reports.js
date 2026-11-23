import { reportHistory } from './report-history.js'

const windowMs = 15 * 60000
const stamp = { '.sv': 'timestamp' }

async function read(request, path) {
  const response = await request(path)
  if (!response.ok) throw new Error('Could not check the latest reports. Please try again.')
  return response.json()
}

// A new spot becomes available once all active actions for either existing
// spot expire. Both limits must allow the next write.
function checkLimit(active, spot, now) {
  const expires = active.map((action) => action.at + windowMs)
  const spotExpiries = new Map()
  for (const action of active) {
    spotExpiries.set(action.spot, Math.max(spotExpiries.get(action.spot) || 0, action.at + windowMs))
  }
  const tooManyActions = active.length >= 3
  const tooManySpots = !spotExpiries.has(spot) && spotExpiries.size >= 2
  if (!tooManyActions && !tooManySpots) return
  const next = Math.max(
    tooManyActions ? Math.min(...expires) : 0,
    tooManySpots ? Math.min(...spotExpiries.values()) : 0,
  )
  const minutes = Math.max(1, Math.ceil((next - now) / 60000))
  const limit = tooManyActions ? '3 reports' : '2 spots'
  throw new Error('This browser has reached its limit of ' + limit +
    ' across all live floors in 15 minutes. Try ' + (tooManyActions ? 'again' : 'another spot') +
    ' in ' + minutes + (minutes === 1 ? ' minute.' : ' minutes.'))
}

// One PATCH charges the browser's private rolling allowance and updates the
// affected chairs. Re-read on contention: another tab can use the same UID,
// or another student can change one of the chairs while this request is in flight.
export async function postLiveReport({ request, uid, room, targets, value, id = crypto.randomUUID(), serverNow = Date.now }) {
  if (!uid || !/^floor[578]$/.test(room) || !['free', 'occupied'].includes(value) ||
      !Array.isArray(targets) || !targets.length ||
      !targets.every((target) => /^(I\d{3}|T\d{2}-[A-D])$/.test(target)))
    throw new Error('Choose a live seat or table to report.')
  const seats = [...new Set(targets)]
  const place = seats[0].split('-')[0]
  if (seats.some((seat) => seat.split('-')[0] !== place))
    throw new Error('Report one table or individual seat at a time.')
  const spot = room + '/' + place
  const ledgerPath = 'private/reportLimits/' + uid
  const prefix = 'rooms/' + room + '/events/'
  let transportError
  for (let attempt = 0; attempt < 4; attempt++) {
    const [ledger, reset, previous] = await Promise.all([
      read(request, '/' + ledgerPath),
      read(request, '/' + prefix + 'floorAdmin/status'),
      Promise.all(seats.map((seat) => read(request, '/' + prefix + 'report/' + seat))),
    ])
    const now = serverNow()
    const actions = Object.values(ledger || {})
    const active = actions.filter((action) => action.at + windowMs > now)
    const priorEvents = previous.flatMap((row, i) => row ? [{ ...row, source: 'report', target: seats[i] }] : [])
    const receipt = actions.find((action) => action.id === id)
    if (receipt) {
      if (receipt.spot !== spot || receipt.value !== value)
        throw new Error('This report ID is already in use.')
      return { events: priorEvents, unchanged: false }
    }
    const ownActionIds = new Set(active.filter((action) => action.spot === spot && action.value === value).map((action) => action.id))
    const patch = {}
    const changed = []
    for (const [i, seat] of seats.entries()) {
      const prior = previous[i]
      if (prior && ownActionIds.has(prior.id) && prior.value === value &&
          prior.at + windowMs > now && prior.at > (reset?.at || 0)) continue
      const row = { id, value, at: stamp, simulated: false, ...reportHistory(prior, value, stamp, reset?.at || 0) }
      const lastFreeAt = value === 'free' ? stamp : prior?.value === 'free' ? prior.at : prior?.lastFreeAt
      if (lastFreeAt != null) row.lastFreeAt = lastFreeAt
      patch[prefix + 'report/' + seat] = row
      changed.push(seat)
    }
    if (!changed.length) return { events: priorEvents, unchanged: true }
    checkLimit(active, spot, now)
    if (attempt === 3) break
    patch[ledgerPath] = { latest: { id, spot, value, at: stamp } }
    if (ledger?.latest) patch[ledgerPath].previous = ledger.latest
    if (ledger?.previous) patch[ledgerPath].oldest = ledger.previous
    try {
      const result = await request('/', { method: 'PATCH', body: JSON.stringify(patch) })
      if (!result.ok) {
        if ([401, 403, 412].includes(result.status)) continue
        throw new Error('Could not save the live report. Please try again.')
      }
      const body = await result.json()
      const events = []
      for (const seat of changed) {
        const row = body?.[prefix + 'report/' + seat] ?? body?.rooms?.[room]?.events?.report?.[seat]
        if (row?.id !== id || !Number.isFinite(row.at)) break
        events.push({ ...row, source: 'report', target: seat })
      }
      if (events.length === changed.length) return { events, unchanged: false }
    } catch (err) {
      // A committed update may lose its response. The next read checks the
      // action receipt before attempting to charge for the same action again.
      transportError = err
    }
  }
  throw transportError || new Error('The live report could not be saved. Please try again.')
}
