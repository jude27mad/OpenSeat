import React from 'react'
import { fresh } from './model.js'

// A current sensor reading: a blue ring, filled green when it reads free and
// orange when it reads in use.
function SensorDot({ event, now, cx = 6, cy = -6, r = 3.4 }) {
  if (!fresh(event, now)) return null
  return (
    <circle
      className="sensor-dot"
      cx={cx}
      cy={cy}
      r={r}
      fill={event.value === 'free' ? '#3a9d5d' : '#d0702f'}
      stroke="#3b4e8c"
      strokeWidth="1.4"
    />
  )
}

export function MapFurniture({ place, location, model, now, palette, active }) {
  const color = palette[location.status]

  if (place.section === 'individuals') {
    const sensor = model.states.get(place.id)?.evidence.find((e) => e.source === 'sensor')
    return (
      <>
      <g className="seat-symbol" transform={`rotate(${place.angle ?? -49})`}>
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
      <SensorDot event={sensor} now={now} />
      </>
    )
  }

  return (
    <g className="table-symbol">
      <circle r="15" fill="transparent" />
      {location.ids.map((id, i) => {
        const state = model.states.get(id),
          chair = palette[state.status]
        return (
          <g key={id} transform={`rotate(${(place.angle ?? 42) + i * 90})`}>
            <rect
              x="-4.6"
              y="-13"
              width="9.2"
              height="4.2"
              rx="1.8"
              fill={chair.fill}
              stroke={chair.stroke}
              strokeWidth="1.25"
            />
            {/* Each chair has its own seat sensor, drawn just outside it. */}
            <SensorDot
              event={state.evidence.find((e) => e.source === 'sensor')}
              now={now}
              cx={0}
              cy={-16.4}
              r={2.4}
            />
          </g>
        )
      })}
      <circle
        r="8.5"
        fill={color.fill}
        stroke={color.stroke}
        strokeWidth={active ? 2.5 : 1.5}
      />
    </g>
  )
}
