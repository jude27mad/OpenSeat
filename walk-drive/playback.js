const journey = document.querySelector('#journey')
const playback = document.querySelector('#playback')

function connectPlayback() {
  const scene = journey.contentDocument?.rootElement
  if (!scene) return

  playback.hidden = false
  playback.onclick = () => {
    const paused = scene.classList.toggle('paused')
    if (paused) scene.pauseAnimations()
    else scene.unpauseAnimations()
    playback.textContent = paused ? 'Resume animation' : 'Pause animation'
  }
}

journey.addEventListener('load', connectPlayback)
connectPlayback()
