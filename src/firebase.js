import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase, onValue, ref } from 'firebase/database'
import { adminPinProof, databaseRequest, postObservation, stationPairing } from '../backend/firebase/observations.js'
import { localSettings, readSettings } from '../backend/firebase/settings.js'

const emulator = import.meta.env.VITE_OPENSEAT_EMULATORS === '1'
const settings = emulator ? localSettings : readSettings(import.meta.env.VITE_OPENSEAT_FIREBASE_CONFIG)
const app = initializeApp(settings)
const db = getDatabase(app)
const auth = getAuth(app)
if (emulator) {
  connectDatabaseEmulator(db, '127.0.0.1', 9000)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
}

// How far this phone's clock is from the server's, so a slow clock does not
// make a fresh report look out of date.
let offset = 0
onValue(ref(db, '.info/serverTimeOffset'), (snapshot) => {
  offset = Number(snapshot.val()) || 0
})
export const serverNow = () => Date.now() + offset

let signIn
async function visitor() {
  await auth.authStateReady()
  if (auth.currentUser) return auth.currentUser
  if (!signIn) signIn = signInAnonymously(auth).finally(() => { signIn = undefined })
  return (await signIn).user
}

export function watchFloor(room, receive, connection) {
  let received = false, connected = false, denied = false
  function status() {
    if (denied) connection('offline')
    else if (received && connected) connection('shared')
    else connection(connected ? 'connecting' : 'offline')
  }
  const stopConnection = onValue(ref(db, '.info/connected'), (snapshot) => {
    connected = snapshot.val() === true
    status()
  })
  const stopEvents = onValue(ref(db, 'rooms/' + room + '/events'), (snapshot) => {
    received = true
    const rows = []
    snapshot.forEach((source) => {
      source.forEach((target) => {
        rows.push({ ...target.val(), source: source.key, target: target.key })
      })
    })
    receive(rows)
    status()
  }, () => { denied = true; status() })
  return () => { stopEvents(); stopConnection() }
}

const pairStation = stationPairing()
export async function sendObservation(room, input) {
  const user = await visitor()
  const token = await user.getIdToken()
  const request = (path, options) => databaseRequest(settings, emulator, path, token, options)
  if (room.startsWith('floor') && ['ble', 'sensor'].includes(input.source)) {
    await pairStation(request, user.uid, input.feedKey)
  }
  return postObservation({ request, room, input })
}

// Each browser observes its own PIN session, including a lock from another tab.
export function watchAdmin(callback, onError = () => {}) {
  let cancelled = false, stopApproval = () => {}
  const stopIdentity = onAuthStateChanged(auth, (user) => {
    stopApproval()
    if (!user) {
      callback({ uid: null, approved: false })
      visitor().catch((error) => { if (!cancelled) onError(error) })
      return
    }
    callback({ uid: user.uid, approved: false })
    stopApproval = onValue(ref(db, 'private/adminPinSessions/' + user.uid),
      (snapshot) => callback({ uid: user.uid, approved: snapshot.val() === true }),
      onError)
  }, onError)
  return () => { cancelled = true; stopIdentity(); stopApproval() }
}

export async function unlockAdmin(pin) {
  if (!/^[0-9]{6}$/.test(pin)) throw new Error('Enter the 6-digit PIN.')
  const user = await visitor()
  const token = await user.getIdToken()
  const uid = user.uid
  const proof = await adminPinProof(pin)
  // Register one guess before checking it. Failed guesses also use the cooldown.
  const attempt = await databaseRequest(settings, emulator, '/private/adminPinAttempts/' + uid, token, {
    method: 'PUT', body: JSON.stringify({ at: { '.sv': 'timestamp' }, proof }),
  })
  if (!attempt.ok) {
    if ([401, 403].includes(attempt.status)) throw new Error('Wait 5 seconds before trying the PIN again.')
    throw new Error('Could not reach OpenSeat. Try again.')
  }
  // The database grants the session only when this guess matches and is consumed.
  const result = await databaseRequest(settings, emulator, '/private', token, {
    method: 'PATCH',
    body: JSON.stringify({ ['adminPinSessions/' + uid]: true, ['adminPinAttempts/' + uid + '/proof']: null }),
  })
  if (!result.ok) {
    if ([401, 403].includes(result.status)) throw new Error('Incorrect PIN.')
    throw new Error('OpenSeat could not unlock the controls. Try again.')
  }
}

export async function lockAdmin() {
  const user = await visitor()
  const result = await databaseRequest(settings, emulator, '/private/adminPinSessions/' + user.uid,
    await user.getIdToken(), { method: 'DELETE' })
  if (!result.ok) throw new Error('OpenSeat could not lock this browser. Try again.')
}

async function setRoomStatuses(rooms, value) {
  if (!['free', 'occupied', 'unknown'].includes(value)) throw new Error('Unknown floor action.')
  const changes = {}
  for (const id of rooms) {
    changes[id + '/events/floorAdmin/status'] = {
      id: crypto.randomUUID(), at: { '.sv': 'timestamp' }, value, simulated: !id.startsWith('floor'),
    }
  }
  const user = await visitor()
  const result = await databaseRequest(settings, emulator, '/rooms', await user.getIdToken(), {
    method: 'PATCH', body: JSON.stringify(changes),
  })
  if (!result.ok) throw new Error('OpenSeat declined this update. Check that the floor controls are unlocked.')
  const ack = await result.json()
  for (const id of rooms) {
    const path = id + '/events/floorAdmin/status'
    const event = ack?.[path] ?? ack?.[id]?.events?.floorAdmin?.status
    if (event?.id !== changes[path].id || !Number.isFinite(event.at))
      throw new Error('OpenSeat did not confirm the floor update.')
  }
}

export function setFloorStatus(room, value) {
  return setRoomStatuses([room.id], value)
}

export function setAllLiveFloorStatus(value) {
  return setRoomStatuses(['floor5', 'floor7', 'floor8'], value)
}
