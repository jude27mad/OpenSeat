import React, { useRef, useState } from 'react'
import { Minus, Plus, Maximize2, MapPin } from 'lucide-react'
import { places, rooms, unassigned, label } from './floor.js'
import { age, sources, placeDescription } from './model.js'
export const palette = {
  free: { fill: '#d8efcf', stroke: '#39734b' },
  occupied: { fill: '#f7d8bb', stroke: '#975524' },
  unknown: { fill: '#e6ebe6', stroke: '#8d9a90' },
  mixed: { fill: '#e5d9f3', stroke: '#765395' },
  inuse: { fill: '#fae5ce', stroke: '#986133' },
  sensorfree: { fill: '#e3f2d7', stroke: '#4b7549' },
}
const point = (x, y) => [y, 662 - x]
const roomShape = (x, y) => ({ transform: `translate(${x} ${y}) rotate(41)` })
export function PlanDrawing({
  model,
  selected,
  section = 'all',
  filter = 'all',
  onSelect = () => {},
  scale = 1,
  now = Date.now(),
}) {
  const selectedPlace = model.locations.get(selected)
  const [px, py] = selectedPlace
    ? point(selectedPlace.x, selectedPlace.y)
    : [0, 0]
  return (
    <svg
      className="plan-svg"
      width={790 * scale}
      height={680 * scale}
      viewBox="0 0 790 680"
      aria-label="Interactive floor plan of the Student Learning Centre, Floor 8"
    >
      <defs>
        <pattern
          id="roomHatch"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(40)"
        >
          <path d="M0 0V6" stroke="#cdd7cd" strokeWidth="1.2" />
        </pattern>
      </defs>
      <g transform="translate(0 662) rotate(-90)">
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
          {rooms.map(([x, y], i) => (
            <g key={i} {...roomShape(x, y)}>
              <rect
                x={i === 10 || i === 19 ? -30 : -21}
                y="-22"
                width={i === 10 || i === 19 ? 60 : 42}
                height="44"
                rx="1"
                fill="url(#roomHatch)"
              />
              <rect x="-10" y="-7" width="20" height="14" rx="4" />
            </g>
          ))}
          {unassigned.map(([x, y]) => (
            <rect
              key={x + ':' + y}
              {...roomShape(x, y)}
              x="-8"
              y="-7"
              width="16"
              height="14"
              fill="#e9ede6"
            />
          ))}
        </g>
      </g>
      {[
        [87, 156, 'LIFTS'],
        [575, 102, 'BOOKABLE ROOMS'],
        [666, 194, 'ROUND TABLES'],
        [283, 32, 'INDIVIDUAL SEATS'],
      ].map(([x, y, t]) => (
        <text key={t} x={x} y={y} textAnchor="middle" className="plan-label">
          {t}
        </text>
      ))}
      {places.map((p) => {
        const location = model.locations.get(p.id),
          [x, y] = point(p.x, p.y)
        const dim =
          (section !== 'all' && p.section !== section) ||
          (filter === 'free' && location.tally.free === 0)
        const color = palette[location.status],
          active = p.id === selected
        const e = location.latest,
          provenance = e
            ? (e.simulated ? 'Simulated · ' : '') +
              sources[e.source] +
              ' · ' +
              age(e.at, now)
            : 'No source yet'
        return (
          <g
            key={p.id}
            transform={`translate(${x} ${y})`}
            className={'map-marker' + (active ? ' active' : '')}
            opacity={dim ? 0.22 : 1}
            role="button"
            tabIndex={-1}
            aria-label={
              label(p.id) +
              ', ' +
              placeDescription(location) +
              ', ' +
              provenance
            }
            onClick={() => onSelect(p.id)}
          >
            <title>
              {label(p.id) +
                ' · ' +
                placeDescription(location) +
                ' · ' +
                provenance}
            </title>
            <rect x="-16" y="-16" width="32" height="32" fill="transparent" />
            {p.section === 'tables' ? (
              <g>
                {[0, 90, 180, 270].map((angle, i) => {
                  const chair =
                    palette[model.states.get(location.ids[i]).status]
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
                />
                {active && <circle r="2.5" fill="#194f3b" />}
              </g>
            ) : (
              <g transform="rotate(-49)">
                <rect
                  x="-8"
                  y="-7"
                  width="16"
                  height="14"
                  rx="2"
                  fill={color.fill}
                  stroke={color.stroke}
                  strokeWidth="1.4"
                />
                <path d="M-4 4h8" stroke={color.stroke} strokeWidth="1.25" />
              </g>
            )}
            {active && (
              <circle
                r="18"
                fill="none"
                stroke="#18583f"
                strokeWidth="2"
                strokeDasharray="3 2"
              />
            )}
          </g>
        )
      })}
      {selectedPlace && (
        <g
          transform={`translate(${Math.min(Math.max(px, 59), 731)} ${Math.max(28, py - 25)})`}
          pointerEvents="none"
        >
          <rect x="-43" y="-20" width="86" height="23" rx="6" fill="#194533" />
          <path d="m-4 2 4 5 4-5" fill="#194533" />
          <text
            textAnchor="middle"
            y="-4"
            fill="white"
            fontSize="11"
            fontWeight="700"
          >
            {label(selected)}
          </text>
        </g>
      )}
    </svg>
  )
}
export default function FloorMap(props) {
  const [zoom, setZoom] = useState(1),
    viewport = useRef(null)
  return (
    <div className="map-canvas">
      <div className="map-overlay floor-stamp">
        <MapPin size={13} /> Floor 8
      </div>
      <div className="plan-viewport" ref={viewport}>
        <div
          className="plan-inner"
          style={{ width: zoom * 100 + '%', height: zoom * 100 + '%' }}
        >
          <PlanDrawing {...props} scale={zoom} />
        </div>
      </div>
      <div className="map-controls" aria-label="Map zoom">
        <button
          title="Zoom out"
          aria-label="Zoom out"
          disabled={zoom <= 1}
          onClick={() => setZoom((z) => Math.max(1, z - 0.35))}
        >
          <Minus size={16} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          title="Zoom in"
          aria-label="Zoom in"
          disabled={zoom >= 2.4}
          onClick={() => setZoom((z) => Math.min(2.4, z + 0.35))}
        >
          <Plus size={16} />
        </button>
        <button
          title="Fit map"
          aria-label="Fit map"
          onClick={() => {
            setZoom(1)
            viewport.current?.scrollTo(0, 0)
          }}
        >
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  )
}
