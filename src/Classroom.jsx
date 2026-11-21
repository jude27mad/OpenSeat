import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, Bluetooth, Check, Radio, UsersRound } from 'lucide-react'
import { applyTheme } from './theme.js'
import './style.css'
import './classroom.css'

const labels = {
  idle: 'Scanner offline',
  connecting: 'Connecting',
  waiting: 'Listening for scan',
  complete: 'Scan complete',
  error: 'Connection failed',
}

function CountDial({ scan, phase }) {
  const people = scan ? Math.ceil(scan.value * 5 / 11) : null
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (people === null || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(people ?? 0)
      return
    }
    const start = performance.now()
    let frame
    function tick(now) {
      const elapsed = Math.min(1, (now - start) / 850)
      setDisplay(Math.round(people * (1 - (1 - elapsed) ** 3)))
      if (elapsed < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [people])
  return (
    <div className={'count-dial ' + phase}>
      <svg viewBox="0 0 240 240" aria-hidden="true">
        <circle className="dial-ticks" cx="120" cy="120" r="116" pathLength="120" />
        <circle className="dial-track" cx="120" cy="120" r="104" />
        <circle className="dial-fill" cx="120" cy="120" r="104" pathLength="100" transform="rotate(-90 120 120)" />
      </svg>
      <div className="dial-center" aria-hidden="true">
        <UsersRound size={24} />
        <strong>{people === null ? '—' : display}</strong>
        <span>estimated people</span>
      </div>
      <span className="sr-only" role="status">{people === null ? 'No count yet' : people + ' estimated people'}</span>
    </div>
  )
}

const relay = 'https://openseat-classroom-relay.good-eft-3431.chatgpt.site'

function Classroom() {
  const [phase, setPhase] = useState('connecting')
  const [scan, setScan] = useState(null)
  useEffect(() => {
    let active = true
    let timer
    let controller
    let watching = false
    // Keep a server-side scan window open across a short app switch.
    async function holdWindow() {
      if (watching || !active) return
      watching = true
      try { await fetch(relay + '/watch', { credentials: 'omit', cache: 'no-store', keepalive: true }) }
      catch { /* The status poll will retry on the next connection. */ }
      finally { watching = false }
    }
    async function refresh() {
      clearTimeout(timer)
      controller?.abort()
      const attempt = new AbortController()
      controller = attempt
      const timeout = setTimeout(() => attempt.abort(), 16000)
      try {
        holdWindow()
        const response = await fetch(relay + '/status', {
          signal: attempt.signal, cache: 'no-store', credentials: 'omit',
        })
        if (!response.ok) throw Error('Relay unavailable')
        const data = await response.json()
        if (controller !== attempt || !active) return
        if (data.scan && Number.isSafeInteger(data.scan.measuredAt) &&
            Number.isInteger(data.scan.value) && data.scan.value >= 0) {
          setScan(previous => !previous || previous.measuredAt < data.scan.measuredAt ? data.scan : previous)
        }
        setPhase(data.listening ? 'waiting' : data.phase === 'starting' || data.phase === 'window ended' ? 'connecting' : 'error')
      } catch {
        if (active && controller === attempt) setPhase('error')
      } finally {
        clearTimeout(timeout)
        if (active && controller === attempt && !document.hidden) timer = setTimeout(refresh, 2500)
      }
    }
    function resume() { if (!document.hidden) refresh() }
    refresh()
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', resume)
    window.addEventListener('pageshow', resume)
    return () => {
      active = false
      clearTimeout(timer)
      controller?.abort()
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('online', resume)
      window.removeEventListener('pageshow', resume)
    }
  }, [])

  const complete = Boolean(scan)
  const displayPhase = complete ? 'complete' : phase
  const time = scan && new Date(scan.measuredAt)
  return (
    <main className="classroom-page">
      <header className="classroom-bar">
        <a href="../" className="classroom-brand"><img src="../mark.svg" alt="" />OpenSeat</a>
        <a href="../" className="classroom-back"><ArrowLeft size={16} /> Back to map</a>
      </header>
      <div className="classroom-body">
        <h1>Classroom count</h1>
        <p className="classroom-intro">Estimate how many people are here from one Bluetooth scan.</p>
        <div className="classroom-grid">
          <section className="count-panel" aria-label="Classroom estimate">
            <div className="count-panel-top"><span><Radio size={16} /> Bluetooth demo</span><span className={'phase-label ' + displayPhase}><i />{labels[displayPhase]}</span></div>
            <CountDial phase={displayPhase} scan={scan} />
            <dl className="count-stats">
              <div><dt>Nearby devices</dt><dd>{scan?.value ?? '—'}</dd></div>
              <div><dt>Scan time</dt><dd>{time ? <time dateTime={time.toISOString()}>{time.toLocaleTimeString([], {hour:'numeric', minute:'2-digit', second:'2-digit'})}</time> : '—'}</dd></div>
            </dl>
          </section>
          <section className="scanner-panel" aria-labelledby="scanner-heading">
            <span className="scanner-icon">{complete ? <Check /> : <Bluetooth />}</span>
            <h2 id="scanner-heading">{complete ? 'Latest classroom scan' : phase === 'waiting' ? 'Ready for your phone' : phase === 'error' ? 'Reconnecting' : 'Connecting to flespi'}</h2>
            <p role="status">{phase === 'waiting' ? <>Press <b>Master</b> in BLE2MQTT on your iPhone. The count updates here when the scan arrives.</> : phase === 'error' ? 'The scanner connection is unavailable. This display will retry automatically.' : 'Opening the classroom scanner connection…'}</p>
            <div className="estimate-note"><h3>How the estimate works</h3><p>Each device at −75 dBm or stronger counts once. We divide by 2.2 devices per person and round up. People carrying more or fewer devices can shift the estimate.</p></div>
          </section>
        </div>
      </div>
    </main>
  )
}

applyTheme()
createRoot(document.getElementById('root')).render(<Classroom />)
