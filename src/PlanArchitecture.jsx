import React from 'react'
import floor5Architecture from './floor5-architecture.js'
import floor7Architecture from './floor7-architecture.js'

const referenceArt = { 5: floor5Architecture, 7: floor7Architecture }
const accents = {
  5: 'M5 12H775M776 18V539M652 620l-598 49M5 18v408',
  7: 'M18 17H771M772 22V509M652 585l-559 46M17 22v379',
  8: 'M238 27H615M617 33V748M135 749H608M20 93l42 540',
}
const floor7StairArrows = [[50, 102], [50, 371], [647, 149]]
const floor8Outline = 'M232 23H620V754H130L57 639 14 88H232Z'
const floor8Services = 'M233 88v91h360M293 177v-72h259v72M237 68h120m138 0h122'

function polygon(points) {
  return 'M' + points.map(([x, y]) => x + ' ' + y).join('L') + 'Z'
}

function FloorShell({ outline, accent }) {
  return (
    <>
      <path d={outline} fill="#fafcf7" stroke="#798d7e" strokeWidth="4.5" strokeLinejoin="round" />
      <path d={accent} fill="none" stroke="#c4d1c0" strokeWidth="2" />
    </>
  )
}

function ServiceWalls({ d }) {
  return <path d={d} fill="none" strokeDasharray="5 3" />
}

// The glyph is in Floor 8's original portrait frame. Turning it about a
// source lift's corner places the arrows horizontally in each landscape plan.
function Lift({ transform }) {
  return (
    <g className="lift-symbol" transform={transform}>
      <rect width="33" height="46" rx="6" />
      <path d="M11 31v-14l-4 4m4-4 4 4m8-5v14l-4-4m4 4 4-4" fill="none" strokeWidth="2" />
    </g>
  )
}

function RoomSurface({ hatch, d, ...rect }) {
  const fill = `url(#${hatch})`
  // The reference floors draw their actual wall runs separately to leave the doors open.
  return d ? (
    <path className="room-shape" d={d} fill={fill} stroke="none" />
  ) : (
    <rect className="room-shape" {...rect} fill={fill} />
  )
}

function RoomTable({ kind, x = 0, y = 0, angle = 0 }) {
  if (!kind) return <rect x="-10" y="-7" width="20" height="14" rx="4" />
  const round = kind === 'round'
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <g strokeWidth="0.9">
        {round ? (
          [0, 90, 180, 270].map((turn) => (
            <rect
              key={turn}
              x="-4.7" y="-17" width="9.4" height="4.3" rx="1.8"
              transform={`rotate(${turn})`}
            />
          ))
        ) : (
          [-13, 0, 13].map((offset) => (
            <g key={offset} transform={`translate(${offset} 0)`}>
              <rect x="-4.3" y="-11.9" width="8.6" height="4.2" rx="1.8" />
              <rect x="-4.3" y="7.7" width="8.6" height="4.2" rx="1.8" />
            </g>
          ))
        )}
      </g>
      {round ? <circle r="11.2" /> : <rect x="-20" y="-6.3" width="40" height="12.6" rx="2.3" />}
    </g>
  )
}

function SeminarBench({ x, y, angle, length, seats }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`} strokeWidth="1">
      {Array.from({ length: seats }, (_, i) => (
        <rect
          key={i}
          x={((i + 0.5) * length) / seats - length / 2 - 4.2}
          y="-10.7" width="8.4" height="4.2" rx="1.8"
        />
      ))}
      <rect x={-length / 2} y="-5.8" width={length} height="11.6" rx="1" />
      <path d={`M${-length / 6} -5.8v11.6M${length / 6} -5.8v11.6`} fill="none" />
    </g>
  )
}

function Floor8({ floor, hatch }) {
  return (
    <>
      <ServiceWalls d={floor8Services} />
      {[309, 374, 438, 501].map((x) => <Lift key={x} transform={`translate(${x} 116)`} />)}
      {floor.rooms.map(([x, y], i) => {
        const wide = i === 10 || i === 19
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(41)`}>
            <RoomSurface
              hatch={hatch}
              x={wide ? -30 : -21} y="-22" width={wide ? 60 : 42} height="44" rx="1"
            />
            <RoomTable />
          </g>
        )
      })}
    </>
  )
}

function ReferenceFloor({ floor, hatch }) {
  const { plan } = floor
  const art = referenceArt[floor.number]
  return (
    <>
      {art.rooms.map((d) => <RoomSurface key={d} d={d} hatch={hatch} />)}
      <path d={art.walls} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <ServiceWalls d={art.services} />
      <g fill="#e4ebe0" stroke="none">
        {(art.stairs || plan.stairs.map(polygon)).map((d) => <path key={d} d={d} />)}
      </g>
      <g fill="none" stroke="#c3d0c3" strokeWidth="1.8" strokeLinejoin="round">
        {floor.number === 7 && floor7StairArrows.map(([x, y]) => (
          <path key={y} transform={`translate(${x} ${y})`} d="M0 0l-4.5-4.5m0 3.5v-3.5H-1" />
        ))}
      </g>
      {plan.lifts.map(([[x, bottom], [, top], [right]]) => (
        <Lift
          key={bottom}
          transform={`translate(${x} ${bottom}) rotate(-90) scale(${(bottom - top) / 33} ${(right - x) / 46})`}
        />
      ))}
      {art.furniture.map((table) => <RoomTable key={table.x + ',' + table.y} {...table} />)}
      {art.seminarRows?.map((bench) => <SeminarBench key={bench.x} {...bench} />)}
    </>
  )
}

export function PlanArchitecture({ floor, hatch }) {
  const reference = Boolean(floor.plan)
  return (
    <g aria-hidden="true" pointerEvents="none" transform={reference ? undefined : 'translate(0 662) rotate(-90)'}>
      <FloorShell outline={reference ? polygon(floor.plan.outline) : floor8Outline} accent={accents[floor.number]} />
      <g stroke="#9cae9e" fill="#f1f4ed" strokeWidth="1.5">
        {reference ? <ReferenceFloor floor={floor} hatch={hatch} /> : <Floor8 floor={floor} hatch={hatch} />}
      </g>
    </g>
  )
}
