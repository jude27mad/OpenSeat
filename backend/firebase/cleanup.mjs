// Deletes demo rooms nobody has used for a while. The live floors are never touched.
// Runs from GitHub Actions on a schedule, since the free Firebase plan has no server code.
//
//   node backend/firebase/cleanup.mjs              delete demo rooms idle for over 24 hours
//   node backend/firebase/cleanup.mjs --dry-run    only list what would be deleted
//   node backend/firebase/cleanup.mjs --emulator   run against the local emulator
//   node backend/firebase/cleanup.mjs --max-age-hours=48
//
// Production needs FIREBASE_SERVICE_ACCOUNT: the JSON key of a service account
// that can manage the Realtime Database.
import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { readSettings } from './settings.js'

export const HOUR = 3600000
const LIVE = ['floor8', 'floor5', 'floor7']
const demoRoom = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// A small client for the database's REST interface.
export function databaseClient({ base, headers = {}, ns }) {
  return async function request(path, { method = 'GET', query = {}, body } = {}) {
    const url = new URL(path + '.json', base)
    if (ns) url.searchParams.set('ns', ns)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    const response = await fetch(url, {
      method,
      headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok)
      throw new Error(`${method} ${path} failed: ${response.status} ${(await response.text()).slice(0, 200)}`)
    return response.json()
  }
}
export const emulatorClient = () =>
  databaseClient({
    base: 'http://127.0.0.1:9000',
    ns: 'demo-openseat-default-rtdb',
    headers: { Authorization: 'Bearer owner' },
  })

// The time of the newest reading, report or check-in in a room, or 0 if it has none.
export function lastActivity(events) {
  let latest = 0
  for (const targets of Object.values(events || {}))
    for (const event of Object.values(targets || {}))
      if (Number.isFinite(event?.at)) latest = Math.max(latest, event.at)
  return latest
}

export async function cleanup({ request, now = Date.now(), maxAge = 24 * HOUR, dryRun = false, log = console.log }) {
  const listing = (await request('/rooms', { query: { shallow: 'true' } })) || {}
  const ids = Object.keys(listing).filter((id) => !LIVE.includes(id))
  const skipped = ids.filter((id) => !demoRoom.test(id))
  const rooms = ids.filter((id) => demoRoom.test(id))
  const idle = []
  // Check a few rooms at a time to stay well inside the database's limits.
  for (let i = 0; i < rooms.length; i += 8) {
    const batch = rooms.slice(i, i + 8)
    const latest = await Promise.all(batch.map((id) => request('/rooms/' + id + '/events').then(lastActivity)))
    batch.forEach((id, j) => {
      if (now - latest[j] > maxAge) idle.push(id)
    })
  }
  // One request removes up to 100 rooms at once.
  if (!dryRun)
    for (let i = 0; i < idle.length; i += 100)
      await request('/rooms', {
        method: 'PATCH',
        body: Object.fromEntries(idle.slice(i, i + 100).map((id) => [id, null])),
      })
  log(
    `${rooms.length} demo rooms checked. ${idle.length} idle for over ${Math.round(maxAge / HOUR)} hours ` +
      (dryRun ? 'would be deleted (dry run).' : 'deleted.') +
      (skipped.length ? ` Left alone ${skipped.length} rooms that are not demo rooms: ${skipped.join(', ')}.` : ''),
  )
  return { checked: rooms.length, deleted: idle, skipped }
}

// Signs in as the service account and returns a short-lived access token.
async function accessToken(account) {
  const now = Math.floor(Date.now() / 1000)
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned =
    part({ alg: 'RS256', typ: 'JWT' }) +
    '.' +
    part({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
      aud: account.token_uri || 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url')
  const response = await fetch(account.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: unsigned + '.' + signature,
    }),
  })
  if (!response.ok) throw new Error('The service account could not sign in: ' + response.status + ' ' + (await response.text()))
  return (await response.json()).access_token
}

async function main(args) {
  const dryRun = args.includes('--dry-run')
  const hours = Number(args.find((a) => a.startsWith('--max-age-hours='))?.split('=')[1] || 24)
  if (!(hours >= 1)) throw new Error('--max-age-hours must be at least 1.')
  let request
  if (args.includes('--emulator')) request = emulatorClient()
  else {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log('::warning::FIREBASE_SERVICE_ACCOUNT is not set, so no rooms were deleted. See the README section on cleaning up demo rooms.')
      return
    }
    const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    const settings = process.env.OPENSEAT_FIREBASE_CONFIG
      ? readSettings(process.env.OPENSEAT_FIREBASE_CONFIG)
      : readSettings(readFileSync(new URL('./web.json', import.meta.url), 'utf8'))
    request = databaseClient({
      base: settings.databaseURL,
      headers: { Authorization: 'Bearer ' + (await accessToken(account)) },
    })
  }
  await cleanup({ request, maxAge: hours * HOUR, dryRun })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
