import React from 'react'
import { fresh } from './model.js'

// A current sensor reading: a blue ring, filled green when it reads free and
// orange when it reads in use.
function SensorDot({ event, now }) {
  if (!fresh(event, now)) return null
  return (
    <circle
      className="sensor-dot"
      cx="6"
      cy="-6"
      r="3.4"
      fill={event.value === 'free' ? '#3a9d5d' : '#d0702f'}
      stroke="#3b4e8c"
      strokeWidth="1.4"
    />
  )
}

export function MapFurniture({ place, location, model, now, palette, active }) {
  const color = palette[location.status]
  const dash = location.status === 'mixed' ? '3 2' : undefined

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
          strokeDasharray={dash}
        />
        <path d="M-4 4h8" stroke={color.stroke} strokeWidth="1.25" />
      </g>
      <SensorDot event={sensor} now={now} />
      </>
    )
  }

  // A table sensor reading newer than the chair reports colours the tabletop;
  // the chairs keep their own colours.
  const centre = location.sensorLeads
    ? palette[location.sensor.value === 'free' ? 'sensorfree' : 'inuse']
    : color
  return (
    <g className="table-symbol">
      <circle r="15" fill="transparent" />
      {location.ids.map((id, i) => {
        const chair = palette[model.states.get(id).status]
        return (
          <rect
            key={id}
            transform={`rotate(${(place.angle ?? 42) + i * 90})`}
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
        fill={centre.fill}
        stroke={centre.stroke}
        strokeWidth={active ? 2.5 : 1.5}
        strokeDasharray={dash}
      />
      <SensorDot event={location.sensor} now={now} />
    </g>
  )
}
