// Read a private SQL export from stdin. Each room is conditionally updated so new observations survive retries.
// QR check-in rows are skipped: OpenSeat no longer has check-ins, so the map would ignore them anyway.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { readSettings } from './settings.js'

const settings = readSettings(process.env.OPENSEAT_FIREBASE_CONFIG ||
  readFileSync(new URL('./web.json', import.meta.url), 'utf8'))
const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN ||
  execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim()
const headers = { Authorization: 'Bearer ' + token }
const all = JSON.parse(readFileSync(0, 'utf8'))
const rows = all.filter((row) => row?.source !== 'qr')
const skipped = all.length - rows.length
const rooms = Map.groupBy(rows, (row) => row.room)
let copied = 0
for (const [id, list] of rooms) {
  if (id !== 'floor8' && !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(id)) throw Error('Invalid session in export.')
  const url = new URL('/rooms/' + id + '.json', settings.databaseURL)
  let finished = false
  for (let attempt = 0; !finished && attempt < 8; attempt++) {
    const current = await fetch(url, { headers: { ...headers, 'X-Firebase-ETag': 'true' } })
    if (!current.ok) throw Error('Archive read failed (' + current.status + ').')
    const state = (await current.json()) || {}
    let added = 0
    for (const row of list) {
      if (!['report', 'ble', 'sensor'].includes(row.source) || !/^[A-Za-z0-9-]+$/.test(row.target)) throw Error('Invalid observation in export.')
      const event = { id: row.id, value: row.source === 'ble' ? Number(row.value) : row.value, at: Number(row.at), simulated: row.simulated }
      if (!Number.isSafeInteger(event.at) || typeof event.simulated !== 'boolean') throw Error('Invalid observation metadata.')
      const source = (state.events ??= {})[row.source] ??= {}
      const old = source[row.target]
      if (old && (old.at > event.at || (old.at === event.at && old.id >= event.id))) continue
      source[row.target] = event
      added++
    }
    if (!added) { finished = true; break }
    const saved = await fetch(url, {
      method: 'PUT', headers: { ...headers, 'if-match': current.headers.get('etag') },
      body: JSON.stringify(state),
    })
    if (saved.status === 412) continue
    if (!saved.ok) throw Error('Archive import failed (' + saved.status + ').')
    copied += added
    finished = true
  }
  if (!finished) throw Error('Session changed repeatedly. Re-run the import to finish it.')
}
console.log('Imported ' + copied + ' observations across ' + rooms.size + ' sessions.' +
  (skipped ? ' Skipped ' + skipped + ' QR check-in rows, since OpenSeat no longer has check-ins.' : ''))
