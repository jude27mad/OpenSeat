import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, Bluetooth, Check, Radio, RotateCcw, UsersRound } from 'lucide-react'
import { startScanner } from './ble.js'
import { applyTheme } from './theme.js'
import { Button } from './components/ui/button'
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

function Classroom() {
  const [token, setToken] = useState('')
  const [topic, setTopic] = useState('ble/data/cen100-iphone-01')
  const [phase, setPhase] = useState('idle')
  const [message, setMessage] = useState('')
  const [scan, setScan] = useState(null)
  const active = useRef(null)
  function stop() {
    const attempt = active.current
    active.current = null
    attempt?.disconnect?.()
  }
  useEffect(() => {
    function leave() {
      stop()
      setPhase('idle')
      setScan(null)
      setMessage('')
      setToken('')
    }
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('pagehide', leave)
      stop()
    }
  }, [])

  async function listen(event) {
    event?.preventDefault()
    stop()
    const attempt = {}
    active.current = attempt
    setScan(null)
    setMessage('')
    setPhase('connecting')
    function feedback(text, state) {
      if (active.current !== attempt) return
      setMessage(text)
      if (state) setPhase(state)
      if (state === 'error') stop()
    }
    try {
      const disconnect = await startScanner({ token, topic }, (reading) => {
        if (active.current !== attempt) return
        setScan({ value: reading.value, measuredAt: reading.measuredAt })
        setPhase('complete')
        setMessage('')
        stop()
      }, feedback)
      if (active.current === attempt) attempt.disconnect = disconnect
      else disconnect()
    } catch (error) {
      feedback(error.message, 'error')
    }
  }

  const setup = phase === 'idle' || phase === 'error'
  const complete = phase === 'complete'
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
            <div className="count-panel-top"><span><Radio size={16} /> Bluetooth demo</span><span className={'phase-label ' + phase}><i />{labels[phase]}</span></div>
            <CountDial phase={phase} scan={scan} />
            <dl className="count-stats">
              <div><dt>Nearby devices</dt><dd>{scan?.value ?? '—'}</dd></div>
              <div><dt>Scan time</dt><dd>{time ? <time dateTime={time.toISOString()}>{time.toLocaleTimeString([], {hour:'numeric', minute:'2-digit', second:'2-digit'})}</time> : '—'}</dd></div>
            </dl>
          </section>
          <section className="scanner-panel" aria-labelledby="scanner-heading">
            <span className="scanner-icon">{complete ? <Check /> : <Bluetooth />}</span>
            <h2 id="scanner-heading">{setup ? 'Connect your scanner' : complete ? 'Count ready' : 'Waiting for your phone'}</h2>
            {setup ? <form onSubmit={listen}>
              <label className="field-label">flespi read token
                <input required type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
              </label>
              <label className="field-label">Scanner MQTT topic
                <input required value={topic} autoCapitalize="none" spellCheck={false} onChange={(e) => setTopic(e.target.value)} />
              </label>
              <Button type="submit" disabled={!token.trim() || !topic.trim()}><Radio /> Connect scanner</Button>
            </form> : complete ? <>
              <p>Your estimate will stay on screen until you take another scan.</p>
              <Button onClick={listen}><RotateCcw /> Take another scan</Button>
            </> : <>
              <p>{phase === 'waiting' ? <>Press <b>Master</b> in BLE2MQTT on your iPhone to send a scan.</> : 'Opening the connection to flespi…'}</p>
              <Button variant="outline" onClick={() => { stop(); setPhase('idle'); setMessage('') }}>Cancel</Button>
            </>}
            <p role="status" className="scan-feedback">{message}</p>
            <div className="estimate-note"><h3>How the estimate works</h3><p>Each device at −75 dBm or stronger counts once. We divide by 2.2 devices per person and round up. People carrying more or fewer devices can shift the estimate.</p></div>
          </section>
        </div>
      </div>
    </main>
  )
}

applyTheme()
createRoot(document.getElementById('root')).render(<Classroom />)
