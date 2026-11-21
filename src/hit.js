import { places, mapPoints, spacing } from './floor.js'

// Plan positions and neighbour spacing come from the floor on screen.
export { mapPoints, spacing }

export const MAX_ZOOM = 4
// A fingertip covers roughly 20 px, so neighbours closer than this are a guess.
const FINGER = 20
// Spacing to aim for after a tap zooms into a crowded area.
const COMFORT = 34
// Below this spacing an in-between tap is a guess, so it zooms instead.
const ROOMY = 32

/*
 * Decide what a tap at `at` (plan units) means.
 * Only places included by the current map filters can be selected.
 */
export function resolveTap({ at, pxPerUnit, zoom, touch, dim = () => false }) {
  const [x, y] = at
  const near = places
    .map((p) => {
      const [px, py] = mapPoints.get(p.id)
      return { id: p.id, d: Math.hypot(px - x, py - y) * pxPerUnit }
    })
    .sort((a, b) => a.d - b.d)
  const nearest = near[0],
    second = near[1]
  if (!nearest) return { action: 'none' }
  const gap = spacing.get(nearest.id) * pxPerUnit
  const reach = touch
    ? Math.min(28, Math.max(12, gap * 0.55))
    : Math.max(8, gap * 0.5)
  const candidate = near.find((p) => p.d <= reach && !dim(p.id))
  if (!candidate) return { action: 'none' }
  // Zoom first when neighbours are too close for a fingertip, or when the tap
  // lands between two places that are only a little further apart.
  const between = gap < ROOMY && second && second.d < nearest.d * 1.5 + 4
  if (
    touch &&
    zoom < MAX_ZOOM &&
    ((gap < FINGER && nearest.d < FINGER * 1.5) || (between && nearest.d < gap))
  )
    return {
      action: 'zoom',
      zoom: Math.min(MAX_ZOOM, Math.max(zoom * 1.5, (zoom * COMFORT) / gap)),
    }
  return { action: 'select', id: candidate.id }
}
