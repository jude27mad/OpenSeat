import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  ArrowLeft,
  ExternalLink,
  Info,
  List,
  Map as MapIcon,
  Menu,
  PlugZap,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  X,
} from 'lucide-react'
import { Button } from './components/ui/button'
import { label, seats } from './floor.js'
import { age, fresh } from './model.js'
import FloorMap from './FloorMap.jsx'
import SeatDetails from './SeatDetails.jsx'
import {
  Activity,
  CheckInBanner,
  DemoBanner,
  Legend,
  SeatList,
  SourceCards,
  plural,
} from './parts.jsx'

function PhoneMenu({ demo, onClose, onRoom, onShare, onSources }) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content menu-sheet">
          <div className="dialog-head">
            <Dialog.Title>Menu</Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-btn" aria-label="Close menu">
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Switch between the live floor and the demo, share the map or learn how it works.
          </Dialog.Description>
          <div className="menu-label">Which floor data?</div>
          <div className="segmented" role="group" aria-label="Floor data">
            <button aria-pressed={!demo} onClick={() => (onClose(), onRoom(true))}>
              Live floor
            </button>
            <button aria-pressed={demo} onClick={() => (onClose(), onRoom(false))}>
              Demo
            </button>
          </div>
          <nav className="menu-list" aria-label="More">
            <button onClick={() => (onClose(), onShare())}>
              <Share2 size={18} /> Share this map
            </button>
            <button onClick={() => (onClose(), onSources())}>
              <Info size={18} /> How the data works
            </button>
            {demo && (
              <button onClick={() => (onClose(), onRoom(false, true))}>
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
    setFilter,
    section,
    setSection,
    query,
    setQuery,
    page,
    nav,
    setModal,
    mine,
    checkOutMine,
    busyMine,
    onFind,
    found,
    choices,
    close,
  } = p
  const [menu, setMenu] = useState(false)
  const sheetRef = useRef(null),
    root = useRef(null)
  const n = model.counts
  const latest = events.reduce(
    (best, e) => (fresh(e, now) && e.source !== 'ble' && (!best || e.at > best.at) ? e : best),
    null,
  )
  const empty = n.unknown === seats.length
  // Leave room under the page for the sheet so nothing hides behind it.
  useLayoutEffect(() => {
    const el = sheetRef.current
    if (!el) return root.current?.style.setProperty('--sheet-h', '0px')
    const update = () =>
      root.current?.style.setProperty('--sheet-h', el.getBoundingClientRect().height + 'px')
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [sheet, place?.id])
  // Keep the chosen seat on screen above the sheet.
  useEffect(() => {
    if (!place || sheet === 'closed' || view !== 'map' || page !== 'overview') return
    const id = requestAnimationFrame(() => {
      const marker = document.querySelector(`.plan-svg [data-id="${place.id}"]`),
        top = sheetRef.current?.getBoundingClientRect().top
      if (!marker || !top) return
      const r = marker.getBoundingClientRect()
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
      if (r.bottom > top - 16)
        scrollBy({ top: r.bottom - top + 56, behavior: reduce ? 'auto' : 'smooth' })
      else if (r.top < 70) scrollBy({ top: r.top - 90, behavior: reduce ? 'auto' : 'smooth' })
    })
    return () => cancelAnimationFrame(id)
  }, [place?.id, sheet, focus])

  const status =
    online === 'shared' ? 'Connected' : online === 'offline' ? 'Offline · cached' : 'Connecting'
  return (
    <div className={'phone' + (place && sheet !== 'closed' ? ' has-sheet' : '')} ref={root}>
      <header className="phone-top">
        <button className="brand-mini" onClick={() => nav('overview')}>
          <img src="./mark.svg" alt="" />
          <span>
            <b>OpenSeat</b>
            <small>SLC Floor 8</small>
          </span>
        </button>
        <span className={'sync ' + online}>
          <i />
          {status}
        </span>
        <button className="icon-btn menu-btn" aria-label="Menu" onClick={() => setMenu(true)}>
          <Menu size={22} />
        </button>
      </header>
      {demo && <DemoBanner onLive={() => onRoom(true)} />}
      <CheckInBanner
        checkIns={mine}
        now={now}
        busy={busyMine}
        onShow={(s) => pick(s.split('-')[0], s, { focus: true })}
        onCheckOut={checkOutMine}
      />
      <main className="phone-main">
        {page === 'sources' ? (
          <section className="phone-sources">
            <button className="back-btn" onClick={() => history.back()}>
              <ArrowLeft size={18} /> Back to the map
            </button>
            <h1>How the data works</h1>
            <p className="lead">
              Each seat shows the newest information from four sources, with how long ago it
              arrived. Old information stops counting, so a seat with nothing recent says “No
              recent info” rather than guessing.
            </p>
            <SourceCards events={events} now={now} full onDevices={(s) => setModal(s)} />
            <Button variant="outline" className="wide big" onClick={() => setModal('sensor')}>
              <PlugZap />
              Device inputs
            </Button>
            <Activity events={events} now={now} />
          </section>
        ) : (
          <>
            <section className="hero" aria-labelledby="hero-title">
              <p className="hero-kicker">{demo ? 'Example data · Floor 8' : 'Right now on Floor 8'}</p>
              {empty ? (
                <>
                  <h1 id="hero-title">No seat updates yet</h1>
                  <p className="hero-sub">
                    Be the first: tap a seat on the map and say whether it's free.
                  </p>
                </>
              ) : (
                <>
                  <h1 id="hero-title">
                    <strong>{n.free}</strong> {n.free === 1 ? 'seat' : 'seats'} free
                  </h1>
                  <p className="hero-sub">
                    {n.occupied} taken · {n.unknown + n.mixed} no recent info
                    {latest ? ' · updated ' + age(latest.at, now).toLowerCase() : ''}
                  </p>
                </>
              )}
              {!empty && (
                <Button className="wide big find" disabled={!choices} onClick={onFind}>
                  <Sparkles />
                  {!choices
                    ? 'No free seats reported'
                    : found >= 0
                      ? 'Show another free spot (' + (found + 1) + ' of ' + choices + ')'
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
                onClick={() => setFilter(filter === 'free' ? 'all' : 'free')}
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
              ].map(([key, text]) => (
                <button key={key} aria-pressed={section === key} onClick={() => setSection(key)}>
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
                />
                <p className="map-tip">Tap a seat to see it or report it. Pinch or use + to zoom.</p>
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
                    onChange={(e) => setQuery(e.target.value)}
                    enterKeyHint="search"
                  />
                </label>
                <SeatList
                  locations={model.locations}
                  {...{ section, filter, query, now }}
                  selected={place?.id}
                  onPick={(id, s) => pick(id, s)}
                  onShowAll={() => {
                    setFilter('all')
                    setSection('all')
                  }}
                />
              </div>
            )}
          </>
        )}
        <footer className="phone-foot">
          SLC Floor 8 · {seats.length} open seats · {plural(20, 'bookable room')} not counted
        </footer>
      </main>
      {place && sheet !== 'closed' && (
        <div
          ref={sheetRef}
          className={'sheet sheet-' + sheet}
          role="region"
          aria-label={label(place.id) + ' details'}
        >
          <SeatDetails
            key={seat}
            {...{ room, place, seat, model, now, record }}
            mode={sheet}
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
          onClose={() => setMenu(false)}
          onRoom={onRoom}
          onShare={() => setModal('share')}
          onSources={() => nav('sources')}
        />
      )}
    </div>
  )
}
