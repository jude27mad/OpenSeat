import React from 'react'

// The trace measures each white cell inside its grid lines, in rotated plan units.
export function ReferenceDesk({ place, color, status }) {
  return (
    <rect
      transform={place.angle ? `rotate(${place.angle})` : undefined}
      x={-place.w / 2}
      y={-place.h / 2}
      width={place.w}
      height={place.h}
      fill={color.fill}
      stroke={status === 'mixed' ? color.stroke : undefined}
      strokeWidth="1"
      strokeDasharray={status === 'mixed' ? '3 2' : undefined}
    />
  )
}

// Floor 7's grad tables have a round top and four wide chairs with curved inner edges.
export function ReferenceTable({ color, chairs, mixed, hasSensor }) {
  return (
    <g>
      {chairs.map((chair, i) => (
        <path
          key={i}
          transform={`rotate(${90 * i})`}
          d="M -5.4 -14.1 V -16.5 Q -5.4 -19.2 -2.7 -19.2 H 2.7
             Q 5.4 -19.2 5.4 -16.5 V -14.1 Q 5.4 -12.1 4.1 -12.4
             Q 0 -13.8 -4.1 -12.4 Q -5.4 -12.1 -5.4 -14.1 Z"
          fill={chair.fill}
          stroke={chair.stroke}
          strokeWidth=".7"
        />
      ))}
      <circle
        r="12.4"
        fill={color.fill}
        stroke={color.stroke}
        strokeWidth="1"
        strokeDasharray={mixed ? '3 2' : undefined}
      />
      {hasSensor && <circle cx="8" cy="-8" r="3.4" fill="#fff" stroke="#3b4e8c" strokeWidth="1.4" />}
    </g>
  )
}
