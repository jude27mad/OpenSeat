import { scanCount, ttl } from './model.js'

// BLE2MQTT exports a full scan with local wall-clock times. A station can also send epoch milliseconds.
export function observation(rows, now = Date.now()) {
  const value = scanCount(rows)
  const times = rows
    .map((row) => {
      if (Number.isSafeInteger(row.measuredAt)) return row.measuredAt
      if (typeof row.time !== 'string') return NaN
      const t = Date.parse(row.time.replace(' ', 'T'))
      return t + (row.msec && /^\d{1,3}$/.test(row.msec) ? Number(row.msec) : 0)
    })
    .filter(Number.isFinite)
  if (!times.length) throw Error('The scanner message has no measurement time.')
  const measuredAt = Math.max(...times)
  if (measuredAt > now + 5000 || now - measuredAt >= ttl.ble)
    throw Error('Skipped an old scanner message. Waiting for a current scan.')
  return { value, measuredAt }
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
