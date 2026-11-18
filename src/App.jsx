import React, { useEffect, useRef, useState } from 'react'
import {
  Armchair,
  ArrowRight,
  Bluetooth,
  Building2,
  ChevronRight,
  Clock3,
  Layers,
  LayoutDashboard,
  List,
  Map as MapIcon,
  MapPin,
  Menu,
  PlugZap,
  Search,
  Share2,
  UsersRound,
  X,
} from 'lucide-react'
import { Card } from './components/ui/card'
import { Button } from './components/ui/button'
import { individuals, label, rooms, seats, tables } from './floor.js'
import { age, derive, fresh, parseSpot, suggestions } from './model.js'
import { chosenRoom, roomUrl, useFloor } from './session.js'
import { startScanner } from './ble.js'
import { activeCheckIn, friendly, myCheckIns, remember } from './checkin.js'
import FloorMap from './FloorMap.jsx'
import { FeedControls, QRDialog } from './Controls.jsx'
import SeatDetails from './SeatDetails.jsx'
import PhoneView from './Phone.jsx'
import {
  Activity,
  CheckInBanner,
  DemoBanner,
  Legend,
  SeatList,
  SourceCards,
} from './parts.jsx'

const navigation = [
  ['overview', 'Floor overview', LayoutDashboard],
  ['finder', 'Find a seat', Search],
  ['sources', 'Data sources', Layers],
]
const PHONE = '(max-width: 720px)',
  DRAWER = '(max-width: 950px)'
const hash = () => new URLSearchParams(location.hash.slice(1))
function initial() {
  return chosenRoom(hash().get('floor') === '8')
}
function setUrl(room, spot, checkin = false) {
  history.replaceState(history.state, '', roomUrl(room, spot, checkin))
}
function useMedia(query) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const list = matchMedia(query),
      update = () => setMatches(list.matches)
    list.addEventListener('change', update)
    update()
    return () => list.removeEventListener('change', update)
  }, [query])
  return matches
}
// The chair to show first: a free one, then one nobody has checked in to.
function firstChair(place, model, now) {
  return (
    place.ids.find((s) => model.states.get(s).status === 'free') ||
    place.ids.find((s) => !activeCheckIn(model.states.get(s), now)) ||
    place.ids[0]
  )
}
function Stat({ name, value, detail, icon: Icon, tone, percent }) {
  return (
    <Card className={'panel metric ' + tone}>
      <div className="metric-label">
        {name}
        <span className="metric-icon">
          <Icon size={15} />
        </span>
      </div>
      <strong>{value}</strong>
      <div className="metric-foot">{detail}</div>
      {percent !== undefined && (
        <div className="meter">
          <i style={{ width: percent + '%' }} />
        </div>
      )}
    </Card>
  )
}
function Dashboard({ room, onRoom, startSpot, qrPlace }) {
  const demo = room.id !== 'floor8'
  const phone = useMedia(PHONE),
    drawerMode = useMedia(DRAWER)
  const [page, setPage] = useState(() => history.state?.openseatPage || 'overview'),
    [view, setView] = useState('map'),
    [section, setSection] = useState('all'),
    [filter, setFilter] = useState('all'),
    [query, setQuery] = useState(''),
    [drawer, setDrawer] = useState(false),
    [modal, setModal] = useState(null),
    [now, setNow] = useState(Date.now),
    [bridge, setBridge] = useState('')
  const { events, online, record } = useFloor(room),
    model = derive(events, now)
  const [selected, setSelected] = useState(startSpot?.id || null),
    [seat, setSeat] = useState(() => {
      if (startSpot?.seat) return startSpot.seat
      return firstChair(model.locations.get(startSpot?.id || 'T01'), model, now)
    }),
    [sheet, setSheet] = useState(startSpot ? (qrPlace ? 'full' : 'peek') : 'closed'),
    [focus, setFocus] = useState(startSpot ? 1 : 0),
    [found, setFound] = useState(-1),
    [busyMine, setBusyMine] = useState(false),
    [mineNote, setMineNote] = useState('')
  // Desktop always shows a location in its side panel; the phone starts with none.
  const shownId = selected || (phone ? null : 'T01'),
    place = shownId ? model.locations.get(shownId) : null,
    shownSeat = place && seat?.split('-')[0] === place.id ? seat : place && firstChair(place, model, now)
  const bridgeStop = useRef(null),
    detail = useRef(null)
  const mine = myCheckIns(room, model, now)
  const choices = suggestions(model.locations, now, section)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 4000)
    return () => {
      clearInterval(t)
      bridgeStop.current?.()
    }
  }, [])
  // Back and forward move between pages instead of leaving the app.
  useEffect(() => {
    const onPop = () => setPage(history.state?.openseatPage || 'overview')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => {
    if (!mineNote) return
    const t = setTimeout(() => setMineNote(''), 5000)
    return () => clearTimeout(t)
  }, [mineNote])
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]')) return
      if (drawer) setDrawer(false)
      else if (phone && sheet !== 'closed') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  useEffect(() => setFound(-1), [section])

  function pick(id, specific = null, opts = {}) {
    const p = model.locations.get(id)
    setSelected(id)
    setSeat(specific || firstChair(p, model, now))
    setUrl(room, specific || id, qrPlace === id)
    if (phone) setSheet(qrPlace === id ? 'full' : 'peek')
    if (opts.focus) setFocus((f) => f + 1)
    if (!phone && opts.scroll && innerWidth <= 850) {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
      setTimeout(
        () =>
          detail.current?.scrollIntoView({
            behavior: reduce ? 'auto' : 'smooth',
            block: 'start',
          }),
        10,
      )
    }
  }
  function close() {
    setSheet('closed')
    setSelected(null)
    setUrl(room)
  }
  function nav(key) {
    setDrawer(false)
    if (key === 'finder') setFilter('free')
    else setFilter('all')
    if (key !== page) {
      if (phone && page === 'sources' && key === 'overview') history.back()
      else history.pushState({ ...history.state, openseatPage: key }, '', location.href)
      setPage(key)
    }
    window.scrollTo({ top: 0 })
  }
  function onFind() {
    if (!choices.length) return
    const next = (found + 1) % choices.length
    setFound(next)
    setView('map')
    pick(choices[next].id, null, { focus: true })
  }
  async function checkOutMine(target) {
    setBusyMine(true)
    try {
      await record({ source: 'qr', target, value: 'free' })
      remember(room, target, null)
      setMineNote('Checked out of ' + label(target) + '. Thanks for freeing it up.')
    } catch (e) {
      setMineNote(friendly(e))
    } finally {
      setBusyMine(false)
    }
  }
  async function onBridge(options) {
    bridgeStop.current?.()
    bridgeStop.current = await startScanner(options, record, setBridge)
    setBridge('Connecting to the scanner…')
  }
  const dialogs = (
    <>
      {(modal === 'share' || modal === 'qr') && (
        <QRDialog
          room={room}
          place={modal === 'qr' ? place : null}
          onClose={() => setModal(null)}
        />
      )}
      {(modal === 'ble' || modal === 'sensor') && (
        <FeedControls
          demo={demo}
          place={place || model.locations.get('T01')}
          record={record}
          started={modal}
          onClose={() => setModal(null)}
          onBridge={onBridge}
          bridge={bridge}
        />
      )}
      {mineNote && (
        <p className="floating-note" role="status">
          {mineNote}
        </p>
      )}
    </>
  )

  if (phone)
    return (
      <>
        <PhoneView
          {...{
            room,
            demo,
            model,
            events,
            now,
            online,
            onRoom,
            place,
            seat: shownSeat,
            setSeat: (id) => {
              setSeat(id)
              setUrl(room, id, qrPlace === place?.id)
            },
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
            choices: choices.length,
            close,
          }}
        />
        {dialogs}
      </>
    )

  const zone = section === 'individuals' ? 'individuals' : 'tables',
    ble = model.ble[zone],
    n = model.counts
  return (
    <div className="app-shell">
      {drawer && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside
        id="openseat-nav"
        className={'sidebar ' + (drawer ? 'open' : '')}
        inert={drawerMode && !drawer}
      >
        <div className="sidebar-top">
          <button className="brand" onClick={() => nav('overview')}>
            <img src="./mark.svg" alt="" />
            <span>OpenSeat</span>
          </button>
          {drawerMode && (
            <button
              className="icon-btn"
              aria-label="Close navigation"
              onClick={() => setDrawer(false)}
            >
              <X size={20} />
            </button>
          )}
        </div>
        <div className="campus">
          <div>
            <Building2 size={18} />
          </div>
          <span>
            <b>TMU Campus</b>
            <small>Toronto Metropolitan</small>
          </span>
        </div>
        <span className="nav-heading">Workspace</span>
        <nav aria-label="Workspace">
          {navigation.map(([key, text, Icon]) => (
            <button
              key={key}
              aria-current={page === key ? 'page' : undefined}
              onClick={() => nav(key)}
            >
              <Icon size={17} />
              {text}
            </button>
          ))}
        </nav>
        <span className="nav-heading floor-heading">Floors</span>
        <button
          className="floor-link"
          onClick={() => {
            nav('overview')
            setSection('all')
          }}
        >
          <span>8</span>SLC Floor 8
        </button>
        <div className="brand-bottom">
          <span>
            <Armchair size={15} />
          </span>
          <div>
            <b>OpenSeat</b>
            <small>
              <a href="./evidence/">Prototype evidence</a>
            </small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="only-mobile icon-btn"
            aria-label="Open navigation"
            aria-expanded={drawer}
            aria-controls="openseat-nav"
            onClick={() => setDrawer(true)}
          >
            <Menu size={20} />
          </button>
          <span className="crumb-home">
            <Building2 size={15} /> Campus
          </span>
          <ChevronRight className="crumb-sep" size={13} />
          <span className="crumb-building">Student Learning Centre</span>
          <ChevronRight size={13} />
          <b>Floor 8</b>
          <span className={'sync ' + online}>
            <i />
            {online === 'shared'
              ? 'Connected'
              : online === 'offline'
                ? 'Offline · cached'
                : 'Connecting'}
          </span>
        </header>
        {demo && <DemoBanner onLive={() => onRoom(true)} />}
        <CheckInBanner
          checkIns={mine}
          now={now}
          busy={busyMine}
          onShow={(s) => {
            nav('overview')
            pick(s.split('-')[0], s)
          }}
          onCheckOut={checkOutMine}
        />
        <main>
          <div className="page-lead">
            <div>
              <div className="floor-eyebrow">
                <span /> STUDENT LEARNING CENTRE
              </div>
              <h1>
                {page === 'overview'
                  ? 'Floor overview'
                  : page === 'finder'
                    ? 'Find a seat'
                    : 'Data sources'}
              </h1>
              <p>
                {page === 'overview'
                  ? 'Floor 8 · The Sky'
                  : page === 'finder'
                    ? 'Places with a recent free report come first.'
                    : 'The four inputs behind the Floor 8 map.'}
              </p>
            </div>
            <div className="lead-actions">
              <select
                aria-label="Floor data mode"
                className="mode-select"
                value={demo ? 'demo' : 'live'}
                onChange={(e) => onRoom(e.target.value === 'live')}
              >
                <option value="demo">Demo data</option>
                <option value="live">Live floor</option>
              </select>
              <Button onClick={() => setModal('share')}>
                <Share2 size={15} />
                Share map
              </Button>
            </div>
          </div>
          {page === 'overview' && (
            <div className="metrics">
              <Stat
                name="Free seats"
                value={n.free}
                detail={`of ${seats.length} open seats`}
                icon={Armchair}
                tone="green"
                percent={(n.free * 100) / seats.length}
              />
              <Stat
                name="Taken seats"
                value={n.occupied}
                detail="Checked in or reported taken"
                icon={UsersRound}
                tone="orange"
                percent={(n.occupied * 100) / seats.length}
              />
              <Stat
                name="No recent info"
                value={n.unknown + n.mixed}
                detail={
                  n.mixed
                    ? n.mixed + ' with mixed reports'
                    : 'Waiting for a check-in or report'
                }
                icon={Clock3}
                tone="stone"
                percent={((n.unknown + n.mixed) * 100) / seats.length}
              />
              <Stat
                name="Nearby devices"
                value={fresh(ble, now) ? ble.value : '—'}
                detail={
                  (zone === 'tables' ? 'Round-table area' : 'Individual-seat area') +
                  ' · ' +
                  (ble ? age(ble.at, now) : 'No scan')
                }
                icon={Bluetooth}
                tone="blue"
              />
            </div>
          )}
          {page !== 'sources' && (
            <div className="plan-grid">
              <Card className="panel floor-panel">
                <div className="panel-heading">
                  <div>
                    <h2>{page === 'finder' ? 'Seat finder' : 'Floor plan'}</h2>
                    <p>
                      {page === 'finder'
                        ? 'Select a place to see its chairs and report them.'
                        : `${tables.length} round tables · ${individuals.length} individual seats`}
                    </p>
                  </div>
                  {page !== 'finder' && (
                    <div className="map-tabs">
                      <button
                        onClick={() => setView('map')}
                        aria-pressed={view === 'map'}
                        aria-label="Map view"
                      >
                        <MapIcon size={15} />
                        <span>Map</span>
                      </button>
                      <button
                        onClick={() => setView('list')}
                        aria-pressed={view === 'list'}
                        aria-label="List view"
                      >
                        <List size={15} />
                        <span>List</span>
                      </button>
                    </div>
                  )}
                </div>
                <div className="plan-toolbar">
                  <select
                    aria-label="Map area"
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                  >
                    <option value="all">All areas</option>
                    <option value="tables">Round tables</option>
                    <option value="individuals">Individual seats</option>
                  </select>
                  <button
                    className={'filter-pill ' + (filter === 'free' ? 'selected' : '')}
                    aria-pressed={filter === 'free'}
                    onClick={() => setFilter(filter === 'free' ? 'all' : 'free')}
                  >
                    <span />
                    Free only
                  </button>
                </div>
                {page === 'finder' || view === 'list' ? (
                  <>
                    <label className="list-search">
                      <Search size={15} />
                      <input
                        aria-label="Search seats"
                        placeholder="Search: table 5, seat 12"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <SeatList
                      locations={model.locations}
                      {...{ section, filter, query, now }}
                      selected={shownId}
                      onPick={(id, s) => pick(id, s, { scroll: true })}
                      onShowAll={() => {
                        setFilter('all')
                        setSection('all')
                      }}
                    />
                  </>
                ) : (
                  <FloorMap
                    {...{ model, section, filter, now, focus }}
                    selected={shownId}
                    onSelect={(id) => pick(id, null, { scroll: true })}
                  />
                )}
                <Legend />
              </Card>
              <div ref={detail} className="inspector-wrap">
                <SeatDetails
                  key={shownSeat}
                  {...{ room, place, model, now, record }}
                  seat={shownSeat}
                  canCheckIn={qrPlace === shownId}
                  onSeat={(id) => {
                    setSelected(place.id)
                    setSeat(id)
                    setUrl(room, id, qrPlace === place.id)
                  }}
                  openQR={() => setModal('qr')}
                />
              </div>
            </div>
          )}
          {page !== 'finder' && (
            <section className="sources-section">
              <div className="section-heading">
                <div>
                  <h2>{page === 'sources' ? 'Connected sources' : 'Data sources'}</h2>
                  {page === 'sources' && (
                    <p>Each reading carries its own place, source and time.</p>
                  )}
                </div>
                {page === 'overview' ? (
                  <button className="text-btn" onClick={() => nav('sources')}>
                    View sources <ArrowRight size={14} />
                  </button>
                ) : (
                  <Button variant="outline" onClick={() => setModal('sensor')}>
                    <PlugZap />
                    Device inputs
                  </Button>
                )}
              </div>
              <SourceCards
                events={events}
                now={now}
                full={page === 'sources'}
                onDevices={setModal}
              />
            </section>
          )}
          {page === 'sources' && <Activity events={events} now={now} />}
          <footer>
            <span>
              <MapPin size={13} /> SLC Floor 8
            </span>
            <span>
              {seats.length} open seats · {rooms.length} bookable rooms not counted
            </span>
            {demo && <button onClick={() => onRoom(false, true)}>Restart demo</button>}
          </footer>
        </main>
      </div>
      {dialogs}
    </div>
  )
}
function readEntry() {
  const spot = parseSpot(hash().get('spot'))
  return {
    room: initial(),
    spot,
    qrPlace: hash().get('checkin') === '1' ? spot?.id : null,
  }
}
export default function App() {
  const [entry, setEntry] = useState(readEntry)
  useEffect(() => {
    const onHash = () => setEntry(readEntry())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  function changeRoom(live, newSession = false) {
    const next = chosenRoom(live, newSession)
    setUrl(next)
    setEntry({ room: next, spot: null, qrPlace: null })
  }
  return (
    <Dashboard
      key={[entry.room.id, entry.spot?.seat || entry.spot?.id, entry.qrPlace].join('/')}
      room={entry.room}
      startSpot={entry.spot}
      qrPlace={entry.qrPlace}
      onRoom={changeRoom}
    />
  )
}
