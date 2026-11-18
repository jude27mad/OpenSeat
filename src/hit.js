import { places } from './floor.js'

// The plan is drawn rotated a quarter turn. Distances are unchanged.
export const point = (x, y) => [y, 662 - x]
export const mapPoints = new Map(places.map((p) => [p.id, point(p.x, p.y)]))

// Distance from each place to its closest neighbour, in plan units.
export const spacing = new Map(
  places.map((p) => {
    const [x, y] = mapPoints.get(p.id)
    let best = Infinity
    for (const q of places) {
      if (q === p) continue
      const [qx, qy] = mapPoints.get(q.id)
      best = Math.min(best, Math.hypot(qx - x, qy - y))
    }
    return [p.id, best]
  }),
)

export const MAX_ZOOM = 4
// A fingertip covers roughly 20 px, so neighbours closer than this are a guess.
const FINGER = 20
// Spacing to aim for after a tap zooms into a crowded area.
const COMFORT = 34

/*
 * Decide what a tap at `at` (plan units) means.
 * `dim(id)` is true for places the current filter fades out; they lose to
 * a highlighted place within reach but can still be chosen on their own,
 * so a student can always report a faded seat.
 */
export function resolveTap({ at, pxPerUnit, zoom, touch, dim = () => false }) {
  const [x, y] = at
  const near = places
    .map((p) => {
      const [px, py] = mapPoints.get(p.id)
      return { id: p.id, d: Math.hypot(px - x, py - y) * pxPerUnit }
    })
    .sort((a, b) => a.d - b.d)
  const nearest = near[0]
  if (!nearest) return { action: 'none' }
  const gap = spacing.get(nearest.id) * pxPerUnit
  if (touch && gap < FINGER && zoom < MAX_ZOOM && nearest.d < FINGER * 1.5)
    return {
      action: 'zoom',
      zoom: Math.min(MAX_ZOOM, Math.max(zoom * 1.5, (zoom * COMFORT) / gap)),
    }
  const reach = touch
    ? Math.min(28, Math.max(12, gap * 0.55))
    : Math.max(8, gap * 0.5)
  const inReach = near.filter((c) => c.d <= reach)
  if (!inReach.length) return { action: 'none' }
  const lit = inReach.find((c) => !dim(c.id))
  return { action: 'select', id: (lit || inReach[0]).id }
}
