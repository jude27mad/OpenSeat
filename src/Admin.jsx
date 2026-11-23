import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from './components/ui/button'
import { FLOORS, floorNumbers, chairs } from './floor.js'
import { setFloorStatus, watchAdmin } from './firebase.js'
import { chosenRoom, isLive, roomUrl } from './session.js'
import { applyTheme } from './theme.js'
import './style.css'
import './admin.css'

const actions = [
  { value: 'free', label: 'Mark all free', status: 'Free' },
  { value: 'unknown', label: 'Clear all statuses', status: 'No recent info' },
]

const approvalUrl = 'https://github.com/jude27mad/OpenSeat/actions/workflows/admin-device.yml'

function DeviceApproval({ uid }) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  async function copyId() {
    try {
      await navigator.clipboard.writeText(uid)
      setCopied(true)
      setCopyFailed(false)
    } catch {
      setCopyFailed(true)
    }
  }
  return (
    <>
      <p>Approve this browser with your GitHub owner account.</p>
      <label className="admin-device">Device ID
        <input value={uid} readOnly spellCheck={false} onFocus={(event) => event.target.select()} />
      </label>
      <div className="admin-actions">
        <Button variant="outline" onClick={copyId}>{copied ? 'Copied' : 'Copy device ID'}</Button>
        <Button asChild>
          <a href={approvalUrl} target="_blank" rel="noreferrer">Approve this browser on GitHub</a>
        </Button>
      </div>
      {copyFailed && <p role="status">Select and copy the device ID above.</p>}
      <p>On GitHub, choose <strong>Run workflow</strong>, paste the device ID, and run it. These controls unlock here once approved.</p>
    </>
  )
}

function FloorControls() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [room, setRoom] = useState(() => chosenRoom(false, false, 8))
  const live = isLive(room)
  const floor = FLOORS[room.floor]
  const count = [...floor.tables, ...floor.individuals].flatMap(chairs).length
  const target = floor.name + (live ? ' · live map' : ' · demo')
  const map = '../' + new URL(roomUrl(room)).hash

  function choose(nextLive, nextFloor) {
    setMessage('')
    setError('')
    setRoom(chosenRoom(nextLive, false, nextFloor))
  }
  async function apply(action) {
    const question = 'Set all ' + count + ' seats on ' + target + ' to “' + action.status + '”?'
    if (!window.confirm(question)) return
    setBusy(true)
    setError('')
    setMessage('Updating ' + target + '…')
    try {
      await setFloorStatus(room, action.value)
      setMessage(target + ' updated. All ' + count + ' seats set to “' + action.status + '”.')
    } catch (err) {
      setMessage('')
      setError(err.message || 'The update failed. Try again.')
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
          <select id="admin-floor" value={room.floor} disabled={busy} onChange={(e) => choose(live, Number(e.target.value))}>
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
      <a className="admin-map-link" href={map}>Open this {live ? 'live map' : 'demo'}</a>
    </>
  )
}

function Admin() {
  const [device, setDevice] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => watchAdmin((next) => {
    setDevice(next)
    setError('')
  }, (err) => {
    setDevice(null)
    setError(err.message || 'Could not check device approval. Reload to try again.')
  }), [])

  return (
    <main className="admin-page">
      <a className="brand" href="../"><img src="../mark.svg" alt="" />OpenSeat</a>
      <section className="admin-panel">
        <h1>Floor controls</h1>
        {!device?.uid && !error && <p role="status">Checking device approval…</p>}
        {device?.uid && !device.approved && <DeviceApproval uid={device.uid} />}
        {device?.approved && <FloorControls />}
        {error && <p role="alert" className="error">{error}</p>}
      </section>
    </main>
  )
}

applyTheme()
createRoot(document.getElementById('root')).render(<Admin />)
