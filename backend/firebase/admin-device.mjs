// Invoked by the repository owner's manual GitHub workflow.
import { readFile } from 'node:fs/promises'
import { accessToken, databaseClient } from './cleanup.mjs'
import { readSettings } from './settings.js'

const device = process.env.DEVICE_ID?.trim()
const action = process.env.DEVICE_ACTION
if (!/^[a-zA-Z0-9_-]{20,128}$/.test(device || ''))
  throw new Error('Copy the complete browser ID from the OpenSeat admin page.')
if (!['Approve', 'Revoke'].includes(action))
  throw new Error('Select Approve or Revoke.')

const config = process.env.OPENSEAT_FIREBASE_CONFIG || await readFile(new URL('./web.json', import.meta.url), 'utf8')
const settings = readSettings(config)
const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
if (account.project_id !== settings.projectId) throw new Error('Firebase project mismatch.')
const request = databaseClient({
  base: settings.databaseURL,
  headers: { Authorization: 'Bearer ' + await accessToken(account) },
})
const path = '/private/adminDevices/' + device
if (action === 'Approve') await request(path, { method: 'PUT', body: true })
else await request(path, { method: 'DELETE' })
if (await request(path) !== (action === 'Approve' ? true : null))
  throw new Error('The database did not confirm the access change.')
console.log(action === 'Approve' ? 'Browser approved.' : 'Browser access revoked.')
