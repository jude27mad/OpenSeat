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
import { floor, label, tables } from './floor.js'
import { age, fresh, matchesQuery, looksFree, placeDescription, sources } from './model.js'
import { endingSoon, holdText, remaining } from './checkin.js'
import { DemoTag, Origin } from './SeatDetails.jsx'

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

// What each of the four sources currently knows, alongside the floor overview.
// These are readouts, not choices: the map already combines all four.
export function SourcesPanel({ model, now, onScanner, onMore }) {
  let checkIns = 0,
    reports = 0,
    lastReport = 0,
    lastCheckIn = 0
  const demo = { qr: false, report: false }
  for (const state of model.states.values()) {
    const qr = state.evidence.find((e) => e.source === 'qr'),
      report = state.evidence.find((e) => e.source === 'report')
    if (qr && qr.value === 'occupied' && fresh(qr, now)) {
      checkIns++
      lastCheckIn = Math.max(lastCheckIn, qr.at)
      demo.qr ||= !!qr.simulated
    }
    if (report && fresh(report, now)) {
      reports++
      lastReport = Math.max(lastReport, report.at)
      demo.report ||= !!report.simulated
    }
  }
  const sensors = [...model.locations.values()]
    .map((l) => l.sensor)
    .filter((e) => fresh(e, now))
  const newestSensor = sensors.reduce((a, b) => (!a || b.at > a.at ? b : a), null)
  const areas = [
    ['Round tables', model.ble.tables],
    ['Individual seats', model.ble.individuals],
  ].filter(([, e]) => fresh(e, now))
  const ago = (at) => age(at, now).toLowerCase()
  return (
    <section className="sources-live" aria-labelledby="sources-live-title">
      <div className="sources-live-head">
        <h2 id="sources-live-title">Floor data sources</h2>
        {onMore && (
          <button className="text-btn" onClick={onMore}>
            How it works <ArrowRight size={14} />
          </button>
        )}
      </div>
      <ul>
        <li>
          <span className="source-icon qr">
            <QrCode size={17} />
          </span>
          <div>
            <p className="live-name">
              QR check-in {demo.qr && <DemoTag />}
            </p>
            <p className="live-value">{plural(checkIns, tables.length ? 'chair' : 'seat')} checked in{lastCheckIn > 0 && ' · ' + ago(lastCheckIn)}</p>
            <small>Select a {tables.length ? 'table' : 'seat'} for its QR code.</small>
          </div>
        </li>
        <li>
          <span className="source-icon report">
            <MessageSquare size={17} />
          </span>
          <div>
            <p className="live-name">
              Student reports {demo.report && <DemoTag />}
            </p>
            <p className="live-value">{plural(reports, 'seat')} reported{lastReport > 0 && ' · ' + ago(lastReport)}</p>
            <small>Tap a seat to report it.</small>
          </div>
        </li>
        <li>
          <span className="source-icon ble">
            <Bluetooth size={17} />
          </span>
          <div>
            <p className="live-name">
              Bluetooth
            </p>
            {areas.length ? (
              areas.map(([area, e]) => (
                <p className="live-value" key={area}>
                  {area}: {plural(e.value, 'device')} · {ago(e.at)} {e.simulated && <DemoTag />}
                </p>
              ))
            ) : (
              <p className="live-value">No recent scan</p>
            )}
            {onScanner && (
              <button className="live-action" onClick={onScanner}>
                Connect scanner <ArrowRight size={14} />
              </button>
            )}
          </div>
        </li>
        <li>
          <span className="source-icon sensor">
            <Radio size={17} />
          </span>
          <div>
            <p className="live-name">
              Table sensors {newestSensor?.simulated && <DemoTag />}
            </p>
            <p className="live-value">
              {newestSensor
                ? label(newestSensor.target) + ' · ' + (newestSensor.value === 'free' ? 'Free' : 'In use') + ' · ' + ago(newestSensor.at)
                : 'No recent readings'}
            </p>
            <small>{tables.length ? 'Sensor dots mark tables on the map.' : 'A seat sensor sets that seat’s status.'}</small>
          </div>
        </li>
      </ul>
    </section>
  )
}

export function Legend() {
  return (
    <div className="legend" role="group" aria-label="Map key">
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
      {tables.length > 0 && (
        <span>
          <i className="sensor-dot" />
          Table sensor reading
        </span>
      )}
      <span>
        <i className="booked" />
        {floor.number === 5 ? 'Room (not counted)' : 'Bookable room (not counted)'}
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

// Not a live region: its countdown changes every minute.
export function CheckInBanner({ checkIns, now, onShow, onCheckOut, onKeep, busy }) {
  if (!checkIns.length) return null
  const { seat, event } = checkIns[0],
    soon = endingSoon(event, now)
  return (
    <section className={'mine-banner' + (soon ? ' soon' : '')} aria-label="Your check-in">
      <Clock3 size={17} />
      <p>
        <b>You're checked in at {label(seat)}</b>
        <small>
          {soon ? 'Ending soon: ' + remaining(event, now) : holdText(event, now)}
          {checkIns.length > 1 ? ' · and ' + plural(checkIns.length - 1, 'other seat') : ''}
        </small>
      </p>
      {soon && onKeep ? (
        <button aria-disabled={busy || undefined} onClick={() => !busy && onKeep(seat)}>
          Keep it
        </button>
      ) : (
        <button aria-label={'Show ' + label(seat)} onClick={() => onShow(seat)}>
          Show
        </button>
      )}
      <button
        className="solid"
        aria-label={'Check out of ' + label(seat)}
        aria-disabled={busy || undefined}
        onClick={() => !busy && onCheckOut(seat)}
      >
        Check out
      </button>
    </section>
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
                  ? age(latest.at, now) + (fresh(latest, now) ? '' : ' · Out of date')
                  : 'No readings yet'}
                {latest?.simulated && <DemoTag />}
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
  hiddenBy = [],
  onReveal,
}) {
  const spot = query.trim()
  const matching = [...locations.values()].filter((p) => matchesQuery(p, spot))
  const rows = matching.filter(
    (p) => (section === 'all' || section === p.section) && (filter !== 'free' || looksFree(p)),
  )
  // A search that only the filters hide says so, with a way to show it.
  const hidden = spot && !rows.length && matching.length <= 3 ? matching : []
  if (filter === 'free')
    rows.sort((a, b) => b.tally.free - a.tally.free || a.id.localeCompare(b.id))
  const chosenSeat = spot.toUpperCase().replace(/\s+/g, '')
  return (
    <div className="seat-list">
      <p className="list-total" role="status" aria-live="polite">
        {rows.length ? plural(rows.length, 'place') : ''}
      </p>
      {rows.length ? (
        <ul aria-label="Floor locations">
          {rows.map((p) => (
            <li key={p.id}>
            <button
              className={'list-location ' + (selected === p.id ? 'picked' : '')}
              aria-current={selected === p.id ? 'true' : undefined}
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
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <Search size={24} />
          {hidden.length && hiddenBy.length && onReveal ? (
            <>
              <h3>
                {hidden.map((p) => label(p.id)).join(' and ')}{' '}
                {hidden.length === 1 ? 'is' : 'are'} hidden by {hiddenBy.join(' and ')}
              </h3>
              <p>{hidden.map((p) => label(p.id) + ': ' + placeDescription(p)).join('. ')}.</p>
              <Button
                onClick={() =>
                  onReveal(hidden[0].id, chosenSeat.startsWith(hidden[0].id + '-') ? chosenSeat : null)
                }
              >
                Show {hidden.length === 1 ? 'it' : label(hidden[0].id)}
              </Button>
            </>
          ) : spot ? (
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
          {onShowAll && !(hidden.length && hiddenBy.length && onReveal) && (filter === 'free' || section !== 'all') && (
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
