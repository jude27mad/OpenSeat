import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Check, ChevronDown, ChevronUp, QrCode, Radio, UserRound, X } from 'lucide-react'
import { Card } from './components/ui/card'
import { Button } from './components/ui/button'
import { age, fresh, placeDescription, sources, statuses } from './model.js'
import { arrivalCue, label } from './floor.js'
import { PlanDrawing } from './FloorMap.jsx'

export function Status({ value, children }) {
  return (
    <span className={'status ' + value}>
      <i />
      {children || statuses[value] || value}
    </span>
  )
}
// Readings that come from the demo's example data, not a real device or person.
export const DemoTag = () => <span className="demo-tag">Demo</span>
export function Origin({ event, now }) {
  if (!event) return <span className="origin">No updates yet</span>
  return (
    <span className="origin">
      {sources[event.source]} · {age(event.at, now)}
      {!fresh(event, now) ? ' · Out of date' : ''}
      {event.simulated && <DemoTag />}
    </span>
  )
}
const tones = { inuse: 'occupied' }
const short = { free: 'Free', occupied: 'Taken', unknown: 'No info' }
const chairName = (id) => (id.includes('-') ? 'Chair ' + id.slice(-1) : 'this seat')
const ago = (at, now) => age(at, now).toLowerCase()
// Turn transport and service errors into something a student can act on.
function friendly(error) {
  const text = String(error?.message || error || '')
  if (/network|fetch|timed? ?out|offline|load failed|abort/i.test(text))
    return 'Could not reach OpenSeat. Check your connection and try again.'
  if (/declined/i.test(text)) return 'That update was not accepted. Please try again.'
  return text || 'Something went wrong. Please try again.'
}

/*
 * Everything about one table or seat: one-tap ways to report it first, then
 * how sure we are and where the information came from.
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
  mode = 'panel',
  onExpand,
  onCollapse,
  onClose,
  locator = false,
  section,
  filter,
  next,
  isRecommendation = false,
  focusKey = 0,
}) {
  const [busy, setBusy] = useState(false),
    [toast, setToast] = useState(null)
  const heading = useRef(null),
    actions = useRef(null),
    drag = useRef(null),
    dragged = useRef(false)
  const isTable = place.section === 'tables',
    state = model.states.get(seat),
    peek = mode === 'peek',
    phone = mode !== 'panel',
    kind = isTable ? 'table' : 'seat',
    // In the demo nothing expires, so reports last until someone changes them.
    demo = !room.id.startsWith('floor')
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])
  // Opening from the list, Find or a QR link moves focus to the seat's name.
  useEffect(() => {
    if (focusKey) heading.current?.focus({ preventScroll: true })
  }, [focusKey])

  async function run(work) {
    if (busy) return
    // Acting on a chair keeps it chosen, even when live data would pick another.
    onSeat?.(seat)
    setBusy(true)
    setToast(null)
    try {
      const result = await work()
      setToast(typeof result === 'string' ? { text: result } : result)
    } catch (e) {
      setToast({ text: friendly(e), failed: true })
    } finally {
      setBusy(false)
    }
  }
  function report(value) {
    run(async () => {
      await record({ source: 'report', target: seat, value })
      return (
        'Thanks! ' +
        label(seat) +
        ' marked ' +
        (value === 'free' ? 'free' : 'taken') +
        (demo ? '.' : '. Reports last 15 minutes.') +
        sensorNote(value)
      )
    })
  }
  // The sensor for this seat or chair. In the demo, its buttons sit beside the
  // reading, so the map and the reading change right where you pressed.
  const sensorEvent = state?.evidence.find((e) => e.source === 'sensor')
  function simulateSensor(value) {
    run(async () => {
      await record({ source: 'sensor', target: seat, value, simulated: true })
      return 'Demo sensor reading: ' + label(seat) + (value === 'free' ? ' is free.' : ' is in use.')
    })
  }
  // A current seat-sensor reading decides the seat, so say when a report
  // won't change it.
  function sensorNote(value, ids = [seat]) {
    const off = ids.filter((id) => {
      const reading = model.states.get(id)?.sensor
      return reading && reading.value !== value
    })
    if (!off.length) return ''
    const reads = value === 'free' ? 'in use' : 'free'
    return ids.length === 1
      ? ' Its sensor still reads ' + reads + ', and the sensor decides.'
      : ' The sensor on ' + off.map(chairName).join(', ') + ' still reads ' + reads + ', and the sensor decides.'
  }
  function reportTable(value) {
    run(async () => {
      const targets = place.ids
      const results = await Promise.allSettled(
        targets.map((id) => record({ source: 'report', target: id, value })),
      )
      const saved = results.filter((r) => r.status === 'fulfilled').length
      if (saved < targets.length) {
        const failure = results.find((r) => r.status === 'rejected').reason
        throw new Error(
          saved
            ? 'Saved ' + saved + ' of ' + targets.length + ' chairs. ' + friendly(failure)
            : failure?.message,
        )
      }
      return (
        'Thanks! ' +
        label(place.id) +
        ': ' +
        targets.length +
        (targets.length === 1 ? ' chair' : ' chairs') +
        ' marked ' +
        (value === 'free' ? 'free' : 'taken') +
        '.' +
        sensorNote(value, targets)
      )
    })
  }
  function expand() {
    onExpand?.()
    requestAnimationFrame(() => actions.current?.focus({ preventScroll: true }))
  }
  // Drag the handle or title: up opens the sheet, down shrinks or closes it.
  const dragHandlers = phone && {
    onPointerDown(e) {
      if (e.target.closest('.close-sheet')) return
      drag.current = { y: e.clientY, sheet: e.currentTarget.closest('.sheet'), moved: 0 }
    },
    onPointerMove(e) {
      const d = drag.current
      if (!d) return
      d.moved = e.clientY - d.y
      if (d.sheet && d.moved > 0) d.sheet.style.transform = 'translateY(' + d.moved + 'px)'
    },
    onPointerUp() {
      const d = drag.current
      drag.current = null
      if (!d) return
      if (d.sheet) d.sheet.style.transform = ''
      dragged.current = Math.abs(d.moved) > 8
      if (d.moved < -40 && peek) expand()
      else if (d.moved > 40) (peek ? onClose : onCollapse)?.()
    },
    onPointerCancel() {
      if (drag.current?.sheet) drag.current.sheet.style.transform = ''
      drag.current = null
    },
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
  // Disabled buttons drop keyboard focus, so busy buttons only look disabled.
  const wait = { 'aria-disabled': busy || undefined }
  const reportButtons = (
    <div className="report-row">
      <Button
        variant="outline"
        className="report free"
        {...wait}
        onClick={() => report('free')}
      >
        <Check />
        It's free
      </Button>
      <Button
        variant="outline"
        className="report taken"
        {...wait}
        onClick={() => report('occupied')}
      >
        <UserRound />
        It's taken
      </Button>
    </div>
  )
  const message = (
    <div
      className={'toast-region' + (phone ? ' phone-toast' : '')}
      role="status"
      aria-live="polite"
    >
      {toast && (
        <p className={toast.failed ? 'error' : 'feedback'}>
          <span>{toast.text}</span>
        </p>
      )}
    </div>
  )
  const nextButton = next && (
    <Button variant="outline" className="wide next-spot" onClick={next.onNext}>
      {next.text}
      <ArrowRight />
    </Button>
  )
  return (
    <Card className={'panel inspector mode-' + mode}>
      <header className="inspector-head" {...dragHandlers}>
        {phone && (
          <button
            className="sheet-handle"
            aria-label={peek ? 'Show more' : 'Show less'}
            aria-expanded={!peek}
            onClick={() => {
              if (dragged.current) return void (dragged.current = false)
              peek ? expand() : onCollapse?.()
            }}
          >
            <span />
          </button>
        )}
        <div className="inspector-title">
          <div>
            <h2 ref={heading} tabIndex={-1}>
              {label(place.id)}
            </h2>
            <p>
              <Status value={tones[place.status] || place.status}>
                {placeDescription(place)}
              </Status>
              <span className="where">
                {isRecommendation ? arrivalCue(place) : isTable ? 'Round table · 4 chairs' : 'Individual seat'}
              </span>
            </p>
          </div>
          {onClose && (
            <button
              className="icon-btn close-sheet"
              aria-label={'Close ' + label(place.id)}
              onClick={onClose}
            >
              <X size={20} />
            </button>
          )}
        </div>
        {!phone && nextButton}
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
        {(sensorEvent || demo) && (!peek || !isTable) && (
          <div className="sensor-line">
            <Radio size={15} />
            <span>
              <b>{isTable ? chairName(seat) + ' sensor' : 'Seat sensor'}:</b>{' '}
              {!sensorEvent
                ? 'no reading yet'
                : !fresh(sensorEvent, now)
                  ? 'no recent reading'
                  : sensorEvent.value === 'free'
                    ? 'nobody in this seat'
                    : "someone's in this seat"}
              {sensorEvent && (
                <small>
                  {ago(sensorEvent.at, now)}
                  {sensorEvent.simulated && <DemoTag />}
                </small>
              )}
            </span>
            {demo && (
              <div className="sensor-try" role="group" aria-label="Try the sensor">
                <button {...wait} onClick={() => simulateSensor('free')}>
                  Sensor: free
                </button>
                <button {...wait} onClick={() => simulateSensor('occupied')}>
                  Sensor: in use
                </button>
              </div>
            )}
          </div>
        )}
        {(!peek || !isTable) && (
          <section className="report-block" aria-label="Report">
            <div className="field-title report-heading" ref={actions} tabIndex={-1}>
              {isTable ? 'Is ' + chairName(seat) + ' free?' : 'Is this seat free?'}
            </div>
            {reportButtons}
            {!peek && isTable && (
              <div className="whole-table">
                <span>Whole table:</span>
                <button {...wait} onClick={() => reportTable('free')}>
                  All free
                </button>
                <button {...wait} onClick={() => reportTable('occupied')}>
                  All taken
                </button>
              </div>
            )}
          </section>
        )}
        {isTable && !peek && (
          <div className="seat-reading">
            <span className="field-title">Chair {seat.slice(-1)}</span>
            <Status value={state.status} />
          </div>
        )}
        {(!peek || !isTable) && <Origin event={state.latest} now={now} />}
        {phone ? createPortal(message, document.body) : message}
        {phone && nextButton}
        {peek && (
          <Button variant="outline" className="wide more" onClick={expand}>
            {isTable ? 'Report this table' : 'More details'}
            <ChevronUp />
          </Button>
        )}
        {!peek && (
          <section className="qr-block" aria-label="QR code">
            <QrCode size={18} />
            <p>
              <b>QR code</b>
              Scanning this {kind}’s code opens it on OpenSeat.
            </p>
            <Button variant="outline" className="qr-open" onClick={openQR}>
              Show {kind} QR code
            </Button>
          </section>
        )}
        {!peek && state.evidence.length > 0 && (
          <details className="evidence-detail">
            <summary>
              Why “{statuses[state.status]}”?
              <ChevronDown size={14} />
            </summary>
            <p>
              {demo
                ? 'In the demo nothing expires: a seat changes only when someone reports it or makes a sensor reading.'
                : 'Each source counts for a while: student reports 15 minutes, seat sensors 5 minutes.'}{' '}
              A current seat-sensor reading decides the seat. Otherwise the newest report wins.
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
    </Card>
  )
}
