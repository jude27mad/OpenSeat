import { applyTheme } from '../src/theme.js'
import { renderStaticSite } from '../src/SiteAccess.jsx'

applyTheme()
renderStaticSite((page) => {
  const journey = page.querySelector('#journey')
  const playback = page.querySelector('#playback')
  const playbackLabel = page.querySelector('#playback-label')
  const compact = matchMedia('(max-width: 600px)')
  const root = document.documentElement

  function syncScene() {
    journey.toggleAttribute('data-compact', compact.matches)
    const scene = journey.contentDocument?.rootElement
    if (!scene) return

    scene.dataset.theme = root.dataset.theme
    scene.toggleAttribute('data-compact', compact.matches)
    scene.setAttribute('viewBox', compact.matches ? '0 0 680 508' : '0 0 960 508')
    playback.hidden = false
  }

  function togglePlayback() {
    const scene = journey.contentDocument.rootElement
    const paused = scene.classList.toggle('paused')
    if (paused) scene.pauseAnimations()
    else scene.unpauseAnimations()
    playback.toggleAttribute('data-paused', paused)
    playbackLabel.textContent = paused ? 'Resume animation' : 'Pause animation'
  }

  const observer = new MutationObserver(syncScene)
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
  compact.addEventListener('change', syncScene)
  journey.addEventListener('load', syncScene)
  playback.addEventListener('click', togglePlayback)
  syncScene()
  return () => {
    observer.disconnect()
    compact.removeEventListener('change', syncScene)
    journey.removeEventListener('load', syncScene)
    playback.removeEventListener('click', togglePlayback)
  }
})
