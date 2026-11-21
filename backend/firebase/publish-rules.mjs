// The Pages deployment syncs rules from the same commit tested with the emulator.
import { isDeepStrictEqual } from 'node:util'
import { readFile } from 'node:fs/promises'
import { accessToken, databaseClient } from './cleanup.mjs'
import { readSettings } from './settings.js'

const localFile = (name) => readFile(new URL(name, import.meta.url), 'utf8')
const settings = readSettings(process.env.OPENSEAT_FIREBASE_CONFIG || await localFile('./web.json'))
const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
if (account.project_id !== settings.projectId) throw new Error('Firebase project mismatch.')
const request = databaseClient({
  base: settings.databaseURL,
  headers: { Authorization: 'Bearer ' + await accessToken(account) },
})
const path = '/.settings/rules'
const rules = JSON.parse(await localFile('./database.rules.json'))
if (!isDeepStrictEqual(await request(path), rules)) {
  await request(path, { method: 'PUT', body: rules })
  if (!isDeepStrictEqual(await request(path), rules)) throw new Error('Published database rules differ from the tested rules.')
}
console.log('Production database rules match the tested commit.')
