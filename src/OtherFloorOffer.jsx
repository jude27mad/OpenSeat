import React, { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from './components/ui/button'
import { FLOORS, floorNumbers } from './floor.js'
import { derive } from './model.js'
import { chosenRoom, isLive, roomUrl, useFloor } from './session.js'

function FloorOffer({ number, live, now, className, children }) {
  const [room] = useState(() => chosenRoom(live, false, number))
  const { events, online } = useFloor(room)
  if (online !== 'shared') return children
  const { tables, individuals } = FLOORS[number]
  const places = [...tables, ...individuals]
  const { recommendableFree: free } = derive(events, now, places)
  if (free === 0) return children

  return (
    <Button asChild className={className + ' whitespace-normal'}>
      <a href={roomUrl(room)}>
        View Floor {number} · {free} {free === 1 ? 'seat' : 'seats'} {live ? 'reported free' : 'free in demo'}
        <ArrowRight aria-hidden="true" />
      </a>
    </Button>
  )
}

export default function OtherFloorOffer({ room, now, className }) {
  // Offer the shortest trip. Stop watching farther floors once a nearer floor
  // has an opening. All candidate rooms belong to the current data mode.
  const alternatives = floorNumbers
    .filter((number) => number !== room.floor)
    .sort((a, b) => Math.abs(a - room.floor) - Math.abs(b - room.floor))
  return alternatives.reduceRight((farther, number) => (
    <FloorOffer key={number} number={number} live={isLive(room)} now={now} className={className}>
      {farther}
    </FloorOffer>
  ), null)
}
