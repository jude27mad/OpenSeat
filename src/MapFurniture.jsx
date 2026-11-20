import React from 'react'
import { fresh } from './model.js'

export function MapFurniture({ place, location, model, now, palette, active }) {
  const color = palette[location.status]
  const dash = location.status === 'mixed' ? '3 2' : undefined

  if (place.section === 'individuals') {
    return (
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
    )
  }

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
        fill={color.fill}
        stroke={color.stroke}
        strokeWidth={active ? 2.5 : 1.5}
        strokeDasharray={dash}
      />
      {fresh(location.sensor, now) && (
        <circle cx="6" cy="-6" r="3.1" fill="#fff" stroke="#3b4e8c" strokeWidth="1.4" />
      )}
    </g>
  )
}
