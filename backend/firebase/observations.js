import { postLiveReport } from './live-reports.js'

// Shared by the dashboard and the hardware station client. Only aggregates leave the scanner.
export async function digest(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const adminPinProof = (pin) => digest('OpenSeat admin PIN v1:' + pin)

export function databaseRequest(settings, emulator, path, token, options = {}) {
  const url = emulator
    ? new URL(path + '.json', 'http://127.0.0.1:9000')
    : new URL(path + '.json', settings.databaseURL)
  if (emulator) url.searchParams.set('ns', 'demo-openseat-default-rtdb')
  if (token) url.searchParams.set('auth', token)
  return fetch(url, {
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(12000),
    ...options,
  })
}

// A later occupied report must retain when this seat was last confirmed empty.
async function saveReport(request, path, event) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const headers = {}
    let lastFreeAt = event.at
    if (event.value !== 'free') {
      const current = await request(path, { headers: { 'X-Firebase-ETag': 'true' } })
      if (!current.ok) return current
      const previous = await current.json()
      lastFreeAt = previous?.value === 'free' ? previous.at : previous?.lastFreeAt
      headers['if-match'] = current.headers.get('etag')
    }
    const save = (data) => request(path, { method: 'PUT', headers, body: JSON.stringify(data) })
    let result = await save(lastFreeAt == null ? event : { ...event, lastFreeAt })
    // Existing installations may still enforce the previous report schema.
    if (lastFreeAt != null && [401, 403].includes(result.status)) result = await save(event)
    if (result.status !== 412) return result
  }
  throw new Error('Another report just changed this seat. Please try again.')
}

export async function postObservation({ request, uid, room, input, serverNow }) {
  const { source, target, value, measuredAt, simulated = false, id = crypto.randomUUID() } = input
  if (source === 'report' && /^floor[578]$/.test(room)) {
    if (simulated) throw new Error('Simulated reports belong in the demo.')
    const result = await postLiveReport({ request, uid, room, targets: [target], value, id, serverNow })
    return result.events[0]
  }
  const isDevice = source === 'sensor' || source === 'ble'
  const event = { id, value, simulated, at: isDevice && !simulated ? measuredAt : { '.sv': 'timestamp' } }
  const eventPath = 'events/' + source + '/' + target
  const roomPath = '/rooms/' + room
  const patch = { [eventPath]: event }
  const result = source === 'report'
    ? await saveReport(request, roomPath + '/' + eventPath, event)
    : await request(roomPath, { method: 'PATCH', body: JSON.stringify(patch) })
  if (result.ok) {
    const response = await result.json()
    const saved = source === 'report' ? response : response.events?.[source]?.[target] ?? response[eventPath]
    if (saved?.id !== id || !Number.isFinite(saved.at)) throw new Error('The shared service did not confirm this observation.')
    return { ...saved, source, target }
  }
  if (result.status === 401 || result.status === 403) {
    // Rules reject duplicate IDs. A station may have lost the first acknowledgement.
    const response = await request(roomPath + '/' + eventPath)
    const prior = response.ok ? await response.json() : null
    if (prior?.id === id && prior.value === value && prior.simulated === simulated &&
        (!isDevice || simulated || prior.at === measuredAt)) return { ...prior, source, target }
    if (isDevice) throw new Error('Reading declined. Check the station authorization, target and measurement time.')
    throw new Error('The shared map declined this observation.')
  }
  throw new Error('The shared service could not save this update.')
}

export function stationPairing() {
  let last
  return async (request, uid, key) => {
    if (!key) throw new Error('Enter the OpenSeat operator key for this live feed.')
    const proof = await digest(key)
    if (last?.uid === uid && last.proof === proof) return
    const response = await request('/private/stations/' + uid, { method: 'PUT', body: JSON.stringify(proof) })
    if (!response.ok) throw new Error('The live feed could not verify the operator key.')
    last = { uid, proof }
  }
}
