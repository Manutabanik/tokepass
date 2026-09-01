"use client"

import { useId } from "react"

import { VENUE_GRID_SIZE } from "@/lib/seating/venue-transform"

export function VenueMapGridLayer({
  x,
  y,
  width,
  height,
  visible = true,
}: {
  x: number
  y: number
  width: number
  height: number
  visible?: boolean
}) {
  const rawId = useId().replace(/:/g, "")
  const patternId = `venue-grid-${rawId}`
  if (!visible) return null
  return (
    <g className="pointer-events-none" aria-hidden="true">
      <defs>
        <pattern
          id={patternId}
          width={VENUE_GRID_SIZE}
          height={VENUE_GRID_SIZE}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${VENUE_GRID_SIZE} 0 L 0 0 0 ${VENUE_GRID_SIZE}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.6}
            className="text-slate-400/70 dark:text-zinc-500/55"
          />
        </pattern>
      </defs>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={`url(#${patternId})`}
      />
    </g>
  )
}
