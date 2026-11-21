import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  ArrowLeft,
  ExternalLink,
  Info,
  List,
  Map as MapIcon,
  Menu,
  Bluetooth,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  X,
} from 'lucide-react'
import { Button } from './components/ui/button'
import { FLOORS, floor, floorNumbers, label, seats, tables } from './floor.js'
import { age, fresh } from './model.js'
import { themeChoices, useTheme } from './theme.js'
import FloorMap from './FloorMap.jsx'
import SeatDetails from './SeatDetails.jsx'
import {
  Activity,
  CheckInBanner,
  DemoBanner,
  Legend,
  SeatList,
  SourceCards,
  SourcesPanel,
  plural,
} from './parts.jsx'

// Auto follows the phone's own light or dark setting.
function ThemeSwitch() {
  const [choice, choose] = useTheme()
  return (
    <div className="segmented" role="group" aria-label="Appearance">
      {themeChoices.map(([value, text]) => (
        <button key={value} aria-pressed={choice === value} onClick={() => choose(value)}>
          {text}
        </button>
      ))}
    </div>
  )
}

// The floor dropdown, on the main screen and in the menu.
function FloorSelect({ onFloor }) {
  return (
    <select
      className="floor-select"
      aria-label="Floor"
      value={floor.number}
      onChange={(e) => onFloor(Number(e.target.value))}
    >
      {floorNumbers.map((n) => (
        <option key={n} value={n}>
          {FLOORS[n].title}
        </option>
      ))}
    </select>
  )
}

function PhoneMenu({ demo, onClose, onRoom, onFloor, onShare, onSources }) {
  // onClose(then) closes the menu first, then runs the chosen action.
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content menu-sheet"
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            document.querySelector('.phone .menu-btn')?.focus({ preventScroll: true })
          }}
        >
          <div className="dialog-head">
            <Dialog.Title>Menu</Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-btn" aria-label="Close menu">
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Pick a floor, switch between the live floor and the demo, share the map or learn how it works.
          </Dialog.Description>
          <div className="menu-label">Which floor?</div>
          <FloorSelect onFloor={(n) => onClose(() => onFloor(n))} />
          <div className="menu-label">Which floor data?</div>
          <div className="segmented" role="group" aria-label="Floor data">
            <button aria-pressed={!demo} onClick={() => onClose(() => demo && onRoom(true))}>
              Live floor
            </button>
            <button aria-pressed={demo} onClick={() => onClose(() => !demo && onRoom(false))}>
              Demo
            </button>
          </div>
          <div className="menu-label">Appearance</div>
          <ThemeSwitch />
          <nav className="menu-list" aria-label="More">
            <button onClick={() => onClose(onShare)}>
              <Share2 size={18} /> Share this map
            </button>
            <a href="./classroom/"><Bluetooth size={18} /> Classroom demo</a>
            <button onClick={() => onClose(onSources)}>
              <Info size={18} /> How the data works
            </button>
            {demo && (
              <button onClick={() => onClose(() => onRoom(false, true))}>
                <RotateCcw size={18} /> Start the demo again
              </button>
            )}
            <a href="./evidence/">
              <ExternalLink size={18} /> Prototype evidence
            </a>
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/*
 * The phone layout: one screen that answers "where can I sit?" first,
 * with a sheet at the bottom for the seat you picked.
 */
export default function PhoneView(p) {
  const {
    room,
    demo,
    model,
    events,
    now,
    online,
    onRoom,
    onFloor,
    place,
    seat,
    setSeat,
    pick,
    qrPlace,
    record,
    sheet,
    setSheet,
    focus,
    view,
    setView,
    filter,
    changeFilters,
    section,
    query,
    page,
    nav,
    setModal,
    mine,
    checkOutMine,
    checkInAgain,
    busyMine,
    onFind,
    findCount,
    fromFind,
    choices,
    close,
    menu,
    openMenu,
    closeMenu,
    announce,
    headingFocus,
  } = p
  const sheetRef = useRef(null),
    root = useRef(null),
    [sheetH, setSheetH] = useState(0)
  const n = model.counts
  const latest = events.reduce(
    (best, e) => (fresh(e, now) && e.source !== 'ble' && (!best || e.at > best.at) ? e : best),
    null,
  )
  // Nothing fresh anywhere on the floor, not even a seat sensor.
  const empty =
    n.unknown === seats.length &&
    ![...model.locations.values()].some((l) => l.status !== 'unknown')
  const open = !!place && sheet !== 'closed'
  // Leave room under the page for the sheet so nothing hides behind it.
  // The height ignores the slide-in animation, which offsetHeight does not see.
  useLayoutEffect(() => {
    const el = sheetRef.current,
      docEl = document.documentElement
    if (!el) {
      docEl.style.setProperty('--sheet-h', '0px')
      return setSheetH(0)
    }
    const update = () => {
      docEl.style.setProperty('--sheet-h', el.offsetHeight + 'px')
      setSheetH(el.offsetHeight)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [open, place?.id])
  useEffect(() => () => document.documentElement.style.setProperty('--sheet-h', '0px'), [])
  // Keep the chosen seat on screen, between the top bar and the sheet.
  function keepVisible() {
    if (!place || !sheetRef.current || view !== 'map' || page !== 'overview') return
    const marker = document.querySelector(`.phone-map .plan-svg [data-id="${place.id}"]`),
      header = document.querySelector('.phone-top')
    if (!marker) return
    const top = innerHeight - sheetRef.current.offsetHeight - 60,
      ceiling = (header?.getBoundingClientRect().bottom || 56) + 12
    const r = marker.getBoundingClientRect()
    const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    if (r.bottom > top) scrollBy({ top: Math.max(r.bottom - top + 24, 0), behavior })
    else if (r.top < ceiling) scrollBy({ top: r.top - ceiling - 24, behavior })
    // Inside a zoomed map, leave room above the seat for its name tag.
    const map = marker.closest('.plan-viewport'),
      edge = map?.getBoundingClientRect().top
    if (map?.classList.contains('zoomed') && r.top - edge < 64)
      map.scrollBy({ top: r.top - edge - 80, behavior })
  }
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(keepVisible)
    return () => cancelAnimationFrame(id)
  }, [place?.id, open, sheetH])

  const status =
    online === 'shared' ? 'Connected' : online === 'offline' ? 'Offline · cached' : 'Connecting'
  return (
    <div className={'phone' + (open ? ' has-sheet' : '')} ref={root}>
      <header className="phone-top">
        <button className="brand-mini" onClick={() => nav('overview')}>
          <img src="./mark.svg" alt="" />
          <span>
            <b>OpenSeat</b>
            <small>SLC {floor.name}</small>
          </span>
        </button>
        <span className={'sync ' + online}>
          <i />
          {status}
        </span>
        <button className="icon-btn menu-btn" aria-label="Menu" onClick={openMenu}>
          <Menu size={22} />
        </button>
      </header>
      {demo && <DemoBanner onLive={() => onRoom(true)} />}
      <CheckInBanner
        checkIns={mine}
        now={now}
        busy={busyMine}
        onShow={(s) => {
          const show = () => pick(s.split('-')[0], s, { focus: true, heading: true, full: true })
          if (page !== 'overview') nav('overview', show)
          else show()
        }}
        onCheckOut={checkOutMine}
        onKeep={checkInAgain}
      />
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      <main className="phone-main">
        {page === 'sources' ? (
          <section className="phone-sources">
            <button className="back-btn" onClick={() => nav('overview')}>
              <ArrowLeft size={18} /> Back to the map
            </button>
            <h1>How the data works</h1>
            <p className="lead">
              Each seat shows the newest information from four sources, with how long ago it
              arrived. Old information stops counting, so a seat with nothing recent says “No
              recent info” rather than guessing.
              {demo &&
                ' In the demo nothing expires: seats change only when someone reports them, checks in or checks out.'}
            </p>
            <h2 className="sr-only">The four sources</h2>
            <SourceCards events={events} now={now} full />
            <Activity events={events} now={now} />
          </section>
        ) : (
          <>
            <section className="hero" aria-labelledby="hero-title">
              <FloorSelect onFloor={onFloor} />
              <p className="hero-kicker">
                {demo ? 'Example data · ' + floor.name : 'Right now on ' + floor.name}
              </p>
              {empty ? (
                <>
                  <h1 id="hero-title">No seat updates yet</h1>
                  <p className="hero-sub">
                    Be the first: tap a seat on the map and say whether it's free.
                  </p>
                </>
              ) : n.free === 0 ? (
                // Nobody has reported a free seat. That is not the same as a full floor.
                <>
                  <h1 id="hero-title">{n.unknown ? 'No free seats reported' : 'Every seat is taken'}</h1>
                  <p className="hero-sub">
                    {n.occupied} taken · {n.unknown} no recent info
                    {latest ? ' · updated ' + age(latest.at, now).toLowerCase() : ''}
                  </p>
                  {n.unknown > 0 && !choices && (
                    <p className="hero-hint">
                      Seats with no recent info may still be free. Seen one? Tap it on the map and
                      choose “It's free”.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <h1 id="hero-title">
                    <strong>{n.free}</strong> {n.free === 1 ? 'seat' : 'seats'} free
                  </h1>
                  <p className="hero-sub">
                    {n.occupied} taken · {n.unknown} no recent info
                    {latest ? ' · updated ' + age(latest.at, now).toLowerCase() : ''}
                  </p>
                </>
              )}
              {!empty && choices > 0 && (
                <Button className="wide big find" onClick={onFind}>
                  <Sparkles />
                  {findCount.at
                      ? 'Show another free spot (' + findCount.at + ' of ' + choices + ')'
                      : 'Find me a free seat'}
                </Button>
              )}
            </section>
            <div className="phone-controls">
              <div className="segmented" role="group" aria-label="View">
                <button aria-pressed={view === 'map'} onClick={() => setView('map')}>
                  <MapIcon size={17} /> Map
                </button>
                <button aria-pressed={view === 'list'} onClick={() => setView('list')}>
                  <List size={17} /> List
                </button>
              </div>
              <button
                className={'filter-pill ' + (filter === 'free' ? 'selected' : '')}
                aria-pressed={filter === 'free'}
                onClick={() => changeFilters(section, filter === 'free' ? 'all' : 'free')}
              >
                <span />
                Free only
              </button>
            </div>
            <div className="area-chips" role="group" aria-label="Area">
              {[
                ['all', 'Everywhere'],
                ['tables', 'Round tables'],
                ['individuals', 'Solo seats'],
              ]
                .filter(([key]) => key !== 'tables' || tables.length)
                .map(([key, text]) => (
                <button key={key} aria-pressed={section === key} onClick={() => changeFilters(key, filter)}>
                  {text}
                </button>
              ))}
            </div>
            {view === 'map' ? (
              <div className="phone-map">
                <FloorMap
                  {...{ model, section, filter, now, focus }}
                  selected={place?.id}
                  onSelect={(id) => pick(id)}
                  onPlaced={() => requestAnimationFrame(keepVisible)}
                  onShowList={() => setView('list')}
                />
                <p className="map-tip">Tap a seat to see it or report it. Pinch to zoom.</p>
                <Legend />
              </div>
            ) : (
              <div className="phone-list">
                <label className="list-search">
                  <Search size={17} />
                  <input
                    aria-label="Search seats"
                    placeholder="Search: table 5, seat 12"
                    value={query}
                    onChange={(e) => changeFilters(section, filter, e.target.value)}
                    onFocus={(e) => {
                      // Lift the box to the top so the keyboard does not hide the results.
                      const box = e.currentTarget.closest('.list-search')
                      setTimeout(() => box?.scrollIntoView({ block: 'start' }), 250)
                    }}
                    enterKeyHint="search"
                  />
                </label>
                <SeatList
                  locations={model.locations}
                  {...{ section, filter, query, now }}
                  selected={place?.id}
                  onPick={(id, s) => pick(id, s, { heading: true })}
                  onShowAll={() => changeFilters('all', 'all')}
                  hiddenBy={[filter === 'free' && 'Free only', section !== 'all' && (section === 'tables' ? 'Round tables' : 'Solo seats')].filter(Boolean)}
                  onReveal={(id, s) => {
                    changeFilters('all', 'all')
                    pick(id, s, { heading: true })
                  }}
                />
              </div>
            )}
            <SourcesPanel
              model={model}
              now={now}
              onScanner={() => setModal('scanner')}
              onMore={() => nav('sources')}
            />
          </>
        )}
        <footer className="phone-foot">
          SLC {floor.name} · {seats.length} open seats · {floor.notCounted} not counted
        </footer>
      </main>
      {open && (
        <div
          ref={sheetRef}
          className={'sheet sheet-' + sheet}
          role="region"
          aria-label={label(place.id) + ' details'}
        >
          <SeatDetails
            {...{ room, place, seat, model, now, record }}
            mode={sheet}
            focusKey={headingFocus}
            next={
              fromFind && choices > 1
                ? {
                    text:
                      'Not this one? Next free spot (' +
                      Math.min(findCount.at + 1, choices) +
                      ' of ' +
                      choices +
                      ')',
                    onNext: onFind,
                  }
                : null
            }
            canCheckIn={qrPlace === place.id}
            locator={view === 'list'}
            section={section}
            filter={filter}
            onSeat={setSeat}
            onExpand={() => setSheet('full')}
            onCollapse={() => setSheet('peek')}
            onClose={close}
            openQR={() => setModal('qr')}
          />
        </div>
      )}
      {menu && (
        <PhoneMenu
          demo={demo}
          onClose={closeMenu}
          onRoom={onRoom}
          onFloor={onFloor}
          onShare={() => setModal('share')}
          onSources={() => nav('sources')}
        />
      )}
    </div>
  )
}
