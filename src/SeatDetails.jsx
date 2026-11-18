import React, { useEffect, useState } from 'react'
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  LogIn,
  LogOut,
  QrCode,
  Radio,
  UserRound,
  X,
} from 'lucide-react'
import { Card } from './components/ui/card'
import { Button } from './components/ui/button'
import { age, fresh, holdsUntil, placeDescription, sources, statuses } from './model.js'
import { label } from './floor.js'
import {
  activeCheckIn,
  clock,
  friendly,
  ownCheckIn,
  remaining,
  remember,
} from './checkin.js'
import { PlanDrawing } from './FloorMap.jsx'

export function Status({ value, children }) {
  return (
    <span className={'status ' + value}>
      <i />
      {children || statuses[value] || value}
    </span>
  )
}
export function Origin({ event, now }) {
  if (!event) return <span className="origin">No updates yet</span>
  return (
    <span className="origin">
      {event.simulated ? 'Simulated · ' : ''}
      {sources[event.source]} · {age(event.at, now)}
      {!fresh(event, now) ? ' · Out of date' : ''}
    </span>
  )
}
const tones = { inuse: 'occupied', sensorfree: 'free' }
const short = { free: 'Free', occupied: 'Taken', unknown: 'No info', mixed: 'Mixed' }
const chairName = (id) => (id.includes('-') ? 'Chair ' + id.slice(-1) : 'this seat')

/*
 * Everything about one table or seat: what it is, how sure we are,
 * and one-tap ways to report it or check in.
 * mode: 'panel' (desktop side panel), 'peek' or 'full' (phone sheet).
 */
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
  mode = 'panel',
  onExpand,
  onCollapse,
  onClose,
  locator = false,
  section,
  filter,
}) {
  const [busy, setBusy] = useState(false),
    [toast, setToast] = useState(null),
    [confirm, setConfirm] = useState(null)
  const isTable = place.section === 'tables',
    state = model.states.get(seat),
    held = activeCheckIn(state, now),
    mine = ownCheckIn(room, seat, state, now),
    other = held && !mine,
    peek = mode === 'peek'
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])
  useEffect(() => setConfirm(null), [seat])

  async function run(work) {
    setBusy(true)
    setToast(null)
    setConfirm(null)
    try {
      setToast({ text: await work() })
    } catch (e) {
      setToast({ text: friendly(e), failed: true })
    } finally {
      setBusy(false)
    }
  }
  const checkIn = () =>
    run(async () => {
      const event = await record({ source: 'qr', target: seat, value: 'occupied' })
      remember(room, seat, event.id)
      return (
        'Checked in at ' + label(seat) + '. Held until ' + clock(holdsUntil(event)) + '.'
      )
    })
  const checkOut = (target = seat) =>
    run(async () => {
      await record({ source: 'qr', target, value: 'free' })
      remember(room, target, null)
      return 'Checked out of ' + label(target) + '. Thanks for freeing it up.'
    })
  function report(value, force = false) {
    if (value === 'free' && mine) return checkOut()
    if (value === 'free' && other && !force)
      return setConfirm({
        text:
          'Someone checked in here ' +
          age(held.at, now) +
          '. Is ' +
          chairName(seat) +
          ' really empty?',
      })
    run(async () => {
      await record({ source: 'report', target: seat, value })
      return (
        'Thanks! ' +
        label(seat) +
        ' marked ' +
        (value === 'free' ? 'free' : 'taken') +
        '. Reports last 15 minutes.'
      )
    })
  }
  function reportTable(value) {
    run(async () => {
      const targets = place.ids.filter(
        (id) =>
          value === 'occupied' ||
          !activeCheckIn(model.states.get(id), now) ||
          ownCheckIn(room, id, model.states.get(id), now),
      )
      for (const id of targets) {
        if (value === 'free' && ownCheckIn(room, id, model.states.get(id), now)) {
          await record({ source: 'qr', target: id, value: 'free' })
          remember(room, id, null)
        } else await record({ source: 'report', target: id, value })
      }
      const skipped = place.ids.length - targets.length
      return (
        'Thanks! ' +
        label(place.id) +
        ': ' +
        targets.length +
        (targets.length === 1 ? ' chair' : ' chairs') +
        ' marked ' +
        (value === 'free' ? 'free' : 'taken') +
        '.' +
        (skipped
          ? ' ' + skipped + ' checked-in ' + (skipped === 1 ? 'chair was' : 'chairs were') + ' left as is.'
          : '')
      )
    })
  }

  const chairTiles = isTable && (
    <div className="chair-tabs" role="group" aria-label="Chairs at this table">
      {place.ids.map((id) => {
        const s = model.states.get(id).status
        return (
          <button
            key={id}
            onClick={() => {
              onSeat(id)
              if (peek) onExpand?.()
            }}
            aria-pressed={!peek && id === seat}
            className={s}
            aria-label={'Chair ' + id.slice(-1) + ', ' + statuses[s]}
          >
            <b>{id.slice(-1)}</b>
            <small>
              <i />
              {short[s]}
            </small>
          </button>
        )
      })}
    </div>
  )
  const reportButtons = (
    <div className="report-row">
      <Button
        variant="outline"
        className="report free"
        disabled={busy}
        onClick={() => report('free')}
      >
        <Check />
        It's free
      </Button>
      <Button
        variant="outline"
        className="report taken"
        disabled={busy}
        onClick={() => report('occupied')}
      >
        <UserRound />
        It's taken
      </Button>
    </div>
  )
  const live = (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && <p className={toast.failed ? 'error' : 'feedback'}>{toast.text}</p>}
    </div>
  )

  return (
    <Card className={'panel inspector mode-' + mode}>
      <header className="inspector-head">
        {mode !== 'panel' && (
          <button
            className="sheet-handle"
            aria-label={peek ? 'Show more' : 'Show less'}
            aria-expanded={!peek}
            onClick={peek ? onExpand : onCollapse}
          >
            <span />
          </button>
        )}
        <div className="inspector-title">
          <div>
            <h2>{label(place.id)}</h2>
            <p>
              <Status value={tones[place.status] || place.status}>
                {placeDescription(place)}
              </Status>
              <span className="where">
                {isTable ? 'Round table · 4 chairs' : 'Individual seat'}
              </span>
            </p>
          </div>
          {onClose && (
            <button className="icon-btn close-sheet" aria-label="Close" onClick={onClose}>
              <X size={20} />
            </button>
          )}
        </div>
      </header>
      <div className="inspector-body">
        {locator && (
          <div className="locator" aria-hidden="true">
            <PlanDrawing
              model={model}
              selected={place.id}
              section={section}
              filter={filter}
              now={now}
              pxPerUnit={0.2}
              labels={false}
            />
          </div>
        )}
        {chairTiles}
        {isTable && !peek && (
          <div className="seat-reading">
            <span className="field-title">Chair {seat.slice(-1)}</span>
            <Status value={state.status} />
          </div>
        )}
        {(!peek || !isTable) && <Origin event={state.latest} now={now} />}
        {!peek && isTable && place.sensor && (
          <div className="sensor-line">
            <Radio size={14} />
            <span>
              {fresh(place.sensor, now)
                ? place.sensor.value === 'free'
                  ? 'Table sensor: nobody at this table'
                  : "Table sensor: someone's at this table"
                : 'Table sensor: no recent reading'}
              <small>
                <Origin event={place.sensor} now={now} />
              </small>
            </span>
          </div>
        )}
        {!peek && (canCheckIn || mine) && (
          <section className="checkin-block" aria-label="Check in">
            {mine ? (
              <>
                <p className="checkin-note">
                  <b>You're checked in at {label(seat)}.</b> Your chair is held until{' '}
                  {clock(holdsUntil(mine))} ({remaining(mine, now)}). Check out when you
                  leave so someone else can sit.
                </p>
                <Button className="wide big" disabled={busy} onClick={() => checkOut()}>
                  <LogOut />
                  {busy ? 'Checking out…' : 'Check out'}
                </Button>
              </>
            ) : other ? (
              <>
                <p className="checkin-note">
                  <b>Someone checked in to {chairName(seat)} {age(held.at, now)}.</b>{' '}
                  {isTable ? 'Pick another chair above.' : ''} If it's empty, tap “It's free”
                  below.
                </p>
                <Button className="wide big" disabled>
                  <LogIn />
                  {isTable ? chairName(seat) + ' is taken' : 'This seat is taken'}
                </Button>
              </>
            ) : (
              <>
                <p className="checkin-note">
                  Sitting {isTable ? 'in ' + chairName(seat) : 'here'}? Check in to hold it for
                  60 minutes. You can check out any time.
                </p>
                <Button className="wide big" disabled={busy} onClick={checkIn}>
                  <LogIn />
                  {busy
                    ? 'Checking in…'
                    : isTable
                      ? 'Check in to ' + chairName(seat)
                      : 'Check in to this seat'}
                </Button>
              </>
            )}
          </section>
        )}
        {(!peek || !isTable) && (
          <section className="report-block" aria-label="Report">
            <div className="field-title report-heading">
              {isTable ? 'Is ' + chairName(seat) + ' free?' : 'Is this seat free?'}
            </div>
            {reportButtons}
            {confirm && (
              <div className="confirm" role="alertdialog" aria-label="Confirm report">
                <p>{confirm.text}</p>
                <div className="report-row">
                  <Button onClick={() => report('free', true)}>Yes, it's empty</Button>
                  <Button variant="outline" onClick={() => setConfirm(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {!peek && isTable && (
              <div className="whole-table">
                <span>Whole table:</span>
                <button disabled={busy} onClick={() => reportTable('free')}>
                  All free
                </button>
                <button disabled={busy} onClick={() => reportTable('occupied')}>
                  All taken
                </button>
              </div>
            )}
          </section>
        )}
        {live}
        {peek && (
          <Button variant="outline" className="wide more" onClick={onExpand}>
            {isTable ? 'Report or check in' : 'More details'}
            <ChevronUp />
          </Button>
        )}
        {!peek && !canCheckIn && !mine && (
          <p className="qr-hint">
            <QrCode size={16} />
            <span>
              Sitting here? Scan the QR code on the {isTable ? 'table' : 'seat'} to check in and
              hold your {isTable ? 'chair' : 'seat'}.
            </span>
          </p>
        )}
        {!peek && state.evidence.length > 0 && (
          <details className="evidence-detail">
            <summary>
              Why “{statuses[state.status]}”?
              <ChevronDown size={14} />
            </summary>
            <p>
              Each source counts for a while: check-ins 60 minutes, student reports 15 minutes,
              table sensors 5 minutes. When fresh sources disagree, the seat shows Mixed
              reports.
            </p>
            {state.evidence.map((e) => (
              <div key={e.id}>
                <b>{statuses[e.value]}</b>
                <Origin event={e} now={now} />
              </div>
            ))}
          </details>
        )}
      </div>
      {!peek && (
        <button className="inspector-qr" onClick={openQR}>
          <QrCode size={16} />
          Show {isTable ? 'table' : 'seat'} QR code
          <ArrowUpRight size={15} />
        </button>
      )}
    </Card>
  )
}
