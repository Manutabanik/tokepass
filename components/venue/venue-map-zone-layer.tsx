"use client"

import { useId, useRef } from "react"

import {
  isCloseToFirstVertex,
  polygonSvgPoints,
  polygonToCanvas,
  zoneCanvasCentroid,
} from "@/lib/seating/venue-polygon"
import { cn } from "@/lib/utils"
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
        const canvasPoints = polygonToCanvas(zone.polygon)
        if (canvasPoints.length < 3) return null
        const points = polygonSvgPoints(zone.polygon)
        const center = zoneCanvasCentroid(zone)
        const selected = zone.id === selectedId
        const interactive = Boolean(onSelect)

        function eventClientPoint(
          event: React.PointerEvent | React.MouseEvent | React.TouchEvent,
        ) {
          if ("changedTouches" in event) {
            const touch = event.changedTouches[0]
            return touch
              ? { x: touch.clientX, y: touch.clientY }
              : null
          }
          return { x: event.clientX, y: event.clientY }
        }

        function handleZoneClick(
          event: React.PointerEvent | React.MouseEvent | React.TouchEvent,
          requireTap = false,
        ) {
          if (!onSelect) return
          if (requireTap) {
            const start = press.current
            const point = eventClientPoint(event)
            if (
              start &&
              point &&
              Math.hypot(point.x - start.x, point.y - start.y) > 10
            ) {
              return
            }
          }
          event.stopPropagation()
          onSelect(zone)
        }

        return (
          <g
            key={zone.id}
            data-zone-id={zone.id}
            className={interactive ? "cursor-pointer" : undefined}
            style={{ pointerEvents: interactive ? "auto" : "none" }}
            onContextMenu={(event) => onContextMenu?.(event, zone)}
            onPointerDown={(event) => {
              if (!interactive) return
              press.current = { x: event.clientX, y: event.clientY }
              if (selectOnPointerUp) return
              if (event.button !== 0) return
              handleZoneClick(event)
            }}
            onPointerUp={(event) => {
              if (!interactive || !selectOnPointerUp) return
              if (event.button !== 0) return
              handleZoneClick(event, true)
              press.current = null
            }}
            onClick={(event) => {
              if (!interactive) return
              handleZoneClick(event, selectOnPointerUp)
            }}
            onTouchEnd={(event) => {
              if (!interactive) return
              handleZoneClick(event, true)
              press.current = null
            }}
          >
            <polygon
              data-zone-id={zone.id}
              points={points}
              fill={zone.color || "#22d3ee"}
              stroke={zone.color || "#67e8f9"}
              strokeWidth={selected ? 2.8 : 2}
              strokeLinejoin="round"
              pointerEvents="auto"
              filter={`url(#zone-neon-${glowId})`}
              className={cn(
                selected ? "[fill-opacity:0.4]" : "[fill-opacity:0.28]",
                interactive &&
                  "cursor-pointer transition-[fill-opacity] duration-150 hover:[fill-opacity:0.75]",
              )}
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
