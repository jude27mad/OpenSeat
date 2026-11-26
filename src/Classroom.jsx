import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { renderSite } from './SiteAccess.jsx'
import { ArrowLeft, Bluetooth, Check, Radio, RotateCcw, UsersRound } from 'lucide-react'
import { Button } from './components/ui/button'
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

// People carry 1 to 2.2 detected devices each, so one count can't tell which.
// Show the range: fewest if everyone carries 2.2 devices, most if everyone carries one.
const peopleRange = (devices) => ({ low: Math.ceil(devices * 5 / 11), high: devices })
const rangeText = ({ low, high }, dash = '–') => (low === high ? String(low) : low + dash + high)

function CountDial({ scan, phase }) {
  const range = scan ? peopleRange(scan.value) : null
  const [display, setDisplay] = useState({ low: 0, high: 0 })
  useEffect(() => {
    if (!range || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(range ?? { low: 0, high: 0 })
      return
    }
    const start = performance.now()
    let frame
    function tick(now) {
      const elapsed = Math.min(1, (now - start) / 850),
        eased = 1 - (1 - elapsed) ** 3
      setDisplay({ low: Math.round(range.low * eased), high: Math.round(range.high * eased) })
      if (elapsed < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [range?.low, range?.high])
  const unit = range?.high === 1 ? 'estimated person' : 'estimated people'
  const count = range ? rangeText(display) : '—'
  // The icon, count and label are drawn on the ring's own 240-unit grid, so they
  // grow and shrink with the circle and stay inside it on any screen.
  // A longer range gets smaller digits, sized for the final count so they hold still while it counts up.
  // An old, longer count can still be on show for a moment, so that is allowed for too.
  const size = Math.min(72, 240 / Math.max(count.length, range ? rangeText(range).length : 1))
  const digitHeight = size * .727 // an Inter digit
  // From the top: a 20-unit icon, a 12-unit gap, the digits, then the label's baseline 25 units below theirs.
  // The stack is centred in the ring, 2.5 units high to balance the label's descenders.
  const top = 117.5 - (digitHeight + 57) / 2
  const baseline = top + 32 + digitHeight
  // A browser can enlarge small text by itself, as Safari does with a minimum font size.
  // Squeeze a line that has outgrown the ring back to a width that fits:
  // 160 units for the count and 146 for the label clear the ring at their heights.
  const drawing = useRef(null)
  function fit() {
    for (const line of drawing.current?.querySelectorAll('text') ?? []) {
      const widest = line.classList.contains('dial-label') ? 146 : 160
      line.removeAttribute('textLength')
      if (line.getBBox().width > widest) line.setAttribute('textLength', widest)
    }
  }
  useLayoutEffect(fit)
  useEffect(() => {
    const resized = new ResizeObserver(fit)
    resized.observe(drawing.current)
    document.fonts.ready.then(fit)
    return () => resized.disconnect()
  }, [])
  return (
    <div className={'count-dial ' + phase}>
      <svg ref={drawing} viewBox="0 0 240 240" aria-hidden="true">
        <circle className="dial-ticks" cx="120" cy="120" r="116" pathLength="120" />
        <circle className="dial-track" cx="120" cy="120" r="104" />
        <circle className="dial-fill" cx="120" cy="120" r="104" pathLength="100" transform="rotate(-90 120 120)" />
        <g className="dial-icon" transform={`translate(110 ${top})`}><UsersRound size={20} /></g>
        {/* The dash for no count sits lower in its line than the middle of a digit, so it is raised to match. */}
        <text className="dial-number" x="120" y={range ? baseline : baseline - 4} lengthAdjust="spacingAndGlyphs" style={{ fontSize: size }}>
          {count}
        </text>
        <text className="dial-label" x="120" y={baseline + 25} lengthAdjust="spacingAndGlyphs">{unit}</text>
      </svg>
      <span className="sr-only" role="status">{range ? rangeText(range, ' to ') + ' ' + unit : 'No count yet'}</span>
    </div>
  )
}

const relay = 'https://openseat-classroom-relay.good-eft-3431.chatgpt.site'

function Classroom() {
  const [phase, setPhase] = useState('connecting')
  const [latestScan, setScan] = useState(null)
  const [clearedThrough, setClearedThrough] = useState(0)
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

  const scan = latestScan && latestScan.measuredAt > clearedThrough ? latestScan : null
  const complete = Boolean(scan)
  const displayPhase = complete ? 'complete' : phase
  const time = scan && new Date(scan.measuredAt)
  return (
    <main className="classroom-page">
      <header className="classroom-bar">
        <a href="../" className="classroom-brand"><img src="../mark.svg?v=cutout-2" alt="" />OpenSeat</a>
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
            <Button type="button" variant="outline" disabled={!scan} onClick={() => setClearedThrough(scan.measuredAt)}>
              <RotateCcw aria-hidden="true" /> Reset
            </Button>
            <div className="estimate-note"><h3>How the estimate works</h3><p>Each device at −75 dBm or stronger counts once. A person carries 1 to 2.2 devices, so the estimate is a range: the fewest people if everyone carries 2.2 devices, the most if everyone carries one.</p></div>
          </section>
        </div>
      </div>
    </main>
  )
}

applyTheme()
renderSite(Classroom)
