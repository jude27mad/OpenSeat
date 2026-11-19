import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { FLOORS, floor, places, label } from './floor.js'
import { age, fresh, sources, placeDescription, looksFree } from './model.js'
import { MAX_ZOOM, mapPoints, resolveTap } from './hit.js'

// Free is the strongest mark on the plan, so it stands out without colour vision.
export const palette = {
  free: { fill: '#3a9d5d', stroke: '#1f6b3b' },
  occupied: { fill: '#f3d2b5', stroke: '#a35a26' },
  unknown: { fill: '#ffffff', stroke: '#7c8a80' },
  mixed: { fill: '#d9c7ef', stroke: '#6d4791' },
  inuse: { fill: '#f7e3d1', stroke: '#a35a26' },
  sensorfree: { fill: '#bfe3c9', stroke: '#2f7d49' },
}
const roomShape = (x, y) => ({ transform: `translate(${x} ${y}) rotate(41)` })
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export function isDim(location, section, filter) {
  return (
    (section !== 'all' && location.section !== section) ||
    (filter === 'free' && !looksFree(location))
  )
}

// Floor 8 was traced in its own frame and is drawn a quarter turn round.
function Floor8Plan({ hatch }) {
  return (
        <g transform="translate(0 662) rotate(-90)" pointerEvents="none">
          <path
            d="M232 23H620V754H130L57 639 14 88H232Z"
            fill="#fafcf7"
            stroke="#798d7e"
            strokeWidth="4.5"
            strokeLinejoin="round"
          />
          <path
            d="M238 27H615M617 33V748M135 749H608M20 93l42 540"
            fill="none"
            stroke="#c4d1c0"
            strokeWidth="2"
          />
          <g stroke="#9cae9e" fill="#f1f4ed" strokeWidth="1.5">
            <path
              d="M233 88v91h360M293 177v-72h259v72M237 68h120m138 0h122M465 597h151"
              fill="none"
              strokeDasharray="5 3"
            />
            {[309, 374, 438, 501].map((x) => (
              <g key={x}>
                <rect x={x} y="116" width="33" height="46" rx="6" />
                <path
                  d={`M${x + 11} 147v-14l-4 4m4-4 4 4m8-5v14l-4-4m4 4 4-4`}
                  fill="none"
                  strokeWidth="2"
                />
              </g>
            ))}
            {FLOORS[8].rooms.map(([x, y], i) => (
              <g key={i} {...roomShape(x, y)}>
                <rect
                  x={i === 10 || i === 19 ? -30 : -21}
                  y="-22"
                  width={i === 10 || i === 19 ? 60 : 42}
                  height="44"
                  rx="1"
                  fill={`url(#${hatch})`}
                />
                <rect x="-10" y="-7" width="20" height="14" rx="4" />
              </g>
            ))}
          </g>
        </g>
  )
}

const pts = (shape) => shape.map((q) => q.join(',')).join(' ')
// Floor 5, from the library's room-booking map, turned the same way as Floor 8.
// Bookable rooms, the seminar room and the media rooms are hatched: not counted.
function Floor5Plan({ plan, hatch }) {
  const box = (shape) => {
    const xs = shape.map((q) => q[0]),
      ys = shape.map((q) => q[1])
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  }
  return (
    <g pointerEvents="none">
      <polygon
        points={pts(plan.outline)}
        fill="#fafcf7"
        stroke="#798d7e"
        strokeWidth="4.5"
        strokeLinejoin="round"
      />
      {plan.stairs.map((shape, i) => (
        <polygon key={i} points={pts(shape)} fill="#e9eee6" />
      ))}
      <g stroke="#9cae9e" fill="#f1f4ed" strokeWidth="1.5">
        {plan.lifts.map((shape, i) => {
          const [x0, y0, x1, y1] = box(shape),
            cx = (x0 + x1) / 2,
            cy = (y0 + y1) / 2
          return (
            <g key={i}>
              <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx="6" />
              <path
                d={`M${cx - 6} ${cy + 7}v-14l-4 4m4-4 4 4m8-4v14l-4-4m4 4 4-4`}
                fill="none"
                strokeWidth="2"
              />
            </g>
          )
        })}
        {[...plan.media, plan.seminar.shape].map((shape, i) => (
          <polygon key={'r' + i} points={pts(shape)} fill={`url(#${hatch})`} />
        ))}
        {plan.seminar.desks.map(([a, b], i) => (
          <line
            key={'d' + i}
            x1={a[0]}
            y1={a[1]}
            x2={b[0]}
            y2={b[1]}
            stroke="#dfe6dc"
            strokeWidth="6"
            strokeLinecap="round"
          />
        ))}
        {plan.bookable.map((room, i) => (
          <g key={'b' + i}>
            <polygon points={pts(room.shape)} fill={`url(#${hatch})`} />
            {room.kind === 'round' ? (
              <circle cx={room.table[0]} cy={room.table[1]} r="7" />
            ) : (
              <rect
                x={room.table[0] - 4}
                y={room.table[1] - 12}
                width="8"
                height="24"
                rx="3"
                transform={`rotate(-38 ${room.table[0]} ${room.table[1]})`}
              />
            )}
          </g>
        ))}
      </g>
    </g>
  )
}

// Area names. Diagonal ones lie along the furniture they name.
const LABELS = {
  8: (size) => [
    [141, 103, 0, 'LIFTS', size, 'middle'],
    [745, 198, 0, 'ROUND TABLES', size, 'end'],
    [270, 257, 40, 'INDIVIDUAL SEATS', Math.min(size, 22)],
    [242, 471, -48, 'BOOKABLE ROOMS', Math.min(size, 22)],
    [468, 216, -49, 'BOOKABLE ROOMS', Math.min(size, 22)],
  ],
  5: (size) => [
    [112, 86, 0, 'LIFTS', size, 'middle'],
    [245, 428, 0, 'INDIVIDUAL SEATS', Math.min(size, 22), 'middle'],
    [409, 374, -40, 'BOOKABLE ROOMS', Math.min(size, 20)],
    [305, 309, -42, 'SEMINAR ROOM', Math.min(size, 18)],
    [525, 462, 0, 'MEDIA ROOMS', Math.min(size, 20), 'middle'],
  ],
}

export function PlanDrawing({
  model,
  selected,
  section = 'all',
  filter = 'all',
  now = Date.now(),
  pxPerUnit = 1,
  labels = true,
  onTap,
  svgRef,
}) {
  const hatch = useId().replace(/:/g, '')
  const selectedPlace = selected && model.locations.get(selected)
  const [px, py] = selectedPlace ? mapPoints.get(selected) : [0, 0]
  // Keep labels, the selection ring and its name tag readable at any size.
  const textSize = clamp(11.5 / pxPerUnit, 8, 24)
  const tag = clamp(1.15 / pxPerUnit, 1, 2.6)
  const ring = clamp(13 / pxPerUnit, 18, 30)
  // Numbers fit inside each seat once the map is zoomed in far enough.
  const numbers = labels && pxPerUnit >= 1.3
  return (
    <svg
      ref={svgRef}
      className="plan-svg"
      viewBox={'0 0 ' + floor.viewBox.join(' ')}
      aria-label={'Floor plan of the Student Learning Centre, ' + floor.name}
      onClick={onTap}
    >
      <defs>
        <pattern
          id={hatch}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(40)"
        >
          <path d="M0 0V6" stroke="#cdd7cd" strokeWidth="1.2" />
        </pattern>
      </defs>
      {floor.number === 8 ? <Floor8Plan hatch={hatch} /> : <Floor5Plan plan={floor.plan} hatch={hatch} />}
      {labels && (
        <g pointerEvents="none">
          {LABELS[floor.number](textSize).map(([x, y, angle, text, size, anchor]) => (
            <text
              key={text + x}
              x={x}
              y={y}
              dy={angle ? '0.35em' : undefined}
              textAnchor={anchor || 'middle'}
              transform={angle ? `rotate(${angle} ${x} ${y})` : undefined}
              className={'plan-label' + (angle || anchor === 'middle' && size < textSize ? ' along' : '')}
              fontSize={size}
            >
              {text}
            </text>
          ))}
        </g>
      )}
      {places.map((p) => {
        const location = model.locations.get(p.id),
          [x, y] = mapPoints.get(p.id)
        const color = palette[location.status],
          active = p.id === selected
        const e = location.latest,
          provenance = e
            ? sources[e.source] + ' · ' + age(e.at, now) + (e.simulated ? ' · Demo' : '')
            : 'No updates yet'
        return (
          <g
            key={p.id}
            data-id={p.id}
            transform={`translate(${x} ${y})`}
            className={'map-marker ' + location.status + (active ? ' active' : '')}
            opacity={isDim(location, section, filter) ? 0.22 : 1}
            role={onTap ? 'button' : undefined}
            tabIndex={onTap ? -1 : undefined}
            aria-hidden={onTap ? undefined : true}
            aria-label={
              onTap
                ? label(p.id) + ', ' + placeDescription(location) + ', ' + provenance
                : undefined
            }
          >
            {p.section === 'tables' ? (
              <g>
                <circle r="15" fill="transparent" />
                {[0, 90, 180, 270].map((angle, i) => {
                  const chair = palette[model.states.get(location.ids[i]).status]
                  return (
                    <rect
                      key={angle}
                      transform={`rotate(${angle + 42})`}
                      x="-4.6"
                      y="-13"
                      width="9.2"
                      height="4.2"
                      rx="1.8"
                      fill={chair.fill}
                      stroke={chair.stroke}
                      strokeWidth="1.25"
                    />
                  )
                })}
                <circle
                  r="8.5"
                  fill={color.fill}
                  stroke={color.stroke}
                  strokeWidth={active ? 2.5 : 1.5}
                  strokeDasharray={location.status === 'mixed' ? '3 2' : undefined}
                />
                {fresh(location.sensor, now) && (
                  // A current table-sensor reading.
                  <circle cx="6" cy="-6" r="3.1" fill="#fff" stroke="#3b4e8c" strokeWidth="1.4" />
                )}
              </g>
            ) : (
              <g transform={`rotate(${p.angle ?? -49})`}>
                <rect
                  {...(p.angle === undefined
                    ? { x: -8, y: -7, width: 16, height: 14 }
                    : { x: -8.5, y: -8.5, width: 17, height: 17 })}
                  rx="2"
                  fill={color.fill}
                  stroke={color.stroke}
                  strokeWidth="1.4"
                  strokeDasharray={location.status === 'mixed' ? '3 2' : undefined}
                />
                <path d="M-4 4h8" stroke={color.stroke} strokeWidth="1.25" />
              </g>
            )}
            {numbers && (
              <text
                className="plan-number"
                y={p.section === 'tables' ? 3.4 : 2.6}
                textAnchor="middle"
                fontSize={p.section === 'tables' ? 8.5 : 7}
                fill={location.status === 'free' ? '#fff' : '#22352a'}
                pointerEvents="none"
                aria-hidden="true"
              >
                {Number(p.id.slice(1))}
              </text>
            )}
          </g>
        )
      })}
      {selectedPlace && (
        <g pointerEvents="none">
          <circle
            cx={px}
            cy={py}
            r={ring}
            fill="#18583f14"
            stroke="#18583f"
            strokeWidth={clamp(2.5 / pxPerUnit, 2, 6)}
          />
          <g
            transform={`translate(${clamp(px, 43 * tag + 6, floor.viewBox[0] - 6 - 43 * tag)} ${Math.max(
              24 * tag + 2,
              py - ring - 4,
            )}) scale(${tag})`}
          >
            <rect x="-43" y="-21" width="86" height="23" rx="6" fill="#194533" />
            <path d="m-4 2 4 5 4-5" fill="#194533" />
            <text
              textAnchor="middle"
              y="-5"
              fill="white"
              fontSize="11.5"
              fontWeight="700"
            >
              {label(selected)}
            </text>
          </g>
        </g>
      )}
    </svg>
  )
}

/*
 * The interactive map. A tap picks the closest seat a fingertip can tell
 * apart; a tap on a crowded area zooms in there first. Zoom keeps the spot
 * you are looking at in place, and two fingers pinch to zoom.
 */
export default function FloorMap({ onSelect, focus, onPlaced, onShowList, ...props }) {
  const [zoom, setZoom] = useState(1),
    [ppu, setPpu] = useState(1),
    [hint, setHint] = useState(''),
    viewport = useRef(null),
    svg = useRef(null),
    anchor = useRef(null),
    pointer = useRef('mouse'),
    zoomRef = useRef(1)
  zoomRef.current = zoom

  function toUnits(clientX, clientY) {
    const m = svg.current?.getScreenCTM()
    if (!m) return null
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse())
    return [p.x, p.y]
  }
  function viewCenter() {
    const r = viewport.current.getBoundingClientRect()
    return [r.left + r.width / 2, r.top + r.height / 2]
  }
  // `center` keeps the point in the middle of the map, measured when the zoom
  // is applied, so a page scroll in between cannot throw it off.
  function zoomAt(next, clientX, clientY, target, center = false) {
    const z = clamp(next, 1, MAX_ZOOM)
    const at = target || toUnits(clientX, clientY)
    if (at) anchor.current = { at, clientX, clientY, center, notify: center }
    setZoom(z)
    if (z === zoomRef.current) {
      place()
      if (center) onPlaced?.()
    }
  }
  // Put the anchored plan point back under the finger or at the centre.
  function place() {
    const a = anchor.current,
      m = svg.current?.getScreenCTM(),
      v = viewport.current
    if (!a || !m || !v) return
    const [cx, cy] = a.center ? viewCenter() : [a.clientX, a.clientY]
    const p = new DOMPoint(a.at[0], a.at[1]).matrixTransform(m)
    v.scrollLeft += p.x - cx
    v.scrollTop += p.y - cy
    anchor.current = null
  }
  useLayoutEffect(() => {
    const placing = !!anchor.current?.notify
    place()
    const m = svg.current?.getScreenCTM()
    if (m) setPpu(m.a)
    if (placing) onPlaced?.()
  }, [zoom])
  useEffect(() => {
    const v = viewport.current
    if (!v) return
    const observer = new ResizeObserver(() => {
      const m = svg.current?.getScreenCTM()
      if (m) setPpu(m.a)
    })
    observer.observe(v)
    return () => observer.disconnect()
  }, [])
  // Centre on a seat chosen elsewhere (Find me a seat, the list or a QR link).
  useEffect(() => {
    if (!focus || !props.selected) return
    const at = mapPoints.get(props.selected)
    if (!at) return
    const target = Math.max(zoomRef.current, props.selected.startsWith('I') ? 3 : 1.8)
    zoomAt(target, 0, 0, at, true)
  }, [focus])
  // Pinch with two fingers; one finger keeps scrolling natively.
  useEffect(() => {
    const v = viewport.current
    if (!v) return
    let start = null
    const mid = (t) => [
      (t[0].clientX + t[1].clientX) / 2,
      (t[0].clientY + t[1].clientY) / 2,
    ]
    const dist = (t) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    function down(e) {
      if (e.touches.length !== 2) return
      const [cx, cy] = mid(e.touches)
      start = { d: dist(e.touches), z: zoomRef.current, at: toUnits(cx, cy) }
    }
    function move(e) {
      if (!start || e.touches.length !== 2) return
      e.preventDefault()
      const [cx, cy] = mid(e.touches)
      zoomAt((start.z * dist(e.touches)) / start.d, cx, cy, start.at)
    }
    function up(e) {
      if (e.touches.length < 2) start = null
    }
    function wheel(e) {
      if (!e.ctrlKey) return
      e.preventDefault()
      zoomAt(zoomRef.current * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY)
    }
    v.addEventListener('touchstart', down, { passive: true })
    v.addEventListener('touchmove', move, { passive: false })
    v.addEventListener('touchend', up)
    v.addEventListener('touchcancel', up)
    v.addEventListener('wheel', wheel, { passive: false })
    return () => {
      v.removeEventListener('touchstart', down)
      v.removeEventListener('touchmove', move)
      v.removeEventListener('touchend', up)
      v.removeEventListener('touchcancel', up)
      v.removeEventListener('wheel', wheel)
    }
  }, [])
  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(''), 2600)
    return () => clearTimeout(t)
  }, [hint])

  function onTap(e) {
    // Keyboard and screen-reader activation has no position: use the marker itself.
    if (e.detail === 0) {
      const id = e.target.closest?.('[data-id]')?.getAttribute('data-id')
      if (id) onSelect(id)
      return
    }
    const at = toUnits(e.clientX, e.clientY),
      m = svg.current?.getScreenCTM()
    if (!at || !m) return
    const result = resolveTap({
      at,
      pxPerUnit: m.a,
      zoom,
      touch: pointer.current !== 'mouse',
      dim: (id) =>
        isDim(props.model.locations.get(id), props.section, props.filter),
    })
    if (result.action === 'zoom') {
      zoomAt(result.zoom, e.clientX, e.clientY)
      setHint('Zoomed in. Tap the seat you want.')
    } else if (result.action === 'select') {
      setHint('')
      onSelect(result.id)
    }
  }
  return (
    <div className="map-canvas">
      {onShowList && (
        <button className="sr-only skip-map" onClick={onShowList}>
          Browse seats as a list instead of the map
        </button>
      )}
      <div
        className={'plan-viewport' + (zoom > 1 ? ' zoomed' : '')}
        ref={viewport}
        tabIndex={zoom > 1 ? 0 : undefined}
        role={zoom > 1 ? 'region' : undefined}
        aria-label={zoom > 1 ? 'Zoomed floor map. Use the arrow keys to move around.' : undefined}
        onPointerDown={(e) => {
          pointer.current = e.pointerType || 'mouse'
        }}
      >
        <div
          className="plan-inner"
          style={{ width: zoom * 100 + '%', height: zoom * 100 + '%' }}
        >
          <PlanDrawing {...props} pxPerUnit={ppu} onTap={onTap} svgRef={svg} />
        </div>
      </div>
      <div className="map-hint-region" role="status" aria-live="polite">
        {hint && <div className="map-hint">{hint}</div>}
      </div>
    </div>
  )
}
