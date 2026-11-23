import { createHash, generateKeyPairSync, privateDecrypt, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { provisionPin } from '../../backend/firebase/provision-admin-pin.mjs'
import { emulatorClient } from '../../backend/firebase/cleanup.mjs'

test('only one admin PIN is installed and recoverable across concurrent setup, retries and later releases', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const path = '/pinSetupTests/' + randomUUID()
  const request = emulatorClient()
  const options = {
    url: 'http://127.0.0.1:9000' + path + '.json?ns=demo-openseat-default-rtdb',
    authorization: 'Bearer owner', publicKey, revision: 'first',
  }
  try {
    const [first, second] = await Promise.all([provisionPin(options), provisionPin(options)])
    assert.deepEqual(first, second)
    const installed = await request(path)
    const pin = privateDecrypt({ key: privateKey, oaepHash: 'sha256' }, Buffer.from(first.encryptedPin, 'base64')).toString()
    assert.match(pin, /^\d{6}$/)
    assert.equal(installed.proof, createHash('sha256').update('OpenSeat admin PIN v1:' + pin).digest('hex'))
    assert.deepEqual(await provisionPin({ ...options, revision: 'next' }), first)
    assert.deepEqual(await request(path), installed)
    const chosen = { proof: createHash('sha256').update(randomUUID()).digest('hex'), rotated: true }
    await request(path, { method: 'PUT', body: chosen })
    assert.deepEqual(await provisionPin({ ...options, revision: 'later' }), { rotated: true })
    assert.deepEqual(await request(path), chosen)
  } finally {
    await request(path, { method: 'DELETE' })
  }
})
