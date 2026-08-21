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
  selectedIds,
  spotlight = false,
  draft = [],
  cursor = null,
  onSelect,
  onContextMenu,
  onPointerDown,
  onDoubleClick,
  selectOnPointerUp = false,
  unavailableIds = [],
  lodMode = null,
  focusedZoneId = null,
  highlightedIds = [],
  emphasizeSelected = true,
  buyerOccupancy = false,
}: {
  zones: VenueMapZone[]
  selectedId?: string | null
  selectedIds?: string[]
  spotlight?: boolean
  draft?: VenueMapPoint[]
  cursor?: VenueMapPoint | null
  onSelect?: (zone: VenueMapZone) => void
  onContextMenu?: (event: React.MouseEvent, zone: VenueMapZone) => void
  onPointerDown?: (event: React.PointerEvent, zone: VenueMapZone) => void
  onDoubleClick?: (event: React.MouseEvent, zone: VenueMapZone) => void
  selectOnPointerUp?: boolean
  unavailableIds?: string[]
  lodMode?: "macro" | "micro" | null
  focusedZoneId?: string | null
  highlightedIds?: string[]
  emphasizeSelected?: boolean
  buyerOccupancy?: boolean
}) {
  const glowId = useId().replace(/:/g, "")
  const press = useRef<{ x: number; y: number } | null>(null)
  const closing = Boolean(cursor && isCloseToFirstVertex(draft, cursor))
  const previewPoints =
    draft.length > 0 && cursor && !closing ? [...draft, cursor] : draft
  const first = draft[0]
  const selectedSet = new Set(selectedIds ?? [])
  if (selectedId) selectedSet.add(selectedId)
  const orderedZones = [...zones].sort((left, right) => {
    const leftSelected = selectedSet.has(left.id) ? 1 : 0
    const rightSelected = selectedSet.has(right.id) ? 1 : 0
    return leftSelected - rightSelected
  })

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

      {orderedZones.map((zone) => {
        const canvasPoints = polygonToCanvas(zone.polygon)
        if (canvasPoints.length < 3) return null
        const points = polygonSvgPoints(zone.polygon)
        const center = zoneCanvasCentroid(zone)
        const selected =
          zone.id === selectedId || Boolean(selectedIds?.includes(zone.id))
        const highlighted = highlightedIds.includes(zone.id)
        const soldOut = unavailableIds.includes(zone.id)
        const interactive = Boolean(onSelect) && !soldOut
        const hasSelection =
          spotlight ||
          Boolean(selectedId) ||
          Boolean(selectedIds && selectedIds.length > 0) ||
          highlightedIds.length > 0

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

        const isolatedOut = Boolean(focusedZoneId) && focusedZoneId !== zone.id
        const revealFocused = lodMode === "micro" && focusedZoneId === zone.id
        const dimmed = hasSelection && !selected && !highlighted && !soldOut
        const lodSolid = lodMode === "macro"
        const zoneInteractive = interactive && !soldOut && !revealFocused
        const lit = selected || highlighted
        const pop = emphasizeSelected && lit && !lodSolid && !focusedZoneId

        return (
          <g
            key={zone.id}
            id={`venue-sel-${zone.id}`}
            data-zone-id={zone.id}
            data-lod-zone={zone.id}
            data-lod-focused={focusedZoneId === zone.id ? "true" : undefined}
            transform={
              pop
                ? `translate(${center.x} ${center.y}) scale(1.15) translate(${-center.x} ${-center.y})`
                : undefined
            }
            className={cn(
              zoneInteractive ? "cursor-pointer" : undefined,
              soldOut && "pointer-events-none",
              pop && "animate-pulse-subtle",
            )}
            style={{
              opacity: isolatedOut
                ? 0.3
                : dimmed && !lodSolid && !revealFocused
                  ? 0.7
                  : soldOut
                    ? 0.5
                    : 1,
              pointerEvents: zoneInteractive ? "auto" : "none",
              transition: "opacity 0.3s ease, filter 0.3s ease",
              filter: isolatedOut
                ? "grayscale(1)"
                : pop
                  ? "drop-shadow(0px 0px 12px rgba(255, 255, 255, 0.8))"
                  : undefined,
            }}
            onContextMenu={(event) => onContextMenu?.(event, zone)}
            onDoubleClick={(event) => {
              if (!zoneInteractive) return
              event.stopPropagation()
              event.preventDefault()
              onDoubleClick?.(event, zone)
            }}
            onPointerDown={(event) => {
              if (!zoneInteractive) return
              press.current = { x: event.clientX, y: event.clientY }
              if (selectOnPointerUp) return
              if (onPointerDown) {
                onPointerDown(event, zone)
                return
              }
              if (event.button !== 0) return
              handleZoneClick(event)
            }}
            onPointerUp={(event) => {
              if (!zoneInteractive || !selectOnPointerUp) return
              if (event.button !== 0) return
              handleZoneClick(event, true)
              press.current = null
            }}
            onClick={(event) => {
              if (!zoneInteractive) return
              handleZoneClick(event, selectOnPointerUp)
            }}
            onTouchEnd={(event) => {
              if (!zoneInteractive) return
              handleZoneClick(event, true)
              press.current = null
            }}
          >
            <polygon
              data-zone-id={zone.id}
              points={points}
              fill={
                soldOut
                  ? buyerOccupancy
                    ? "#333333"
                    : "#9ca3af"
                  : zone.color || "#22d3ee"
              }
              fillOpacity={
                revealFocused
                  ? 0.06
                  : soldOut
                    ? buyerOccupancy
                      ? 0.3
                      : 0.45
                    : lodSolid
                      ? 0.3
                      : selected
                        ? 0.62
                        : 0.28
              }
              stroke={
                soldOut
                  ? buyerOccupancy
                    ? "#333333"
                    : "#9ca3af"
                  : lodSolid
                    ? zone.color || "#67e8f9"
                    : selected
                      ? buyerOccupancy
                        ? "#10b981"
                        : "#ffffff"
                      : zone.color || "#67e8f9"
              }
              strokeWidth={lodSolid ? 2 : selected ? 3 : 2}
              strokeLinejoin="round"
              pointerEvents={soldOut || revealFocused ? "none" : "auto"}
              filter={
                soldOut || revealFocused || lodSolid
                  ? undefined
                  : `url(#zone-neon-${glowId})`
              }
              className={cn(
                "transition-[fill-opacity] duration-300 ease-out",
                zoneInteractive &&
                  (lodSolid
                    ? "cursor-pointer hover:[fill-opacity:0.45]"
                    : "cursor-pointer hover:[fill-opacity:0.82]"),
              )}
            />
            {revealFocused ? null : (
            <text
              x={center.x}
              y={center.y}
              textAnchor="middle"
              className={cn(
                "pointer-events-none fill-white font-bold",
                lodSolid || selected ? "text-[14px]" : "text-[12px]",
              )}
            >
              {zone.name}
            </text>
            )}
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
