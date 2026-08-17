"use client"

import { memo, useMemo } from "react"

import { VenueElementSymbol } from "@/components/admin/venue-svg-symbols"
import { compactVenueElementLabel } from "@/lib/seating/venue-element-geometry"
import { cn } from "@/lib/utils"
import type { InteractiveVenueMap, VenueMapElement } from "@/types/venue-map"

const VenueElementShape = memo(function VenueElementShape({
  element,
  selected,
  occupancyBySeatId,
  selectedSeatIds,
  onElementPointerDown,
  onElementContextMenu,
  onSeatPointerDown,
  showLabels,
  showChairs,
  interactive,
  zoom,
  dimmed = false,
  highlighted = false,
  popSelected = true,
}: {
  element: VenueMapElement
  selected: boolean
  occupancyBySeatId: Record<string, "available" | "occupied" | "blocked">
  selectedSeatIds: Set<string>
  onElementPointerDown?: (
    event: React.PointerEvent,
    element: VenueMapElement,
  ) => void
  onElementContextMenu?: (
    event: React.MouseEvent,
    element: VenueMapElement,
  ) => void
  onSeatPointerDown?: (
    event: React.PointerEvent,
    element: VenueMapElement,
    seatId: string,
  ) => void
  showLabels: boolean
  showChairs: boolean
  interactive: boolean
  zoom: number
  dimmed?: boolean
  highlighted?: boolean
  popSelected?: boolean
}) {
  const lit = selected || highlighted
  const transform =
    lit && popSelected
      ? `translate(${element.x} ${element.y}) scale(1.15) translate(${-element.x} ${-element.y}) rotate(${element.rotation} ${element.x} ${element.y})`
      : `rotate(${element.rotation} ${element.x} ${element.y})`
  const opacity = (element.opacity ?? 1) * (dimmed && !lit ? 0.7 : 1)
  const labelText = compactVenueElementLabel(element.label, lit ? 99 : zoom)
  const tableLike =
    element.type !== "standing_zone" &&
    element.type !== "vip_chair" &&
    element.type !== "infrastructure"

  return (
    <g
      id={`venue-sel-${element.id}`}
      transform={transform}
      opacity={opacity}
      className={
        interactive
          ? "cursor-pointer transition-all duration-200 ease-in-out"
          : "pointer-events-none transition-all duration-200 ease-in-out"
      }
      onPointerDown={
        interactive
          ? (event) => onElementPointerDown?.(event, element)
          : undefined
      }
      onContextMenu={
        interactive
          ? (event) => onElementContextMenu?.(event, element)
          : undefined
      }
    >
      <g
        className={cn(lit && "animate-pulse-subtle")}
        style={
          lit
            ? {
                filter: tableLike
                  ? "drop-shadow(0px 0px 6px color-mix(in srgb, var(--primary) 55%, transparent))"
                  : "drop-shadow(0px 0px 12px rgba(255, 255, 255, 0.8))",
              }
            : undefined
        }
      >
        <VenueElementSymbol
          element={element}
          selected={selected}
          occupancyBySeatId={occupancyBySeatId}
          selectedSeatIds={selectedSeatIds}
          showLabels={showLabels}
          showChairs={showChairs}
          zoom={zoom}
          label={element.type === "standing_zone" ? undefined : labelText}
          onSeatPointerDown={
            onSeatPointerDown
              ? (event, seatId) => {
                  event.stopPropagation()
                  onSeatPointerDown(event, element, seatId)
                }
              : undefined
          }
        />
      </g>
      {element.type === "standing_zone" && showLabels ? (
        <>
          <text
            x={element.x}
            y={element.y - 4}
            textAnchor="middle"
            fill={element.color}
            className="pointer-events-none text-[11px] font-bold"
          >
            {labelText}
          </text>
          <text
            x={element.x}
            y={element.y + 12}
            textAnchor="middle"
            className="pointer-events-none fill-zinc-400 text-[10px]"
          >
            Cupo {element.capacity}
          </text>
        </>
      ) : null}
      {showLabels &&
      element.type !== "vip_chair" &&
      element.type !== "standing_zone" &&
      element.type !== "infrastructure" ? (
        <text
          x={element.x}
          y={element.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={zoom >= 1.2 ? 8 : 7}
          fill={selected ? "#09090B" : "#ffffff"}
          fontWeight={selected ? 900 : 700}
          className="pointer-events-none select-none"
        >
          {labelText}
        </text>
      ) : null}
    </g>
  )
})

export function VenueMapElementLayer({
  elements,
  selectedIds = [],
  selectedSeatIds,
  occupancyBySeatId = {},
  onElementPointerDown,
  onElementContextMenu,
  onSeatPointerDown,
  showSeats = true,
  zoom = 1,
  interactive = true,
  spotlight = false,
  popSelected = true,
  visibleIds = null,
  lodHidden = false,
  highlightedIds = [],
}: {
  elements: VenueMapElement[]
  selectedIds?: string[]
  selectedSeatIds?: string[]
  occupancyBySeatId?: Record<string, "available" | "occupied" | "blocked">
  onElementPointerDown?: (
    event: React.PointerEvent,
    element: VenueMapElement,
  ) => void
  onElementContextMenu?: (
    event: React.MouseEvent,
    element: VenueMapElement,
  ) => void
  onSeatPointerDown?: (
    event: React.PointerEvent,
    element: VenueMapElement,
    seatId: string,
  ) => void
  showSeats?: boolean
  zoom?: number
  interactive?: boolean
  spotlight?: boolean
  popSelected?: boolean
  visibleIds?: Set<string> | null
  lodHidden?: boolean
  highlightedIds?: string[]
}) {
  const selected = new Set(selectedIds)
  const highlighted = new Set(highlightedIds)
  const selectedSeats = useMemo(
    () => new Set(selectedSeatIds ?? []),
    [selectedSeatIds],
  )
  const hasSelection =
    spotlight ||
    selected.size > 0 ||
    highlighted.size > 0 ||
    selectedSeats.size > 0
  const dense = elements.length >= 220
  const veryDense = elements.length >= 800
  const renderLabels = !veryDense && zoom >= 0.8
  const renderChairs = showSeats && (!dense || zoom >= 1.15)
  const ordered = [...elements].sort((left, right) => {
    const leftSelected = selected.has(left.id) ? 1 : 0
    const rightSelected = selected.has(right.id) ? 1 : 0
    return leftSelected - rightSelected
  })

  return (
    <>
      {ordered.map((element) => {
        const visible =
          !lodHidden && (!visibleIds || visibleIds.has(element.id))
        const isSelected =
          selected.has(element.id) ||
          element.seats.some((seat) => selectedSeats.has(seat.id))
        const isHighlighted =
          highlighted.has(element.id) ||
          element.seats.some((seat) => highlighted.has(seat.id))
        return (
          <g
            key={element.id}
            style={{
              opacity: visible ? 1 : 0,
              pointerEvents: visible && interactive ? "auto" : "none",
              transition: "opacity 0.3s ease",
            }}
          >
            <VenueElementShape
              element={element}
              selected={isSelected}
              occupancyBySeatId={occupancyBySeatId}
              selectedSeatIds={selectedSeats}
              onElementPointerDown={
                visible && interactive ? onElementPointerDown : undefined
              }
              onElementContextMenu={
                visible && interactive ? onElementContextMenu : undefined
              }
              onSeatPointerDown={
                visible && interactive ? onSeatPointerDown : undefined
              }
              showLabels={renderLabels || isSelected || isHighlighted}
              showChairs={renderChairs || isSelected}
              interactive={visible && interactive}
              zoom={zoom}
              dimmed={hasSelection && !isSelected && !isHighlighted}
              highlighted={isHighlighted}
              popSelected={popSelected}
            />
          </g>
        )
      })}
    </>
  )
}

export function hasRenderableVenueMap(map: InteractiveVenueMap): boolean {
  return (
    map.sectors.length > 0 ||
    (map.elements?.length ?? 0) > 0 ||
    Boolean(map.stage) ||
    Boolean(map.backgroundImage)
  )
}
