import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { trackVisitorPresence, watchSiteAccess } from './firebase.js'
import './site-access.css'

function ClosedPage() {
  const heading = useRef(null)
  useEffect(() => {
    const title = document.title
    document.title = 'Error 503 · OpenSeat'
    heading.current.focus({ preventScroll: true })
    return () => { document.title = title }
  }, [])

  return (
    <main className="site-closed" aria-labelledby="closed-heading">
      <div>
        <p className="site-error-code">OpenSeat · Error 503</p>
        <h1 id="closed-heading" ref={heading} tabIndex={-1}>Even the website couldn’t find a seat.</h1>
        <p>This page will reopen automatically when OpenSeat is back.</p>
      </div>
    </main>
  )
}

function SiteAccess({ Page }) {
  const [access, setAccess] = useState('checking')
  useEffect(() => watchSiteAccess(setAccess), [])
  const canEnter = access === 'open' || access === 'owner'
  const screen = canEnter ? 'online' : access === 'closed' ? 'waiting' : null
  useEffect(() => {
    if (screen) return trackVisitorPresence(screen)
  }, [screen])
  if (canEnter) return <Page siteClosed={access === 'owner'} />
  if (access === 'closed') return <ClosedPage />
  return <p className="site-connecting" role="status">
    {access === 'unavailable' ? 'Couldn’t check website access. Reload to try again.' : 'Connecting to OpenSeat…'}
  </p>
}

export function renderSite(Page) {
  createRoot(document.getElementById('root')).render(<SiteAccess Page={Page} />)
}

// Keep the two HTML pages inert until access is confirmed, including on a direct visit.
export function renderStaticSite(activate) {
  function StaticPage() {
    const host = useRef(null)
    useLayoutEffect(() => {
      const element = host.current
      element.replaceChildren(document.importNode(document.getElementById('site-content').content, true))
      const cleanup = activate?.(element)
      // The browser may have tried to follow an evidence link before the section existed.
      if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView()
      return () => { cleanup?.(); element.replaceChildren() }
    }, [])
    return <div className="site-document" ref={host} />
  }
  renderSite(StaticPage)
}
