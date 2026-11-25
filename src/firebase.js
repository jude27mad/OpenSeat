import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase, onDisconnect, onValue, push, ref, remove, set } from 'firebase/database'
import { adminPinProof, databaseRequest, postObservation, stationPairing } from '../backend/firebase/observations.js'
import { postLiveReport } from '../backend/firebase/live-reports.js'
import { localSettings, readSettings } from '../backend/firebase/settings.js'
import { visitorProfile } from './visitor-profile.js'

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

// Each tab owns a connection entry. Closing one tab leaves the profile's other tabs online.
export function trackVisitorPresence(screen) {
  let user, entry, retry
  let connected = false, away = false, revision = 0

  function refresh() {
    const attempt = ++revision
    clearTimeout(retry)
    if (entry) {
      const old = entry
      entry = undefined
      // Keep server-side cleanup armed until the explicit removal is acknowledged.
      if (auth.currentUser?.uid === old.user.uid) {
        remove(old.connection).then(() => onDisconnect(old.connection).cancel()).catch(() => {})
      } else {
        // Another tab replaced the shared sign-in. Retire this entry as its original writer.
        old.user.getIdToken().then((token) => databaseRequest(settings, emulator,
          '/visitorPresence/' + old.user.uid + '/' + old.connection.key, token, { method: 'DELETE' })).catch(() => {})
      }
    }
    if (!connected || away || user === undefined) return

    function retryLater() {
      if (attempt === revision) retry = setTimeout(refresh, 10000)
    }
    if (!user) {
      visitor().catch(retryLater)
      return
    }
    const connection = push(ref(db, 'visitorPresence/' + user.uid))
    entry = { connection, user }
    Promise.all([onDisconnect(connection).remove(), visitorProfile(user.uid)]).then(([, profile]) => {
      if (attempt === revision) return set(connection, { screen, profile })
    }).catch(retryLater)
  }

  const stopIdentity = onAuthStateChanged(auth, (next) => { user = next; refresh() })
  const stopConnection = onValue(ref(db, '.info/connected'), (snapshot) => {
    connected = snapshot.val() === true
    refresh()
  })
  function leavePage() { away = true; refresh() }
  function returnToPage() { if (away) { away = false; refresh() } }
  window.addEventListener('pagehide', leavePage)
  window.addEventListener('pageshow', returnToPage)
  return () => {
    stopIdentity()
    stopConnection()
    window.removeEventListener('pagehide', leavePage)
    window.removeEventListener('pageshow', returnToPage)
    leavePage()
  }
}

export function watchVisitorCounts(adminUid, receive) {
  let active = true, stop
  visitorProfile(adminUid).then((ownProfile) => {
    if (!active) return
    stop = onValue(ref(db, 'visitorPresence'), (snapshot) => {
      const online = new Set(), waiting = new Set()
      snapshot.forEach((identity) => {
        if (identity.key === adminUid) return
        const tabs = Object.values(identity.val())
        const viewer = tabs.find((tab) => tab.screen === 'online')?.profile
        const waiter = tabs.find((tab) => tab.screen === 'waiting')?.profile
        if (viewer && viewer !== ownProfile) online.add(viewer)
        if (waiter && waiter !== ownProfile) waiting.add(waiter)
      })
      receive({ online: online.size, waiting: waiting.size })
    }, () => receive(null))
  })
  return () => { active = false; stop?.() }
}

// A missing closure means open. When closed, only the initiating Firebase identity has access.
export function watchSiteAccess(receive) {
  let owner, uid, stopClosure
  let connected = false, failed = false
  function publish() {
    if (failed) receive('unavailable')
    else if (!connected || owner === undefined || (owner !== null && uid === undefined)) receive('checking')
    else if (owner === null) receive('open')
    else receive(owner === uid ? 'owner' : 'closed')
  }
  const stopIdentity = onAuthStateChanged(auth, (user) => {
    uid = user?.uid ?? null
    publish()
  })
  const stopConnection = onValue(ref(db, '.info/connected'), (connection) => {
    connected = connection.val() === true
    if (!connected || !stopClosure) {
      stopClosure?.()
      owner = undefined
      failed = false
      stopClosure = onValue(ref(db, 'siteClosure'), (snapshot) => {
        owner = snapshot.val()
        publish()
      }, () => { failed = true; publish() })
    }
    publish()
  })
  return () => { stopClosure?.(); stopConnection(); stopIdentity() }
}

export async function setSiteClosed(closed) {
  const user = await visitor()
  const result = await databaseRequest(settings, emulator, '/siteClosure', await user.getIdToken(),
    closed ? { method: 'PUT', body: JSON.stringify(user.uid) } : { method: 'DELETE' })
  if (!result.ok) throw new Error('OpenSeat could not change website access. Check your connection and admin access.')
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
  return postObservation({ request, uid: user.uid, room, input, serverNow })
}

export async function sendSeatReports(room, targets, value) {
  const user = await visitor()
  const token = await user.getIdToken()
  const request = (path, options) => databaseRequest(settings, emulator, path, token, options)
  if (room.startsWith('floor')) {
    return postLiveReport({ request, uid: user.uid, room, targets, value, serverNow })
  }
  const results = await Promise.allSettled(targets.map((target) => postObservation({
    request, room, input: { source: 'report', target, value },
  })))
  const failure = results.find((result) => result.status === 'rejected')
  const events = results.filter((result) => result.status === 'fulfilled').map((result) => result.value)
  if (failure) {
    if (events.length) throw new Error('Saved ' + events.length + ' of ' + targets.length + ' chairs. ' + failure.reason.message)
    throw failure.reason
  }
  return { events, unchanged: false }
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
