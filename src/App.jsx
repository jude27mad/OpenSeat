import React, { useEffect, useRef, useState } from 'react'
import {
  Armchair,
  Bluetooth,
  Building2,
  ChevronRight,
  Clock3,
  LayoutDashboard,
  List,
  LockKeyhole,
  Map as MapIcon,
  MapPin,
  Menu,
  Search,
  Share2,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react'
import { Card } from './components/ui/card'
import { Button } from './components/ui/button'
import { FLOORS, floor, floorNumbers, individuals, label, seats, setFloor, tables } from './floor.js'
import { age, derive, fresh, matchesQuery, parseSpot, placeDescription, suggestions } from './model.js'
import { chosenRoom, isLive, roomUrl, serverNow, useFloor } from './session.js'
import { startScanner } from './ble.js'
import { themeChoices, useTheme } from './theme.js'
import FloorMap, { isDim } from './FloorMap.jsx'
import { ScannerControls, QRDialog } from './Controls.jsx'
import SeatDetails from './SeatDetails.jsx'
import PhoneView from './Phone.jsx'
import OtherFloorOffer from './OtherFloorOffer.jsx'
import { DemoBanner, Legend, SeatList, SourcesPanel } from './parts.jsx'

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
function setUrl(room, spot) {
  replace({}, roomUrl(room, spot))
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
function Dashboard({ room, onRoom, onFloor, startSpot }) {
  const demo = !isLive(room)
  const [theme, setTheme] = useTheme()
  const phone = useMedia(PHONE),
    drawerMode = useMedia(DRAWER)
  const [view, setView] = useState('map'),
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
    // A seat's link or QR code opens its details in full, with the report buttons.
    [sheet, setSheet] = useState(startSpot ? 'full' : 'closed'),
    [focus, setFocus] = useState(startSpot ? 1 : 0),
    [headingFocus, setHeadingFocus] = useState(startSpot ? 1 : 0),
    [seen, setSeen] = useState([]),
    [findId, setFindId] = useState(null),
    [menu, setMenu] = useState(!!history.state?.openseatMenu),
    [announce, setAnnounce] = useState('')
  const listing = view === 'list'
  const defaultPlace = !phone && !selected
    ? [...model.locations.values()].find((p) => !isDim(p, section, filter) && (!listing || matchesQuery(p, query)))
    : null
  const place = selected ? model.locations.get(selected) : defaultPlace,
    shownId = place?.id,
    shownSeat = place && (seat?.split('-')[0] === place.id ? seat : place.latestFree?.target || place.ids[0])
  const bridgeStop = useRef(null),
    detail = useRef(null),
    afterPop = useRef(null),
    opener = useRef(null),
    live = useRef({})
  live.current = { phone, selected }
  const choices = suggestions(model.locations, now, section)
  const choiceIds = new Set(choices.map((place) => place.id))
  const seenChoices = seen.filter((id) => choiceIds.has(id))
  const showingSuggestion = !!findId && findId === selected
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
      push({ openseatSheet: startSpot.id }, roomUrl(room, startSpot.seat || startSpot.id))
    } else replace({})
  }, [])
  useEffect(() => {
    function onPop() {
      const s = history.state || {}
      if (!live.current.phone) setFilter('all')
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
    // Runs before dialogs handle the key, so Escape closes only the top layer.
    function onKey(e) {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]'))
        return
      if (drawer) setDrawer(false)
      else if (phone && sheet !== 'closed') close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  useEffect(() => setSeen([]), [section])
  useEffect(() => {
    if (!phone && showingSuggestion) {
      detail.current?.scrollIntoView({ block: 'start' })
    }
  }, [headingFocus, showingSuggestion, phone])

  function pick(id, specific = null, opts = {}) {
    const p = model.locations.get(id)
    setSelected(id)
    setSeat(specific || null)
    if (!opts.fromFind) setFindId(null)
    const url = roomUrl(room, specific || id)
    if (phone) {
      if (sheet === 'closed' || !history.state?.openseatSheet) {
        opener.current = document.activeElement
        push({ openseatSheet: id }, url)
      } else replace({ openseatSheet: id }, url)
      setSheet(opts.full ? 'full' : 'peek')
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
  function showOverview() {
    setDrawer(false)
    if (phone) setFilter('all')
    else changeFilters(section, 'all')
    window.scrollTo({ top: 0 })
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
    const ids = [...choiceIds]
    let shown = seenChoices
    let next = ids.find((id) => !shown.includes(id) && id !== selected)
    if (!next) {
      shown = []
      next = ids.find((id) => id !== selected) || ids[0]
    }
    setSeen([...shown, next])
    setFindId(next)
    if (!phone) setView('map')
    pick(next, null, { focus: true, heading: true, fromFind: true })
  }
  const findClass = phone ? 'wide big find' : 'desktop-find'
  const findButton = choices.length > 0 ? (
    <Button className={findClass} onClick={onFind}>
      <Sparkles />
      {seenChoices.length
        ? `Show another free spot (${seenChoices.length} of ${choices.length})`
        : 'Find me a free seat'}
    </Button>
  ) : model.counts.free === 0 && online === 'shared' && (
    <OtherFloorOffer room={room} now={now} className={findClass} />
  )
  const nextSuggestion = showingSuggestion && choices.length > 1
    ? {
        text: `Not this one? Next free spot (${seenChoices.length % choices.length + 1} of ${choices.length})`,
        onNext: onFind,
      }
    : null
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
              replace({}, roomUrl(room, id))
            },
            pick,
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
            showOverview,
            setModal,
            findButton,
            nextSuggestion,
            showingSuggestion,
            choices: choices.length,
            close,
            menu,
            openMenu,
            closeMenu,
            announce,
            headingFocus,
          }}
        />
        {dialogs}
      </>
    )

  const latestScan = Object.values(model.ble).filter(Boolean).sort((a, b) => b.at - a.at)[0]
  const n = model.counts
  const areaFilters = (
    <>
      {tables.length > 0 && (
      <select
        aria-label="Map area"
        value={section}
        onChange={(e) => changeFilters(e.target.value, filter)}
      >
        <option value="all">All areas</option>
          <option value="tables">Round tables</option>
        <option value="individuals">Individual seats</option>
      </select>
      )}
      <button
        className={'filter-pill ' + (filter === 'free' ? 'selected' : '')}
        aria-pressed={filter === 'free'}
        onClick={() => changeFilters(section, filter === 'free' ? 'all' : 'free')}
      >
        <span />
        Free only
      </button>
    </>
  )
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
          <button className="brand" onClick={showOverview}>
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
            <b>Sheldon &amp; Tracy Levy Student Learning Centre</b>
            <small>Toronto Metropolitan University</small>
          </span>
        </div>
        <span className="nav-heading">Workspace</span>
        <nav aria-label="Workspace">
          <button aria-current="page" onClick={showOverview}>
            <LayoutDashboard size={17} />
            Floor overview
          </button>
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
        <nav aria-label="Administration">
          <a href="./admin/"><LockKeyhole size={17} /> Admin</a>
        </nav>
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
        <main>
          <div className="page-lead">
            <div>
              <div className="floor-eyebrow">
                <span /> STUDENT LEARNING CENTRE
              </div>
              <h1>Floor overview</h1>
              <p>{floor.title}</p>
              {findButton}
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
              detail="Reported or sensed taken"
              icon={UsersRound}
              tone="orange"
              percent={(n.occupied * 100) / seats.length}
            />
            <Stat
              name="No recent info"
              value={n.unknown}
              detail="Waiting for a report"
              icon={Clock3}
              tone="stone"
              percent={(n.unknown * 100) / seats.length}
            />
            <Stat
              name="Nearby devices"
              value={fresh(latestScan, now) ? latestScan.value : '—'}
              detail={latestScan ? 'Last scan · ' + age(latestScan.at, now) : 'No scan'}
              icon={Bluetooth}
              tone="blue"
            />
          </div>
          <div className="plan-grid">
            <Card className="panel floor-panel">
              <div className="panel-heading">
                <div>
                  <h2>Floor plan</h2>
                  <p>
                    {(tables.length ? tables.length + ' round tables · ' : '') + individuals.length + ' individual seats'}
                  </p>
                </div>
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
              </div>
              {listing ? (
                <>
                  <div className="plan-toolbar">{areaFilters}</div>
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
                  desktopFilters={areaFilters}
                  {...{ model, section, filter, now, focus }}
                  selected={shownId}
                  onSelect={(id) => pick(id, null, { scroll: true })}
                  onShowList={() => setView('list')}
                />
              )}
              <Legend />
              <SourcesPanel model={model} now={now} />
            </Card>
            <div ref={detail} className="inspector-wrap">
              {place && <SeatDetails
                {...{ room, place, model, now, record }}
                seat={shownSeat}
                isRecommendation={showingSuggestion}
                focusKey={showingSuggestion ? headingFocus : 0}
                next={nextSuggestion}
                onSeat={(id) => {
                  setSelected(place.id)
                  setSeat(id)
                  setUrl(room, id)
                }}
                openQR={() => setModal('qr')}
              />}
            </div>
          </div>
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
  // QR codes printed earlier also carry checkin=1. It is no longer used, so it is ignored.
  return { room, spot: parseSpot(hash().get('spot')) }
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
    setEntry({ room: next, spot: null })
  }
  // Another floor, keeping live or demo as it is.
  const changeFloor = (number) =>
    number !== entry.room.floor && changeRoom(isLive(entry.room), false, number)
  setFloor(entry.room.floor)
  return (
    <Dashboard
      key={[entry.room.id, entry.room.floor, entry.spot?.seat || entry.spot?.id].join('/')}
      room={entry.room}
      startSpot={entry.spot}
      onRoom={changeRoom}
      onFloor={changeFloor}
    />
  )
}
