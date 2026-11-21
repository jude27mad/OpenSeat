import { scanCount, ttl } from './model.js'

const futureTolerance = 5000
const campusClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

// Map the few minutes a live scan can contain to the wall clock on the SLC scanner.
// Formatting the real instants also handles skipped and repeated daylight-saving hours.
function recentCampusMinutes(now) {
  const minutes = new Map()
  const first = Math.floor((now - ttl.ble) / 60000) * 60000
  for (let start = first; start <= now + futureTolerance; start += 60000) {
    const parts = Object.fromEntries(
      campusClock.formatToParts(start).map(({ type, value }) => [type, value]),
    )
    minutes.set(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`, start)
  }
  return minutes
}

function scanTime(row, campusMinutes) {
  if (Number.isSafeInteger(row?.measuredAt)) return row.measuredAt
  if (typeof row?.time !== 'string') return NaN
  const time = row.time.replace(' ', 'T')
  const extraMillis = /^\d{1,3}$/.test(row.msec) ? Number(row.msec) : 0
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(time))
    return Date.parse(time) + (time.includes('.') ? 0 : extraMillis)
  const local = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::([0-5]\d)(?:\.(\d+))?)?$/.exec(time)
  if (!local || !campusMinutes.has(local[1])) return NaN
  const [, minute, seconds = '0', fraction] = local
  const millis = fraction ? Number(fraction.slice(0, 3).padEnd(3, '0')) : extraMillis
  return campusMinutes.get(minute) + Number(seconds) * 1000 + millis
}

export function observation(rows, now = Date.now()) {
  if (!Array.isArray(rows) || rows.length > 20000)
    throw Error('Select one BLE2MQTT JSON scan array.')
  const recent = []
  const campusMinutes = recentCampusMinutes(now)
  let measuredAt = -Infinity
  for (const row of rows) {
    const stamp = scanTime(row, campusMinutes)
    if (!Number.isSafeInteger(stamp) || stamp > now + futureTolerance || now - stamp >= ttl.ble) continue
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
  const { default: mqtt } = await import('mqtt')
  const client = mqtt.connect('wss://mqtt.flespi.io:443', {
    username: token.trim(),
    clean: true,
    reconnectPeriod: 4000,
    connectTimeout: 10000,
  })
  client.on('connect', () => {
    client.subscribe(topic.trim(), { qos: 0 }, (err, granted) => {
      if (err || !granted?.some((grant) => grant.topic === topic.trim() && grant.qos < 128)) {
        status('Subscription refused. Check the read token and scanner topic.', 'error')
        return
      }
      status('Scanner connected. Waiting for a current scan.', 'waiting')
    })
  })
  client.on('offline', () => status('Connection lost. Reconnecting…', 'connecting'))
  client.on('error', () =>
    status('Scanner connection failed. Check the token and topic.', 'error'),
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
