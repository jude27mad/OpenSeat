import React, { useState } from 'react'
import {
  ArrowUpRight,
  Check,
  LogIn,
  LogOut,
  MapPin,
  QrCode,
  Radio,
  UserRound,
} from 'lucide-react'
import { Card } from './components/ui/card'
import { Button } from './components/ui/button'
import { age, fresh, sources, statuses } from './model.js'
import { label } from './floor.js'
export function Status({ value, children }) {
  return (
    <span className={'status ' + value}>
      <i />
      {children || statuses[value] || value}
    </span>
  )
}
export function Origin({ event, now }) {
  if (!event) return <span className="origin">No source yet</span>
  return (
    <span className="origin">
      {event.simulated ? 'Simulated · ' : ''}
      {sources[event.source]} · {age(event.at, now)}
      {!fresh(event, now) ? ' · Stale' : ''}
    </span>
  )
}
function ownedKey(room, seat) {
  return 'openseat.owned.' + room.id + '.' + seat
}
export default function SeatDetails({
  room,
  place,
  seat,
  onSeat,
  model,
  now,
  record,
  openQR,
  canCheckIn,
}) {
  const [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState(''),
    [failed, setFailed] = useState(false)
  const state = model.states.get(seat),
    isTable = place.section === 'tables',
    qr = state.evidence.find((e) => e.source === 'qr' && !e.fixture)
  let owner = false
  try {
    owner =
      !!qr &&
      qr.value === 'occupied' &&
      fresh(qr, now) &&
      localStorage.getItem(ownedKey(room, seat)) === qr.id
  } catch {}
  const other = !!qr && fresh(qr, now) && qr.value === 'occupied' && !owner
  async function send(source, value) {
    setBusy(true)
    setFailed(false)
    setFeedback('')
    try {
      const event = await record({ source, target: seat, value })
      if (source === 'qr') {
        try {
          if (value === 'occupied')
            localStorage.setItem(ownedKey(room, seat), event.id)
          else localStorage.removeItem(ownedKey(room, seat))
        } catch {}
      }
      setFeedback(
        source === 'qr'
          ? (value === 'occupied' ? 'Checked in at ' : 'Checked out of ') +
              label(seat) +
              '.'
          : 'Report saved for ' + label(seat) + '.',
      )
    } catch (e) {
      setFailed(true)
      setFeedback(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="panel inspector">
      <header className="inspector-head">
        <span className="kicker">
          <MapPin size={13} />
          Selected location
        </span>
        <h2>{label(place.id)}</h2>
        <p>
          {isTable ? 'Round table · 4 chairs' : 'Individual study seat'} · Floor
          8
        </p>
      </header>
      <div className="inspector-body">
        {isTable && (
          <>
            <div className="field-title">Choose a chair</div>
            <div className="chair-tabs">
              {place.ids.map((id) => (
                <button
                  key={id}
                  onClick={() => onSeat(id)}
                  aria-pressed={id === seat}
                  className={model.states.get(id).status}
                  aria-label={
                    'Chair ' +
                    id.slice(-1) +
                    ', ' +
                    statuses[model.states.get(id).status]
                  }
                >
                  <span>{id.slice(-1)}</span>
                  <i />
                </button>
              ))}
            </div>
          </>
        )}
        <div className="seat-reading">
          <span className="field-title">
            {isTable ? 'Chair ' + seat.slice(-1) : 'Seat'} status
          </span>
          <Status value={state.status} />
        </div>
        <Origin event={state.latest} now={now} />
        {isTable && place.sensor && (
          <div className="sensor-line">
            <Radio size={14} />
            <span>
              Table{' '}
              {fresh(place.sensor, now)
                ? place.sensor.value === 'free'
                  ? 'free'
                  : 'in use'
                : 'reading expired'}
              <small>
                <Origin event={place.sensor} now={now} />
              </small>
            </span>
          </div>
        )}
        {state.evidence.length > 1 && (
          <details className="evidence-detail">
            <summary>View all seat evidence</summary>
            {state.evidence.map((e) => (
              <div key={e.id}>
                <b>{statuses[e.value]}</b>
                <Origin event={e} now={now} />
              </div>
            ))}
          </details>
        )}
        <div className="inspector-actions">
          <Button
            className="wide"
            disabled={busy || (canCheckIn && other)}
            onClick={() =>
              canCheckIn ? send('qr', owner ? 'free' : 'occupied') : openQR()
            }
          >
            {canCheckIn ? owner ? <LogOut /> : <LogIn /> : <QrCode />}
            {canCheckIn
              ? owner
                ? 'Check out'
                : other
                  ? 'Already checked in'
                  : 'Check in'
              : 'Check in with QR'}
          </Button>
          <div className="field-title report-heading">Report what you see</div>
          <div className="report-row">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => send('report', 'free')}
            >
              <Check />
              Free
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => send('report', 'occupied')}
            >
              <UserRound />
              Occupied
            </Button>
          </div>
          {feedback && (
            <p role="status" className={failed ? 'error' : 'feedback'}>
              {feedback}
            </p>
          )}
        </div>
      </div>
      <button className="inspector-qr" onClick={openQR}>
        <QrCode size={16} />
        Show {isTable ? 'table' : 'seat'} QR code
        <ArrowUpRight size={15} />
      </button>
    </Card>
  )
}
