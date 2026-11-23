import { publicEncrypt, randomInt } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { accessToken } from './cleanup.mjs'
import { readSettings } from './settings.js'
import { adminPinProof } from './observations.js'

// Only the RTDB service account can read or initialize this record. Both the
// PIN verifier and its encrypted delivery copy must be installed together.
export async function provisionPin({ url, authorization, publicKey, revision }) {
  const headers = { Authorization: authorization }
  const read = async () => {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error('Could not read PIN setup (' + response.status + ').')
    return response.json()
  }
  let record = await read()
  if (!record) {
    const pin = String(randomInt(1_000_000)).padStart(6, '0')
    const initial = {
      proof: await adminPinProof(pin),
      encryptedPin: publicEncrypt({ key: publicKey, oaepHash: 'sha256' }, Buffer.from(pin)).toString('base64'),
      revision,
    }
    const response = await fetch(url, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json', 'if-match': 'null_etag' },
      body: JSON.stringify(initial),
      signal: AbortSignal.timeout(30000),
    })
    // Another initializer can win the race. Always read back the installed
    // envelope; never deliver a locally generated PIN until it is confirmed.
    if (!response.ok && response.status !== 412)
      throw new Error('Could not initialize the PIN (' + response.status + ').')
    record = await read()
  }
  if (typeof record?.proof !== 'string' || !/^[a-f0-9]{64}$/.test(record.proof))
    throw new Error('The stored admin PIN verifier is invalid.')
  // An owner-chosen PIN supersedes the original delivery envelope.
  if (record.rotated === true) return { rotated: true }
  if (typeof record.encryptedPin !== 'string' || !/^[A-Za-z0-9+/]{200,1024}={0,2}$/.test(record.encryptedPin))
    throw new Error('The stored admin PIN setup is incomplete.')
  return { encryptedPin: record.encryptedPin, revision: record.revision }
}

async function main() {
  const localFile = (name) => readFile(new URL(name, import.meta.url), 'utf8')
  const settings = readSettings(process.env.OPENSEAT_FIREBASE_CONFIG || await localFile('./web.json'))
  const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  if (account.project_id !== settings.projectId) throw new Error('Firebase project mismatch.')
  const revision = process.env.GITHUB_SHA
  if (!revision) throw new Error('Missing deployment revision.')
  const installed = await provisionPin({
    url: new URL('/private/adminPin.json', settings.databaseURL),
    authorization: 'Bearer ' + await accessToken(account),
    publicKey: await localFile('./admin-pin-recipient.pem'),
    revision,
  })
  if (installed.revision === revision) console.log('OPENSEAT_PIN_ENVELOPE=' + installed.encryptedPin)
  else console.log('The existing admin PIN is configured.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
