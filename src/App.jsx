import React, { useEffect, useRef, useState } from 'react'
import {
  Armchair,
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
  Search,
  Share2,
  UsersRound,
  X,
} from 'lucide-react'
import { Card } from './components/ui/card'
import { Button } from './components/ui/button'
import { FLOORS, floor, floorNumbers, individuals, label, seats, setFloor, tables } from './floor.js'
import { age, derive, fresh, matchesQuery, parseSpot, placeDescription, suggestions } from './model.js'
import { chosenRoom, isLive, roomUrl, serverNow, useFloor } from './session.js'
import { startScanner } from './ble.js'
import { activeCheckIn, friendly, myCheckIns, remember, uncertain } from './checkin.js'
import { themeChoices, useTheme } from './theme.js'
import FloorMap, { isDim } from './FloorMap.jsx'
import { ScannerControls, QRDialog } from './Controls.jsx'
import SeatDetails from './SeatDetails.jsx'
import PhoneView from './Phone.jsx'
import {
  Activity,
  CheckInBanner,
  DemoBanner,
  Legend,
  SeatList,
  SourceCards,
  SourcesPanel,
} from './parts.jsx'

const navigation = [
  ['overview', 'Floor overview', LayoutDashboard],
  ['finder', 'Find a seat', Search],
  ['sources', 'Data sources', Layers],
]
// Phones held sideways are short rather than narrow, so they keep the phone layout.
const PHONE = '(max-width: 720px), (max-height: 520px) and (pointer: coarse)',
  DRAWER = '(max-width: 950px)'
const hash = () => new URLSearchParams(location.hash.slice(1))
// #floor=8 or #floor=5 opens a live floor; a demo link may name its floor with level=.
function initial() {
  const live = Number(hash().get('floor'))
  if (FLOORS[live]) return chosenRoom(true, false, live)
  const level = Number(hash().get('level'))
  return chosenRoom(false, false, FLOORS[level] ? level : 8)
}
// Closing a sheet or the menu steps back in history; the page should stay put.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
// Every history entry OpenSeat writes is marked, so Back and Forward between
// them restore the screen instead of reloading the floor.
function push(patch, url = location.href) {
  history.pushState({ ...history.state, openseat: true, ...patch }, '', url)
}
function replace(patch, url = location.href) {
  history.replaceState({ ...history.state, openseat: true, ...patch }, '', url)
}
function setUrl(room, spot, checkin = false) {
  replace({}, roomUrl(room, spot, checkin))
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
function Dashboard({ room, onRoom, onFloor, startSpot, qrPlace }) {
  const demo = !isLive(room)
  const [theme, setTheme] = useTheme()
  const phone = useMedia(PHONE),
    drawerMode = useMedia(DRAWER)
  const [page, setPage] = useState(() => history.state?.openseatPage || 'overview'),
    [view, setView] = useState('map'),
    [section, setSection] = useState('all'),
    [filter, setFilter] = useState('all'),
    [query, setQuery] = useState(''),
    [drawer, setDrawer] = useState(false),
    [modal, setModal] = useState(null),
    [now, setNow] = useState(serverNow),
    [bridge, setBridge] = useState('')
  const { events, online, record } = useFloor(room),
    model = derive(events, now)
  const [selected, setSelected] = useState(startSpot?.id || null),
    // The chair the student picked. Until they pick one, the best chair is
    // worked out again from the latest data on every update.
    [seat, setSeat] = useState(startSpot?.seat || null),
    [sheet, setSheet] = useState(startSpot ? (qrPlace ? 'full' : 'peek') : 'closed'),
    [focus, setFocus] = useState(startSpot ? 1 : 0),
    [headingFocus, setHeadingFocus] = useState(startSpot ? 1 : 0),
    [seen, setSeen] = useState([]),
    [findId, setFindId] = useState(null),
    [menu, setMenu] = useState(!!history.state?.openseatMenu),
    [announce, setAnnounce] = useState(''),
    [busyMine, setBusyMine] = useState(false),
    [mineNote, setMineNote] = useState(null)
  const listing = page === 'finder' || view === 'list'
  const defaultPlace = !phone && !selected
    ? [...model.locations.values()].find((p) => !isDim(p, section, filter) && (!listing || matchesQuery(p, query)))
    : null
  const place = selected ? model.locations.get(selected) : defaultPlace,
    shownId = place?.id,
    shownSeat = place && seat?.split('-')[0] === place.id ? seat : place && firstChair(place, model, now)
  const bridgeStop = useRef(null),
    detail = useRef(null),
    afterPop = useRef(null),
    opener = useRef(null),
    live = useRef({})
  live.current = { phone, selected }
  const mine = myCheckIns(room, model, now)
  const choices = suggestions(model.locations, now, section)
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 4000)
    return () => {
      clearInterval(t)
      bridgeStop.current?.()
    }
  }, [])
  // On a phone, the seat sheet, the menu and List view each get a history
  // entry, so the Back button closes them before it leaves OpenSeat.
  useEffect(() => {
    if (phone && startSpot && !history.state?.openseatSheet) {
      replace({ openseatSheet: undefined }, roomUrl(room))
      push({ openseatSheet: startSpot.id }, roomUrl(room, startSpot.seat || startSpot.id, !!qrPlace))
    } else replace({})
  }, [])
  useEffect(() => {
    function onPop() {
      const s = history.state || {}
      setPage(s.openseatPage || 'overview')
      if (!live.current.phone) setFilter(s.openseatPage === 'finder' ? 'free' : 'all')
      else {
        setMenu(!!s.openseatMenu)
        setView(s.openseatView || 'map')
        if (!s.openseatSheet) {
          setSheet('closed')
          setSelected(null)
          const back = opener.current
          opener.current = null
          if (back?.isConnected) requestAnimationFrame(() => back.focus({ preventScroll: true }))
        } else if (s.openseatSheet !== live.current.selected) {
          setSelected(s.openseatSheet)
          setSeat(null)
          setSheet('peek')
        }
      }
      const then = afterPop.current
      afterPop.current = null
      then?.()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => {
    if (!mineNote) return
    const t = setTimeout(() => setMineNote(null), mineNote.undo ? 8000 : 5000)
    return () => clearTimeout(t)
  }, [mineNote])
  useEffect(() => {
    // Runs before dialogs handle the key, so Escape closes only the top layer.
    function onKey(e) {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"], .sheet .confirm'))
        return
      if (drawer) setDrawer(false)
      else if (phone && sheet !== 'closed') close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  useEffect(() => setSeen([]), [section])

  function pick(id, specific = null, opts = {}) {
    const p = model.locations.get(id)
    setSelected(id)
    setSeat(specific || null)
    if (!opts.fromFind) setFindId(null)
    const url = roomUrl(room, specific || id, qrPlace === id)
    if (phone) {
      if (sheet === 'closed' || !history.state?.openseatSheet) {
        opener.current = document.activeElement
        push({ openseatSheet: id }, url)
      } else replace({ openseatSheet: id }, url)
      setSheet(opts.full || qrPlace === id ? 'full' : 'peek')
    } else replace({}, url)
    if (opts.focus) setFocus((f) => f + 1)
    if (opts.heading) setHeadingFocus((f) => f + 1)
    if (phone)
      setAnnounce(
        label(id) + ': ' + placeDescription(p) + '. Details are at the bottom of the screen.',
      )
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
    if (phone && history.state?.openseatSheet) return history.back()
    setSheet('closed')
    setSelected(null)
    setFindId(null)
    setUrl(room)
  }
  function changeFilters(nextSection, nextFilter, nextQuery = query) {
    setSection(nextSection)
    setFilter(nextFilter)
    setQuery(nextQuery)
    if (selected && (isDim(place, nextSection, nextFilter) || (listing && !matchesQuery(place, nextQuery)))) {
      close()
    }
  }
  // `then` runs once the page has changed, after any history step settles.
  function nav(key, then) {
    setDrawer(false)
    if (phone) setFilter(key === 'finder' ? 'free' : 'all')
    else changeFilters(section, key === 'finder' ? 'free' : 'all')
    if (key !== page) {
      if (phone && page === 'sources' && history.state?.openseatPage === 'sources') {
        afterPop.current = then || null
        history.back()
        setPage(key)
        return
      } else if (phone) {
        push({ openseatPage: key, openseatSheet: undefined, openseatMenu: undefined })
        setSheet('closed')
      } else push({ openseatPage: key })
      setPage(key)
    }
    window.scrollTo({ top: 0 })
    then?.()
  }
  function openMenu() {
    push({ openseatMenu: true })
    setMenu(true)
  }
  // Close the menu first (through history when it has an entry), then act.
  function closeMenu(then) {
    if (history.state?.openseatMenu) {
      afterPop.current = then || null
      history.back()
    } else {
      setMenu(false)
      then?.()
    }
  }
  function changeView(next) {
    if (next === view) return
    if (!phone) return setView(next)
    if (next === 'list') {
      if (history.state?.openseatSheet) replace({ openseatView: 'list' })
      else push({ openseatView: 'list' })
      setView('list')
    } else if (history.state?.openseatView === 'list' && !history.state?.openseatSheet) history.back()
    else {
      replace({ openseatView: 'map' })
      setView('map')
    }
  }
  // Each press shows a free spot not shown yet, best first, then starts over.
  function onFind() {
    if (!choices.length) return
    const ids = choices.map((c) => c.id)
    let shown = seen.filter((id) => ids.includes(id))
    let next = ids.find((id) => !shown.includes(id) && id !== selected)
    if (!next) {
      shown = []
      next = ids.find((id) => id !== selected) || ids[0]
    }
    setSeen([...shown, next])
    setFindId(next)
    pick(next, null, { focus: true, heading: true, fromFind: true })
  }
  const findCount = { at: seen.length, of: choices.length }
  async function checkInAgain(target, undo = false) {
    const previous = mine.find((entry) => entry.seat === target)?.event.id ?? null
    const id = crypto.randomUUID()
    remember(room, target, id, previous)
    setBusyMine(true)
    try {
      await record({ source: 'qr', target, value: 'occupied', id })
      remember(room, target, id)
      setMineNote({
        text: undo
          ? "You're checked in at " + label(target) + ' again.'
          : 'You have ' + label(target) + ' for another 60 minutes.',
      })
    } catch (e) {
      if (!uncertain(e)) remember(room, target, previous)
      setMineNote({ text: friendly(e) })
    } finally {
      setBusyMine(false)
    }
  }
  async function checkOutMine(target) {
    setBusyMine(true)
    try {
      await record({ source: 'qr', target, value: 'free' })
      remember(room, target, null)
      setMineNote({
        text: 'Checked out of ' + label(target) + '. Thanks for freeing it up.',
        undo: target,
      })
    } catch (e) {
      setMineNote({ text: friendly(e) })
    } finally {
      setBusyMine(false)
    }
  }
  async function onBridge(options) {
    bridgeStop.current?.()
    bridgeStop.current = await startScanner(options, record, (text) => setBridge(text))
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
      {modal === 'scanner' && (
        <ScannerControls
          demo={demo}
          onClose={() => setModal(null)}
          onBridge={onBridge}
          bridge={bridge}
        />
      )}
      <div className="floating-note-region" role="status" aria-live="polite">
        {mineNote && (
          <p className="floating-note">
            <span>{mineNote.text}</span>
            {mineNote.undo && (
              <button
                className="toast-undo"
                onClick={() => {
                  const target = mineNote.undo
                  setMineNote(null)
                  checkInAgain(target, true)
                }}
              >
                Undo
              </button>
            )}
          </p>
        )}
      </div>
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
            onFloor,
            place,
            seat: shownSeat,
            setSeat: (id) => {
              setSeat(id)
              replace({}, roomUrl(room, id, qrPlace === place?.id))
            },
            pick,
            qrPlace,
            record,
            sheet,
            setSheet,
            focus,
            view,
            setView: changeView,
            filter,
            changeFilters,
            section,
            query,
            page,
            nav,
            setModal,
            mine,
            checkOutMine,
            busyMine,
            onFind,
            findCount,
            fromFind: !!findId && findId === selected,
            choices: choices.length,
            close,
            menu,
            openMenu,
            closeMenu,
            announce,
            headingFocus,
            checkInAgain,
          }}
        />
        {dialogs}
      </>
    )

  const zone = section === 'individuals' || !tables.length ? 'individuals' : 'tables',
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
          <a href="./classroom/"><Bluetooth size={17} /> Classroom demo</a>
        </nav>
        <span className="nav-heading floor-heading">Floors</span>
        <select
          className="floor-select"
          aria-label="Floor"
          value={floor.number}
          onChange={(e) => onFloor(Number(e.target.value))}
        >
          {floorNumbers.map((number) => (
            <option key={number} value={number}>
              {FLOORS[number].title}
            </option>
          ))}
        </select>
        <span className="nav-heading floor-heading">Appearance</span>
        <select
          className="floor-select theme-select"
          aria-label="Appearance"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        >
          {themeChoices.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
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
          <b>{floor.name}</b>
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
          onKeep={checkInAgain}
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
                  ? floor.title
                  : page === 'finder'
                    ? 'Places with a recent free report come first.'
                    : 'The four inputs behind the ' + floor.name + ' map.'}
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
                detail={
                  n.free === 0 && n.unknown
                    ? `None reported yet · ${n.unknown} with no recent info`
                    : `of ${seats.length} open seats`
                }
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
                        : (tables.length ? tables.length + ' round tables · ' : '') +
                          individuals.length +
                          ' individual seats'}
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
                    onChange={(e) => changeFilters(e.target.value, filter)}
                  >
                    <option value="all">All areas</option>
                    {tables.length > 0 && <option value="tables">Round tables</option>}
                    <option value="individuals">Individual seats</option>
                  </select>
                  <button
                    className={'filter-pill ' + (filter === 'free' ? 'selected' : '')}
                    aria-pressed={filter === 'free'}
                    onClick={() => changeFilters(section, filter === 'free' ? 'all' : 'free')}
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
                        onChange={(e) => changeFilters(section, filter, e.target.value)}
                      />
                    </label>
                    <SeatList
                      locations={model.locations}
                      {...{ section, filter, query, now }}
                      selected={shownId}
                      onPick={(id, s) => pick(id, s, { scroll: true })}
                      onShowAll={() => changeFilters('all', 'all')}
                    />
                  </>
                ) : (
                  <FloorMap
                    {...{ model, section, filter, now, focus }}
                    selected={shownId}
                    onSelect={(id) => pick(id, null, { scroll: true })}
                    onShowList={() => setView('list')}
                  />
                )}
                <Legend />
                {page === 'overview' && (
                  <SourcesPanel
                    model={model}
                    now={now}
                    onScanner={() => setModal('scanner')}
                    onMore={() => nav('sources')}
                  />
                )}
              </Card>
              <div ref={detail} className="inspector-wrap">
                {place && <SeatDetails
                  {...{ room, place, model, now, record }}
                  seat={shownSeat}
                  canCheckIn={qrPlace === shownId}
                  onSeat={(id) => {
                    setSelected(place.id)
                    setSeat(id)
                    setUrl(room, id, qrPlace === place.id)
                  }}
                  openQR={() => setModal('qr')}
                />}
              </div>
            </div>
          )}
          {page === 'sources' && (
            <section className="sources-section">
              <div className="section-heading">
                <div>
                  <h2>{page === 'sources' ? 'Connected sources' : 'Data sources'}</h2>
                  {page === 'sources' && (
                    <p>Each reading carries its own place, source and time.</p>
                  )}
                </div>
              </div>
              <SourceCards events={events} now={now} full />
            </section>
          )}
          {page === 'sources' && <Activity events={events} now={now} />}
          <footer>
            <span>
              <MapPin size={13} /> SLC {floor.name}
            </span>
            <span>
              {seats.length} open seats · {floor.notCounted} not counted
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
  const room = initial()
  // The floor decides which seat names exist, so set it before reading the spot.
  setFloor(room.floor)
  const spot = parseSpot(hash().get('spot'))
  return {
    room,
    spot,
    qrPlace: hash().get('checkin') === '1' ? spot?.id : null,
  }
}
export default function App() {
  const [entry, setEntry] = useState(readEntry),
    current = useRef(entry)
  current.current = entry
  useEffect(() => {
    // Back and Forward within OpenSeat are handled by the dashboard. A new
    // link (a QR scan in this tab) or a different floor starts afresh.
    const onNav = () => {
      const next = readEntry()
      if (next.room.id !== current.current.room.id || !history.state?.openseat) setEntry(next)
    }
    window.addEventListener('hashchange', onNav)
    window.addEventListener('popstate', onNav)
    return () => {
      window.removeEventListener('hashchange', onNav)
      window.removeEventListener('popstate', onNav)
    }
  }, [])
  // Switching floors is a step of its own, so Back returns to the last floor.
  function changeRoom(live, newSession = false, number = entry.room.floor) {
    const next = chosenRoom(live, newSession, number)
    setFloor(number)
    history.pushState({ openseat: true }, '', roomUrl(next))
    setEntry({ room: next, spot: null, qrPlace: null })
  }
  // Another floor, keeping live or demo as it is.
  const changeFloor = (number) =>
    number !== entry.room.floor && changeRoom(isLive(entry.room), false, number)
  setFloor(entry.room.floor)
  return (
    <Dashboard
      key={[entry.room.id, entry.room.floor, entry.spot?.seat || entry.spot?.id, entry.qrPlace].join('/')}
      room={entry.room}
      startSpot={entry.spot}
      qrPlace={entry.qrPlace}
      onRoom={changeRoom}
      onFloor={changeFloor}
    />
  )
}
