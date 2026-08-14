"use client"

import { useId, useRef } from "react"

import {
  isCloseToFirstVertex,
  polygonSvgPoints,
  zoneCanvasCentroid,
} from "@/lib/seating/venue-polygon"
import type { VenueMapPoint, VenueMapZone } from "@/types/venue-map"

function canvasSvgPoints(points: VenueMapPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ")
}

export function VenueMapZoneLayer({
  zones,
  selectedId = null,
  draft = [],
  cursor = null,
  onSelect,
  onContextMenu,
  selectOnPointerUp = false,
}: {
  zones: VenueMapZone[]
  selectedId?: string | null
  draft?: VenueMapPoint[]
  cursor?: VenueMapPoint | null
  onSelect?: (zone: VenueMapZone) => void
  onContextMenu?: (event: React.MouseEvent, zone: VenueMapZone) => void
  selectOnPointerUp?: boolean
}) {
  const glowId = useId().replace(/:/g, "")
  const press = useRef<{ x: number; y: number } | null>(null)
  const closing = Boolean(cursor && isCloseToFirstVertex(draft, cursor))
  const previewPoints =
    draft.length > 0 && cursor && !closing ? [...draft, cursor] : draft
  const first = draft[0]

  return (
    <g>
      <defs>
        <filter
          id={`zone-neon-${glowId}`}
          x="-35%"
          y="-35%"
          width="170%"
          height="170%"
        >
          <feGaussianBlur stdDeviation="2.6" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {zones.map((zone) => {
        const points = polygonSvgPoints(zone.polygon)
        const center = zoneCanvasCentroid(zone)
        const selected = zone.id === selectedId
        return (
          <g
            key={zone.id}
            className={onSelect ? "cursor-pointer" : undefined}
            onContextMenu={(event) => onContextMenu?.(event, zone)}
            onPointerDown={(event) => {
              if (!onSelect) return
              press.current = { x: event.clientX, y: event.clientY }
              if (selectOnPointerUp) return
              event.stopPropagation()
              if (event.button !== 0) return
              onSelect(zone)
            }}
            onPointerUp={(event) => {
              if (!onSelect || !selectOnPointerUp) return
              event.stopPropagation()
              if (event.button !== 0) return
              const start = press.current
              press.current = null
              if (
                start &&
                Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10
              ) {
                return
              }
              onSelect(zone)
            }}
          >
            <polygon
              points={points}
              fill={zone.color}
              fillOpacity={selected ? 0.32 : 0.18}
              stroke={zone.color}
              strokeWidth={selected ? 2.8 : 2}
              strokeLinejoin="round"
              filter={`url(#zone-neon-${glowId})`}
            />
            <text
              x={center.x}
              y={center.y}
              textAnchor="middle"
              className="pointer-events-none fill-white text-[12px] font-bold"
            >
              {zone.name}
            </text>
          </g>
        )
      })}

      {previewPoints.length > 0 ? (
        <g className="pointer-events-none">
          {previewPoints.length >= 2 ? (
            closing ? (
              <polygon
                points={canvasSvgPoints(draft)}
                fill="#22d3ee"
                fillOpacity={0.16}
                stroke="#67e8f9"
                strokeWidth={2.2}
                strokeLinejoin="round"
                filter={`url(#zone-neon-${glowId})`}
              />
            ) : (
              <polyline
                points={canvasSvgPoints(previewPoints)}
                fill="none"
                stroke="#67e8f9"
                strokeWidth={2}
                strokeDasharray="7 5"
                strokeLinejoin="round"
                filter={`url(#zone-neon-${glowId})`}
              />
            )
          ) : null}
          {draft.map((point, index) => (
            <circle
              key={`${point.x}-${point.y}-${index}`}
              cx={point.x}
              cy={point.y}
              r={index === 0 ? 5 : 3.4}
              className={
                index === 0 && closing
                  ? "fill-cyan-200 stroke-white"
                  : "fill-cyan-300 stroke-cyan-950"
              }
              strokeWidth={index === 0 ? 2 : 1}
            />
          ))}
          {first && closing ? (
            <circle
              cx={first.x}
              cy={first.y}
              r={11}
              className="fill-none stroke-cyan-200"
              strokeWidth={1.4}
            />
          ) : null}
        </g>
      ) : null}
    </g>
  )
}
