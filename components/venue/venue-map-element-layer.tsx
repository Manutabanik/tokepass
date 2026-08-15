"use client"

import { memo, useMemo } from "react"

import { VenueElementSymbol } from "@/components/admin/venue-svg-symbols"
import type { InteractiveVenueMap, VenueMapElement } from "@/types/venue-map"
import { compactVenueElementLabel } from "@/lib/seating/venue-element-geometry"

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
  popSelected?: boolean
}) {
  const transform =
    selected && popSelected
      ? `translate(${element.x} ${element.y}) scale(1.15) translate(${-element.x} ${-element.y}) rotate(${element.rotation} ${element.x} ${element.y})`
      : `rotate(${element.rotation} ${element.x} ${element.y})`
  const opacity = (element.opacity ?? 1) * (dimmed ? 0.4 : 1)
  const labelText = compactVenueElementLabel(element.label, selected ? 99 : zoom)

  return (
    <g
      id={`venue-sel-${element.id}`}
      transform={transform}
      opacity={opacity}
      className={
        interactive
          ? "transition-all duration-200 ease-in-out"
          : "pointer-events-none transition-all duration-200 ease-in-out"
      }
      style={
        selected
          ? { filter: "drop-shadow(0px 0px 8px rgba(255, 255, 255, 0.8))" }
          : undefined
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
          className="pointer-events-none select-none fill-white font-bold"
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
}) {
  const selected = new Set(selectedIds)
  const hasSelection =
    spotlight || selected.size > 0 || (selectedSeatIds?.length ?? 0) > 0
  const selectedSeats = useMemo(
    () => new Set(selectedSeatIds ?? []),
    [selectedSeatIds],
  )
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
              selected={selected.has(element.id)}
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
              showLabels={renderLabels || selected.has(element.id)}
              showChairs={renderChairs || selected.has(element.id)}
              interactive={visible && interactive}
              zoom={zoom}
              dimmed={hasSelection && !selected.has(element.id)}
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
