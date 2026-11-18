import React, { useEffect, useRef, useState } from 'react'
import {
  Activity,
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
  MessageSquare,
  PlugZap,
  QrCode,
  Radio,
  Search,
  Share2,
  UsersRound,
} from 'lucide-react'
import { Card } from './components/ui/card'
import { Button } from './components/ui/button'
import { byId, chairs, label } from './floor.js'
import {
  age,
  derive,
  fresh,
  parseSpot,
  placeDescription,
  sources,
} from './model.js'
import { chosenRoom, roomUrl, useFloor } from './session.js'
import { startScanner } from './ble.js'
import FloorMap from './FloorMap.jsx'
import { FeedControls, QRDialog } from './Controls.jsx'
import SeatDetails, { Origin, Status } from './SeatDetails.jsx'

const navigation = [
  ['overview', 'Floor overview', LayoutDashboard],
  ['finder', 'Find a seat', Search],
  ['sources', 'Data sources', Layers],
]
const sourceIcons = {
  ble: Bluetooth,
  qr: QrCode,
  report: MessageSquare,
  sensor: Radio,
}
const sourceText = {
  ble: 'Nearby devices in a section',
  qr: 'Seat check-ins and check-outs',
  report: 'Availability reported at a seat',
  sensor: 'Occupancy observed at a table',
}
const names = {
  free: 'Available',
  occupied: 'Occupied',
  unknown: 'Unknown',
  mixed: 'Conflicting',
  inuse: 'In use',
  sensorfree: 'Sensor free',
}
const plural = (count, noun) => count + ' ' + noun + (count === 1 ? '' : 's')
const hash = () => new URLSearchParams(location.hash.slice(1))
function initial() {
  return chosenRoom(hash().get('floor') === '8')
}
function setUrl(room, spot, checkin = false) {
  history.replaceState(null, '', roomUrl(room, spot, checkin))
}
function Legend() {
  return (
    <div className="legend">
      {['free', 'occupied', 'unknown', 'mixed'].map((s) => (
        <span key={s}>
          <i className={s} />
          {names[s]}
        </span>
      ))}
      <span>
        <i className="booked" />
        Bookable room
      </span>
    </div>
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
function SourceCards({ events, now, onDevices, full }) {
  return (
    <div className={'source-cards ' + (full ? 'full' : '')}>
      {['ble', 'qr', 'report', 'sensor'].map((s) => {
        const Icon = sourceIcons[s],
          rows = events
            .filter((e) => e.source === s)
            .sort((a, b) => b.at - a.at),
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
                    (fresh(latest, now) ? '' : ' · Stale')
                  : 'Awaiting first reading'}
              </div>
            </div>
            {full && (s === 'ble' || s === 'sensor') && (
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
function SeatList({
  locations,
  section,
  filter,
  query,
  onPick,
  now,
  selected,
}) {
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, ''),
    seatId = parseSpot(query.trim())
  const rows = [...locations.values()].filter(
    (p) =>
      (section === 'all' || section === p.section) &&
      (filter !== 'free' || p.tally.free > 0) &&
      (!q ||
        p.id.toLowerCase().includes(q) ||
        label(p.id).toLowerCase().replace(/\s/g, '').includes(q) ||
        seatId?.id === p.id),
  )
  if (filter === 'free')
    rows.sort((a, b) => b.tally.free - a.tally.free || a.id.localeCompare(b.id))
  return (
    <div className="seat-list" aria-label="Floor locations">
      {rows.length ? (
        <>
          <p className="list-total">{plural(rows.length, 'location')}</p>
          {rows.map((p) => (
            <button
              key={p.id}
              className={'list-location ' + (selected === p.id ? 'picked' : '')}
              onClick={() =>
                onPick(p.id, seatId?.id === p.id ? seatId.seat : null)
              }
            >
              <span className={'list-icon ' + p.status}>
                <Armchair size={17} />
              </span>
              <span>
                <b>{label(p.id)}</b>
                <small>
                  {placeDescription(p)} · <Origin event={p.latest} now={now} />
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
        </>
      ) : (
        <div className="empty">
          <Search size={24} />
          <h3>No matching locations</h3>
          <p>Try another ID or switch to all seats.</p>
        </div>
      )}
    </div>
  )
}
function Dashboard({ room, onRoom, startSpot, qrPlace }) {
  const demo = room.id !== 'floor8'
  const [page, setPage] = useState('overview'),
    [view, setView] = useState('map'),
    [section, setSection] = useState('all'),
    [filter, setFilter] = useState('all'),
    [query, setQuery] = useState(''),
    [drawer, setDrawer] = useState(false),
    [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(startSpot?.id || 'T01'),
    [seat, setSeat] = useState(
      startSpot?.seat || chairs(byId.get(startSpot?.id || 'T01'))[0],
    ),
    [now, setNow] = useState(Date.now),
    [bridge, setBridge] = useState('')
  const { events, online, record } = useFloor(room),
    model = derive(events, now),
    place = model.locations.get(selected),
    bridgeStop = useRef(null),
    detail = useRef(null)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 4000)
    return () => {
      clearInterval(t)
      bridgeStop.current?.()
    }
  }, [])
  function pick(id, specific = null, scroll = false) {
    const p = model.locations.get(id)
    setSelected(id)
    setSeat(
      specific ||
        p.ids.find((s) => model.states.get(s).status === 'free') ||
        p.ids[0],
    )
    setUrl(room, specific || id, qrPlace === id)
    if (scroll && innerWidth <= 850)
      setTimeout(
        () =>
          detail.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          }),
        10,
      )
  }
  function nav(key) {
    setPage(key)
    setDrawer(false)
    if (key === 'finder') setFilter('free')
    else setFilter('all')
    window.scrollTo({ top: 0 })
  }
  async function onBridge(options) {
    bridgeStop.current?.()
    bridgeStop.current = await startScanner(options, record, setBridge)
    setBridge('Connecting to the scanner…')
  }
  const zone = section === 'individuals' ? 'individuals' : 'tables',
    ble = model.ble[zone],
    n = model.counts
  const rows = [...events].sort((a, b) => b.at - a.at)
  return (
    <div className="app-shell">
      {drawer && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside className={'sidebar ' + (drawer ? 'open' : '')}>
        <button className="brand" onClick={() => nav('overview')}>
          <img src="./mark.svg" alt="" />
          <span>OpenSeat</span>
        </button>
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
            <small>CEN100 prototype</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="only-mobile icon-btn"
            aria-label="Open navigation"
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
                    ? 'Choose a spot with a recent availability update.'
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
                name="Available seats"
                value={n.free}
                detail={'of 250 open-access seats'}
                icon={Armchair}
                tone="green"
                percent={n.free / 2.5}
              />
              <Stat
                name="Occupied seats"
                value={n.occupied}
                detail="Current seat observations"
                icon={UsersRound}
                tone="orange"
                percent={n.occupied / 2.5}
              />
              <Stat
                name="Unconfirmed seats"
                value={n.unknown + n.mixed}
                detail={
                  n.mixed
                    ? n.mixed + ' with conflicting sources'
                    : 'Awaiting a current reading'
                }
                icon={Clock3}
                tone="stone"
                percent={(n.unknown + n.mixed) / 2.5}
              />
              <Stat
                name="Nearby devices"
                value={fresh(ble, now) ? ble.value : '—'}
                detail={
                  (zone === 'tables' ? 'Table area' : 'Individual area') +
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
                        ? 'Select a location to see its chairs and evidence.'
                        : '40 round tables · 90 individual seats'}
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
                    className={
                      'filter-pill ' + (filter === 'free' ? 'selected' : '')
                    }
                    aria-pressed={filter === 'free'}
                    onClick={() =>
                      setFilter(filter === 'free' ? 'all' : 'free')
                    }
                  >
                    <span />
                    Available only
                  </button>
                </div>
                {page === 'finder' || view === 'list' ? (
                  <>
                    <label className="list-search">
                      <Search size={15} />
                      <input
                        aria-label="Search seats"
                        placeholder="Search table or seat ID"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <SeatList
                      locations={model.locations}
                      {...{ section, filter, query, now, selected }}
                      onPick={(id, s) => pick(id, s, true)}
                    />
                  </>
                ) : (
                  <FloorMap
                    {...{ model, selected, section, filter, now }}
                    onSelect={(id) => pick(id, null, true)}
                  />
                )}
                <Legend />
              </Card>
              <div ref={detail} className="inspector-wrap">
                <SeatDetails
                  key={seat}
                  {...{ room, place, seat, model, now, record }}
                  canCheckIn={qrPlace === selected}
                  onSeat={(id) => {
                    setSeat(id)
                    setUrl(room, id, qrPlace === selected)
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
                  <h2>
                    {page === 'sources' ? 'Connected sources' : 'Data sources'}
                  </h2>
                  {page === 'sources' && (
                    <p>
                      Each observation carries its own location, source and
                      measurement time.
                    </p>
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
          {page === 'sources' && (
            <Card className="panel activity">
              <div className="panel-heading">
                <div>
                  <h2>Latest observations</h2>
                  <p>Most recent reading per source and location.</p>
                </div>
                <Activity size={19} />
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
                            : 'Occupied'}
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
          )}
          <footer>
            <span>
              <MapPin size={13} /> SLC Floor 8
            </span>
            <span>250 open-access seats · 20 bookable rooms excluded</span>
            {demo && (
              <button onClick={() => onRoom(false, true)}>Restart demo</button>
            )}
          </footer>
        </main>
      </div>
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
          place={place}
          record={record}
          started={modal}
          onClose={() => setModal(null)}
          onBridge={onBridge}
          bridge={bridge}
        />
      )}
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
      key={[
        entry.room.id,
        entry.spot?.seat || entry.spot?.id,
        entry.qrPlace,
      ].join('/')}
      room={entry.room}
      startSpot={entry.spot}
      qrPlace={entry.qrPlace}
      onRoom={changeRoom}
    />
  )
}
