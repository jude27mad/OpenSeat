import React from 'react'
import {
  Armchair,
  ArrowRight,
  Bluetooth,
  ChevronRight,
  Clock3,
  FlaskConical,
  MessageSquare,
  QrCode,
  Radio,
  Search,
} from 'lucide-react'
import { Card } from './components/ui/card'
import { Button } from './components/ui/button'
import { label } from './floor.js'
import { age, fresh, matchesQuery, looksFree, placeDescription, sources } from './model.js'
import { clock, remaining } from './checkin.js'
import { holdsUntil } from './model.js'
import { Origin } from './SeatDetails.jsx'

export const plural = (count, noun) => count + ' ' + noun + (count === 1 ? '' : 's')
export const sourceIcons = {
  ble: Bluetooth,
  qr: QrCode,
  report: MessageSquare,
  sensor: Radio,
}
export const sourceText = {
  ble: 'Counts phones nearby in each area',
  qr: 'Students check in by scanning the table code',
  report: 'Students tap “It’s free” or “It’s taken”',
  sensor: 'Detects whether a table is in use',
}

export function Legend() {
  return (
    <div className="legend" aria-label="Map key">
      {[
        ['free', 'Free'],
        ['occupied', 'Taken'],
        ['unknown', 'No recent info'],
        ['mixed', 'Mixed reports'],
      ].map(([s, text]) => (
        <span key={s}>
          <i className={s} />
          {text}
        </span>
      ))}
      <span>
        <i className="booked" />
        Bookable room (not counted)
      </span>
    </div>
  )
}

export function DemoBanner({ onLive }) {
  return (
    <div className="demo-banner" role="note">
      <FlaskConical size={16} />
      <p>
        <b>Demo with example data.</b> These seats aren't the real floor.
      </p>
      <button onClick={onLive}>
        See live floor <ArrowRight size={14} />
      </button>
    </div>
  )
}

export function CheckInBanner({ checkIns, now, onShow, onCheckOut, busy }) {
  if (!checkIns.length) return null
  const { seat, event } = checkIns[0]
  return (
    <div className="mine-banner" role="status">
      <Clock3 size={17} />
      <p>
        <b>You're checked in at {label(seat)}</b>
        <small>
          Held until {clock(holdsUntil(event))} · {remaining(event, now)}
          {checkIns.length > 1 ? ' · and ' + plural(checkIns.length - 1, 'other seat') : ''}
        </small>
      </p>
      <button onClick={() => onShow(seat)}>Show</button>
      <button className="solid" disabled={busy} onClick={() => onCheckOut(seat)}>
        Check out
      </button>
    </div>
  )
}

export function SourceCards({ events, now, onDevices, full }) {
  return (
    <div className={'source-cards ' + (full ? 'full' : '')}>
      {['ble', 'qr', 'report', 'sensor'].map((s) => {
        const Icon = sourceIcons[s],
          rows = events.filter((e) => e.source === s).sort((a, b) => b.at - a.at),
          latest = rows[0]
        return (
          <Card key={s} className="panel source-card">
            <div className={'source-icon ' + s}>
              <Icon size={17} />
            </div>
            <div>
              <h3>{sources[s]}</h3>
              <p>{sourceText[s]}</p>
              <div className="source-age">
                <i className={fresh(latest, now) ? 'current' : ''} />
                {latest
                  ? (latest.simulated ? 'Simulated · ' : '') +
                    age(latest.at, now) +
                    (fresh(latest, now) ? '' : ' · Out of date')
                  : 'No readings yet'}
              </div>
            </div>
            {full && onDevices && (s === 'ble' || s === 'sensor') && (
              <button className="text-btn" onClick={() => onDevices(s)}>
                Open input <ArrowRight size={14} />
              </button>
            )}
          </Card>
        )
      })}
    </div>
  )
}

export function SeatList({
  locations,
  section,
  filter,
  query,
  onPick,
  now,
  selected,
  onShowAll,
}) {
  const spot = query.trim()
  const rows = [...locations.values()].filter(
    (p) =>
      (section === 'all' || section === p.section) &&
      (filter !== 'free' || looksFree(p)) &&
      matchesQuery(p, spot),
  )
  if (filter === 'free')
    rows.sort((a, b) => b.tally.free - a.tally.free || a.id.localeCompare(b.id))
  const chosenSeat = spot.toUpperCase().replace(/\s+/g, '')
  return (
    <div className="seat-list" aria-label="Floor locations">
      {rows.length ? (
        <>
          <p className="list-total">{plural(rows.length, 'place')}</p>
          {rows.map((p) => (
            <button
              key={p.id}
              className={'list-location ' + (selected === p.id ? 'picked' : '')}
              onClick={() =>
                onPick(p.id, chosenSeat.startsWith(p.id + '-') ? chosenSeat : null)
              }
            >
              <span className={'list-icon ' + p.status}>
                <Armchair size={17} />
              </span>
              <span>
                <b>{label(p.id)}</b>
                <small className={'list-status ' + p.status}>{placeDescription(p)}</small>
                <small>
                  {p.section === 'tables' ? 'Round tables' : 'Individual seats'} ·{' '}
                  <Origin event={p.latest} now={now} />
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </>
      ) : (
        <div className="empty">
          <Search size={24} />
          {spot ? (
            <>
              <h3>Nothing matches “{spot}”</h3>
              <p>Try a table or seat number, like “table 5” or “seat 12”.</p>
            </>
          ) : filter === 'free' ? (
            <>
              <h3>No free seats reported right now</h3>
              <p>Seen an empty seat? Tap it on the map and choose “It's free”.</p>
            </>
          ) : (
            <h3>No places in this area</h3>
          )}
          {onShowAll && (filter === 'free' || section !== 'all') && (
            <Button variant="outline" onClick={onShowAll}>
              Show all seats
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export function Activity({ events, now }) {
  const rows = [...events].sort((a, b) => b.at - a.at)
  return (
    <Card className="panel activity">
      <div className="panel-heading">
        <div>
          <h2>Latest updates</h2>
          <p>The newest reading from each source at each place.</p>
        </div>
        <Radio size={19} />
      </div>
      {rows.length ? (
        rows.slice(0, 25).map((e) => {
          const Icon = sourceIcons[e.source]
          return (
            <div className="activity-row" key={e.id}>
              <span className={'source-icon ' + e.source}>
                <Icon size={15} />
              </span>
              <span>
                <b>{label(e.target)}</b>
                <small>
                  <Origin event={e} now={now} />
                </small>
              </span>
              <strong>
                {e.source === 'ble'
                  ? plural(e.value, 'device')
                  : e.value === 'free'
                    ? 'Free'
                    : 'Taken'}
              </strong>
            </div>
          )
        })
      ) : (
        <div className="empty">
          <Radio />
          <p>Waiting for the first floor update.</p>
        </div>
      )}
    </Card>
  )
}
