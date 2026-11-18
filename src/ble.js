import { scanCount, ttl } from './model.js'

// BLE2MQTT exports a full scan with local wall-clock times. A station can also send epoch milliseconds.
export function observation(rows, now = Date.now()) {
  if (!Array.isArray(rows) || rows.length > 20000)
    throw Error('Select one BLE2MQTT JSON scan array.')
  const recent = []
  let measuredAt = -Infinity
  for (const row of rows) {
    let stamp = row?.measuredAt
    if (!Number.isSafeInteger(stamp) && typeof row?.time === 'string') {
      stamp = Date.parse(row.time.replace(' ', 'T'))
      if (/^\d{1,3}$/.test(row.msec)) stamp += Number(row.msec)
    }
    if (!Number.isSafeInteger(stamp) || stamp > now + 5000 || now - stamp >= ttl.ble) continue
    measuredAt = Math.max(measuredAt, stamp)
    recent.push(row)
  }
  if (!recent.length)
    throw Error('Skipped an old scanner message. Waiting for a current scan.')
  return { value: scanCount(recent), measuredAt }
}
export async function startScanner(
  { token, topic, section, feedKey },
  record,
  status,
) {
  if (!topic.trim() || /[+#\0]/.test(topic))
    throw Error('Use the exact topic configured on the iPhone.')
  const { connect } = await import('mqtt')
  const client = connect('wss://mqtt.flespi.io:443', {
    username: token.trim(),
    clean: true,
    reconnectPeriod: 4000,
    connectTimeout: 10000,
  })
  client.on('connect', () =>
    client.subscribe(topic.trim(), { qos: 0 }, (err) =>
      status(
        err
          ? 'Could not subscribe to that topic.'
          : 'Scanner connected. Waiting for a current scan.',
      ),
    ),
  )
  client.on('error', () =>
    status('Scanner connection failed. Check the token and topic.'),
  )
  client.on('message', async (_topic, payload, packet) => {
    if (packet.retain) return
    try {
      const scan = observation(JSON.parse(payload.toString()))
      await record({
        source: 'ble',
        target: section,
        ...scan,
        ...(feedKey ? { feedKey } : {}),
      })
      status('Scanner connected · ' + scan.value + ' nearby devices')
    } catch (e) {
      status(e.message)
    }
  })
  return () => client.end(true)
}
