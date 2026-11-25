import React, { useEffect, useState } from 'react'
import { renderSite } from './SiteAccess.jsx'
import { Button } from './components/ui/button'
import { FLOORS, floorNumbers, chairs } from './floor.js'
import { lockAdmin, setAllLiveFloorStatus, setFloorStatus, setSiteClosed, unlockAdmin, watchAdmin } from './firebase.js'
import { chosenRoom, isLive, roomUrl } from './session.js'
import { applyTheme } from './theme.js'
import './style.css'
import './admin.css'

const actions = [
  { value: 'free', label: 'Mark all free', status: 'Free' },
  { value: 'occupied', label: 'Mark all taken', status: 'Taken' },
  { value: 'unknown', label: 'Clear all statuses', status: 'No recent info' },
]

function PinForm() {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await unlockAdmin(pin)
      setPin('')
    } catch (err) {
      setError(err.message || 'Could not unlock floor controls. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="admin-pin" onSubmit={submit}>
      <label htmlFor="admin-pin">Admin PIN</label>
      <input id="admin-pin" name="pin" type="password" inputMode="numeric" autoComplete="current-password"
        pattern="[0-9]{6}" maxLength={6} required
        value={pin} onChange={(event) => setPin(event.target.value)} disabled={busy} />
      {error && <p role="alert" className="error">{error}</p>}
      <Button type="submit" disabled={busy}>{busy ? 'Unlocking…' : 'Unlock'}</Button>
    </form>
  )
}

function FloorControls({ siteClosed }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [room, setRoom] = useState(() => chosenRoom(false, false, 8))
  const [allFloors, setAllFloors] = useState(false)
  const live = isLive(room)
  const numbers = allFloors ? floorNumbers : [room.floor]
  const count = numbers.flatMap((n) => [...FLOORS[n].tables, ...FLOORS[n].individuals]).flatMap(chairs).length
  const target = allFloors ? 'live Floors 5, 7 and 8' : FLOORS[room.floor].name + (live ? ' · live map' : ' · demo')
  const map = '../' + new URL(roomUrl(room)).hash

  function choose(nextLive, nextFloor) {
    setMessage('')
    setError('')
    setAllFloors(nextLive && nextFloor === 'all')
    if (nextFloor !== 'all') setRoom(chosenRoom(nextLive, false, Number(nextFloor)))
  }
  async function apply(action) {
    const question = 'Set all ' + count + ' seats on ' + target + ' to “' + action.status + '”?'
    if (!window.confirm(question)) return
    setBusy(true)
    setError('')
    setMessage('Updating ' + target + '…')
    try {
      if (allFloors) await setAllLiveFloorStatus(action.value)
      else await setFloorStatus(room, action.value)
      setMessage(target + ' updated. All ' + count + ' seats set to “' + action.status + '”.')
    } catch (err) {
      setMessage('')
      setError(err.message || 'The update failed. Try again.')
    } finally {
      setBusy(false)
    }
  }
  async function changeSiteAccess() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await setSiteClosed(!siteClosed)
    } catch (err) {
      setError(err.message || 'Could not change website access. Try again.')
    } finally {
      setBusy(false)
    }
  }
  async function lock() {
    setBusy(true)
    setError('')
    try {
      await lockAdmin()
    } catch (err) {
      setError(err.message || 'Could not lock this browser. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="admin-target">
        <div>
          <label htmlFor="admin-map">Map</label>
          <select id="admin-map" value={live ? 'live' : 'demo'} disabled={busy} onChange={(e) => choose(e.target.value === 'live', room.floor)}>
            <option value="demo">Your current demo</option>
            <option value="live">Shared live map</option>
          </select>
        </div>
        <div>
          <label htmlFor="admin-floor">Floor</label>
          <select id="admin-floor" value={allFloors ? 'all' : room.floor} disabled={busy} onChange={(e) => choose(live, e.target.value)}>
            {live && <option value="all">All three floors</option>}
            {floorNumbers.map((n) => <option key={n} value={n}>{FLOORS[n].title}</option>)}
          </select>
        </div>
      </div>
      <div className="admin-actions">
        {actions.map((action) => (
          <Button key={action.value} variant={action.value === 'free' ? 'default' : 'outline'}
            disabled={busy} onClick={() => apply(action)}>{action.label}</Button>
        ))}
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status" className="feedback">{message}</p>}
      <section className="admin-site-access" aria-labelledby="site-access-heading">
        <h2 id="site-access-heading">Website access</h2>
        <p>{siteClosed ? 'Only this browser can open OpenSeat.' : 'Everyone can open OpenSeat.'}</p>
        <Button variant={siteClosed ? 'default' : 'outline'} disabled={busy} onClick={changeSiteAccess}>
          {siteClosed ? 'Turn on OpenSeat' : 'Turn off OpenSeat'}
        </Button>
      </section>
      <div className="admin-footer">
        <a className="admin-map-link" href={map}>{allFloors ? 'Open live map' : live ? 'Open this live map' : 'Open this demo'}</a>
        <Button variant="outline" onClick={lock} disabled={busy}>Lock this browser</Button>
      </div>
    </>
  )
}

function Admin({ siteClosed }) {
  const [device, setDevice] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => watchAdmin((next) => {
    setDevice(next)
    setError('')
  }, (err) => {
    setDevice(null)
    setError(err.message || 'Could not load floor controls. Reload to try again.')
  }), [])

  return (
    <main className="admin-page">
      <a className="brand" href="../"><img src="../mark.svg?v=cutout-2" alt="" />OpenSeat</a>
      <section className="admin-panel">
        <h1>Floor controls</h1>
        {!device?.uid && !error && <p role="status">Loading floor controls…</p>}
        {device?.uid && !device.approved && <PinForm />}
        {device?.approved && <FloorControls siteClosed={siteClosed} />}
        {error && <p role="alert" className="error">{error}</p>}
      </section>
    </main>
  )
}

applyTheme()
renderSite(Admin)
