import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  LogIn,
  LogOut,
  QrCode,
  Radio,
  RotateCcw,
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
  endingSoon,
  friendly,
  myCheckIns,
  ownCheckIn,
  released,
  remaining,
  remember,
  uncertain,
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

/*
 * Everything about one table or seat: one-tap ways to report it or check in
 * first, then how sure we are and where the information came from.
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
  next,
  focusKey = 0,
}) {
  const [busy, setBusy] = useState(false),
    [toast, setToast] = useState(null),
    [confirm, setConfirm] = useState(null),
    [pending, setPending] = useState(null)
  const heading = useRef(null),
    actions = useRef(null),
    confirmRef = useRef(null),
    freeButton = useRef(null),
    drag = useRef(null),
    dragged = useRef(false)
  const isTable = place.section === 'tables',
    state = model.states.get(seat),
    held = activeCheckIn(state, now),
    mine = ownCheckIn(room, seat, state, now) || (pending === seat && held) || null,
    other = held && !mine,
    peek = mode === 'peek',
    phone = mode !== 'panel',
    noun = isTable ? 'chair' : 'seat',
    // In the demo nothing expires, so holds and reports last until someone changes them.
    demo = !room.id.startsWith('floor')
  const holds = myCheckIns(room, model, now).filter((c) => c.seat !== seat)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.undo ? 8000 : 5000)
    return () => clearTimeout(t)
  }, [toast])
  useEffect(() => setConfirm(null), [seat])
  // Opening from the list, Find or a QR link moves focus to the seat's name.
  useEffect(() => {
    if (focusKey) heading.current?.focus({ preventScroll: true })
  }, [focusKey])
  useLayoutEffect(() => {
    if (confirm) {
      confirmRef.current?.scrollIntoView({ block: 'nearest' })
      confirmRef.current?.querySelector('button')?.focus({ preventScroll: true })
    }
  }, [confirm])

  async function run(work) {
    if (busy) return
    // Acting on a chair keeps it chosen, even when live data would pick another.
    onSeat?.(seat)
    setBusy(true)
    setToast(null)
    setConfirm(null)
    try {
      const result = await work()
      setToast(typeof result === 'string' ? { text: result } : result)
    } catch (e) {
      setToast({ text: friendly(e), failed: true })
    } finally {
      setBusy(false)
    }
  }
  // End this browser's other holds once a new check-in has landed.
  async function releaseOthers() {
    const ended = []
    for (const c of holds) {
      try {
        await record({ source: 'qr', target: c.seat, value: 'free' })
        remember(room, c.seat, null)
        ended.push(label(c.seat))
      } catch {
        /* The old hold simply runs out on its own. */
      }
    }
    return ended.length ? ' Your hold on ' + ended.join(' and ') + ' has ended.' : ''
  }
  // The id is chosen and saved before sending, so the live update is
  // recognised as yours even if it arrives before the reply.
  const checkIn = (target = seat, renew = false) =>
    run(async () => {
      const id = crypto.randomUUID(),
        before = renew ? mine?.id : null
      remember(room, target, id, before)
      setPending(target)
      try {
        const event = await record({ source: 'qr', target, value: 'occupied', id })
        remember(room, target, id)
        const extra = renew ? '' : await releaseOthers()
        return (
          (renew ? 'Your seat is held' : 'Checked in at ' + label(target) + '. Held') +
          (demo ? ' until you check out.' : ' until ' + clock(holdsUntil(event)) + '.') +
          sensorNote('occupied', [target]) +
          extra
        )
      } catch (e) {
        if (uncertain(e))
          return {
            text: 'Could not confirm your check-in. If it went through, it will show here in a moment.',
            failed: true,
          }
        remember(room, target, before)
        throw e
      } finally {
        setPending(null)
      }
    })
  const checkOut = (target = seat) =>
    run(async () => {
      await record({ source: 'qr', target, value: 'free' })
      remember(room, target, null)
      return {
        text: 'Checked out of ' + label(target) + '. Thanks for freeing it up.',
        undo: target,
      }
    })
  function report(value, force = false) {
    if (value === 'free' && other && !force) {
      onSeat?.(seat)
      return setConfirm({
        text:
          'Someone checked in here ' +
          ago(held.at, now) +
          '. Is ' +
          chairName(seat) +
          ' really empty?',
      })
    }
    run(async () => {
      await record({ source: 'report', target: seat, value })
      return (
        'Thanks! ' +
        label(seat) +
        ' marked ' +
        (value === 'free' ? 'free' : 'taken') +
        (demo ? '.' : '. Reports last 15 minutes.') +
        (force ? ' Anyone sitting there can now check in.' : '') +
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
  // A current seat-sensor reading decides the seat, so say when a report or
  // check-in won't change it.
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
      const targets = place.ids.filter(
        (id) =>
          value === 'occupied' ||
          !activeCheckIn(model.states.get(id), now) ||
          ownCheckIn(room, id, model.states.get(id), now),
      )
      const results = await Promise.allSettled(
        targets.map(async (id) => {
          if (value === 'free' && ownCheckIn(room, id, model.states.get(id), now)) {
            await record({ source: 'qr', target: id, value: 'free' })
            remember(room, id, null)
          } else await record({ source: 'report', target: id, value })
        }),
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
          ? ' ' +
            skipped +
            ' checked-in ' +
            (skipped === 1 ? 'chair was' : 'chairs were') +
            ' left as is.'
          : '') +
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
  const reportButtons = confirm ? (
    <div
      className="confirm"
      role="alertdialog"
      aria-label="Confirm report"
      ref={confirmRef}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          setConfirm(null)
          requestAnimationFrame(() => freeButton.current?.focus())
        }
      }}
    >
      <p>{confirm.text}</p>
      <div className="report-row">
        <Button {...wait} onClick={() => report('free', true)}>
          Yes, it's empty
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setConfirm(null)
            requestAnimationFrame(() => freeButton.current?.focus())
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  ) : (
    <div className="report-row">
      <Button
        ref={freeButton}
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
          {toast.undo && (
            <button
              className="toast-undo"
              onClick={() => {
                const target = toast.undo
                setToast(null)
                checkIn(target)
              }}
            >
              <RotateCcw size={15} /> Undo
            </button>
          )}
        </p>
      )}
    </div>
  )
  const takenOver = mine && released(state, mine, now)
  const checkInBlock = !peek && (canCheckIn || mine) && (
    <section
      className="checkin-block"
      aria-label="Check in"
      ref={canCheckIn || mine ? actions : undefined}
      tabIndex={-1}
    >
      {mine ? (
        <>
          <p className="checkin-note">
            {takenOver ? (
              <>
                <b>Someone marked your {noun} free.</b> Still sitting here? Keep it so nobody
                else checks in.
              </>
            ) : (
              <>
                <b>You're checked in at {label(seat)}.</b> Your {noun} is held until{' '}
                {demo
                  ? 'you check out'
                  : clock(holdsUntil(mine)) + ' (' + remaining(mine, now) + ')'}
                . Check out when you leave so someone else can sit.
              </>
            )}
          </p>
          {(takenOver || endingSoon(mine, now)) && (
            <Button className="wide big" {...wait} onClick={() => checkIn(seat, true)}>
              <RotateCcw />
              {takenOver ? 'Keep my ' + noun : 'Keep it 60 more minutes'}
            </Button>
          )}
          <Button
            className="wide big"
            variant={takenOver || endingSoon(mine, now) ? 'outline' : 'default'}
            {...wait}
            onClick={() => checkOut()}
          >
            <LogOut />
            {busy ? 'Saving…' : 'Check out'}
          </Button>
        </>
      ) : other ? (
        <>
          <p className="checkin-note">
            <b>
              Someone checked in to {chairName(seat)} {ago(held.at, now)}.
            </b>{' '}
            {isTable
              ? 'Pick a free chair above.'
              : 'It stays held until ' +
                (demo ? 'they check out' : clock(holdsUntil(held))) +
                '.'}{' '}
            If nobody is there, tap “It's free” below and you can check in.
          </p>
          <Button className="wide big" disabled>
            <LogIn />
            {isTable ? chairName(seat) + ' is taken' : 'This seat is taken'}
          </Button>
        </>
      ) : (
        <>
          <p className="checkin-note">
            Sitting {isTable ? 'in ' + chairName(seat) : 'here'}?{' '}
            {demo
              ? 'Check in to hold it until you check out.'
              : 'Check in to hold it for 60 minutes. You can check out any time.'}
            {holds.length > 0 && (
              <>
                {' '}
                <b>This ends your hold on {holds.map((c) => label(c.seat)).join(' and ')}.</b>
              </>
            )}
          </p>
          <Button className="wide big" {...wait} onClick={() => checkIn()}>
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
                {isTable ? 'Round table · 4 chairs' : 'Individual seat'}
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
        {checkInBlock}
        {(!peek || !isTable) && !mine && (
          <section className="report-block" aria-label="Report">
            <div
              className="field-title report-heading"
              ref={canCheckIn ? undefined : actions}
              tabIndex={-1}
            >
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
            {isTable ? 'Report or check in' : 'More details'}
            <ChevronUp />
          </Button>
        )}
        {!peek && (
          <section className="qr-block" aria-label="QR check-in">
            <QrCode size={18} />
            <p>
              <b>QR check-in</b>
              {canCheckIn || mine
                ? 'Share this ' + (isTable ? 'table' : 'seat') + '’s code with others.'
                : 'Sitting here? Scan the code on the ' +
                  (isTable ? 'table' : 'seat') +
                  ' to check in and hold your ' +
                  noun +
                  '.'}
            </p>
            <Button variant="outline" className="qr-open" onClick={openQR}>
              Show {isTable ? 'table' : 'seat'} QR code
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
                ? 'In the demo nothing expires: a seat changes only when someone reports it, checks in, checks out or makes a sensor reading.'
                : 'Each source counts for a while: check-ins 60 minutes, student reports 15 minutes, seat sensors 5 minutes.'}{' '}
              A current seat-sensor reading decides the seat. Otherwise the newest report or
              check-in wins.
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
