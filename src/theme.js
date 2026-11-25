import { useEffect, useState } from 'react'

// Light, dark, or follow the device ("auto"). The choice is kept in this
// browser; "auto" is the default and follows the phone or computer setting.
const KEY = 'openseat.theme'
const listeners = new Set()
const media =
  typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null

export function storedTheme() {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'auto'
  } catch {
    return 'auto'
  }
}

export function applyTheme(choice = storedTheme()) {
  const dark = choice === 'dark' || (choice === 'auto' && !!media?.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0e1813' : '#f6f7f5')
  return choice
}

function syncTheme(choice = storedTheme()) {
  applyTheme(choice)
  listeners.forEach((listener) => listener(choice))
}

export function setTheme(choice) {
  try {
    if (choice === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Storage blocked: the choice still applies until the page reloads.
  }
  syncTheme(choice)
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEY || event.key === null) syncTheme()
  })
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) syncTheme()
  })
}

// Follow the device when it switches between light and dark.
media?.addEventListener?.('change', () => {
  if (storedTheme() === 'auto') applyTheme('auto')
})

export function useTheme() {
  const [choice, setChoice] = useState(storedTheme)
  useEffect(() => {
    listeners.add(setChoice)
    return () => listeners.delete(setChoice)
  }, [])
  return [choice, setTheme]
}

export const themeChoices = [
  ['auto', 'Auto'],
  ['light', 'Light'],
  ['dark', 'Dark'],
]
