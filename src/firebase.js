import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase, onValue, ref } from 'firebase/database'
import { databaseRequest, postObservation, stationPairing } from '../backend/firebase/observations.js'
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
// make a fresh check-in look out of date.
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
export async function sendObservation(room, input, previousTicket) {
  const user = await visitor()
  const token = await user.getIdToken()
  const request = (path, options) => databaseRequest(settings, emulator, path, token, options)
  if (room === 'floor8' && ['ble', 'sensor'].includes(input.source)) {
    await pairStation(request, user.uid, input.feedKey)
  }
  return postObservation({ request, room, uid: user.uid, input, previousTicket })
}
