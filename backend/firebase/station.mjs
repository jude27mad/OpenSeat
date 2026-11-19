import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { databaseRequest, postObservation, stationPairing } from './observations.js'
import { readSettings } from './settings.js'

const settings = readSettings(process.env.OPENSEAT_FIREBASE_CONFIG ||
  readFileSync(new URL('./web.json', import.meta.url), 'utf8'))
const key = process.env.OPENSEAT_FEED_KEY
if (!key) throw Error('Set OPENSEAT_FEED_KEY on this station.')
const floor = process.env.OPENSEAT_FLOOR || '8'
if (!['5', '7', '8'].includes(floor)) throw Error('Set OPENSEAT_FLOOR to 5, 7 or 8.')
const { user } = await signInAnonymously(getAuth(initializeApp(settings)))
const request = async (path, options) => databaseRequest(settings, false, path, await user.getIdToken(), options)
await stationPairing()(request, user.uid, key)
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
for await (const line of lines) {
  if (!line.trim()) continue
  try {
    const { id, source, target, value, measuredAt } = JSON.parse(line)
    if (!['ble', 'sensor'].includes(source) || !id || !Number.isSafeInteger(measuredAt)) {
      throw Error('Supply a stable measurement id, hardware source and Unix time in milliseconds.')
    }
    const event = await postObservation({ request, room: 'floor' + floor, uid: user.uid, input: { id, source, target, value, measuredAt } })
    console.log(JSON.stringify({ id: event.id, at: event.at }))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
