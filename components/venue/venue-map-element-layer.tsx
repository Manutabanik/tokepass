"use client"

import { memo, useMemo } from "react"

import { VenueElementSymbol } from "@/components/admin/venue-svg-symbols"
import { elementHasEditorTestPaint } from "@/lib/seating/editor-stock-lock"
import { isVenueMapElementSoldOut } from "@/lib/seating/map-inventory-hydration"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import {
  compactVenueElementLabel,
  MAP_LABEL_MIN_ZOOM,
  semanticMapLabelScale,
  resolveVenueShapeType,
} from "@/lib/seating/venue-element-geometry"
import { isolateCanvasPointer } from "@/lib/seating/venue-touch"
import { cn } from "@/lib/utils"
import type { InteractiveVenueMap, VenueMapElement } from "@/types/venue-map"

const VenueElementShape = memo(function VenueElementShape({
  element,
  selected,
  occupancyBySeatId,
  selectedSeatIds,
  onElementPointerDown,
  onElementPointerUp,
  onElementPointerEnter,
  onElementPointerLeave,
  onElementContextMenu,
  onSeatPointerDown,
  onSeatPointerUp,
  onElementDoubleClick,
  onSeatDoubleClick,
  selectOnPointerUp = false,
  hitPadding = 0,
  showLabels,
  showChairs,
  showAestheticChairs = true,
  interactive,
  zoom,
  dimmed = false,
  highlighted = false,
  isolationDim = false,
  popSelected = true,
  buyerOccupancy = false,
  soldOut = false,
  testOccupied = false,
  delegateEvents = false,
  allowSoldHits = false,
}: {
  element: VenueMapElement
  selected: boolean
  occupancyBySeatId: Record<string, SeatStatus>
  selectedSeatIds: Set<string>
  onElementPointerDown?: (
    event: React.PointerEvent,
    element: VenueMapElement,
  ) => void
  onElementPointerUp?: (
    event: React.PointerEvent,
    element: VenueMapElement,
  ) => void
  onElementPointerEnter?: (
    event: React.MouseEvent,
    element: VenueMapElement,
  ) => void
  onElementPointerLeave?: (
    event: React.MouseEvent,
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
  onSeatPointerUp?: (
    event: React.PointerEvent,
    element: VenueMapElement,
    seatId: string,
  ) => void
  onElementDoubleClick?: (
    event: React.MouseEvent,
    element: VenueMapElement,
  ) => void
  onSeatDoubleClick?: (
    event: React.MouseEvent,
    element: VenueMapElement,
    seatId: string,
  ) => void
  selectOnPointerUp?: boolean
  hitPadding?: number
  showLabels: boolean
  showChairs: boolean
  showAestheticChairs?: boolean
  interactive: boolean
  zoom: number
  dimmed?: boolean
  highlighted?: boolean
  isolationDim?: boolean
  popSelected?: boolean
  buyerOccupancy?: boolean
  soldOut?: boolean
  testOccupied?: boolean
  delegateEvents?: boolean
  allowSoldHits?: boolean
}) {
  const lit = selected || highlighted
  const transform =
    lit && popSelected && !isolationDim
      ? `translate(${element.x} ${element.y}) scale(1.15) translate(${-element.x} ${-element.y}) rotate(${element.rotation} ${element.x} ${element.y})`
      : `rotate(${element.rotation} ${element.x} ${element.y})`
  const opacity =
    (element.opacity ?? 1) * (isolationDim ? 0.3 : dimmed && !lit ? 0.7 : 1)
  const labelText = compactVenueElementLabel(
    element.customLabel || element.label,
    lit ? 99 : zoom,
  )
  const tableLike =
    element.type !== "standing_zone" &&
    element.type !== "vip_chair" &&
    element.type !== "infrastructure"
  const shape = resolveVenueShapeType(element)
  const acceptHits = interactive && (!soldOut || allowSoldHits)
  const liveHit = acceptHits && hitPadding > 0
  const padW = Math.max(8, element.width || 12)
  const padH = Math.max(8, element.height || 12)
  const padR = Math.max(8, Math.min(padW, padH) / 2)

  return (
    <g
      id={`venue-sel-${element.id}`}
      data-inventory="element"
      data-element-id={element.id}
      data-locked={soldOut ? "1" : undefined}
      data-test-stock={testOccupied && !soldOut ? "1" : undefined}
      transform={transform}
      opacity={opacity}
      className={
        interactive && !isolationDim
          ? soldOut
            ? "cursor-not-allowed transition-all duration-200 ease-in-out"
            : "cursor-pointer transition-all duration-200 ease-in-out"
          : "pointer-events-none transition-all duration-200 ease-in-out"
      }
      style={
        isolationDim
          ? { filter: "grayscale(1)" }
          : soldOut
            ? { cursor: "not-allowed", filter: "grayscale(1)" }
            : undefined
      }
      onPointerDown={
        !delegateEvents && acceptHits && !selectOnPointerUp
          ? (event) => onElementPointerDown?.(event, element)
          : undefined
      }
      onPointerUp={
        !delegateEvents && acceptHits && selectOnPointerUp
          ? (event) => {
              isolateCanvasPointer(event)
              onElementPointerUp?.(event, element)
            }
          : undefined
      }
      onClick={
        !delegateEvents && acceptHits
          ? (event) => {
              isolateCanvasPointer(event)
              event.preventDefault()
            }
          : undefined
      }
      onMouseEnter={
        !delegateEvents && acceptHits
          ? (event) => onElementPointerEnter?.(event, element)
          : undefined
      }
      onMouseLeave={
        !delegateEvents && acceptHits
          ? (event) => onElementPointerLeave?.(event, element)
          : undefined
      }
      onContextMenu={
        !delegateEvents && acceptHits
          ? (event) => onElementContextMenu?.(event, element)
          : undefined
      }
      onDoubleClick={
        !delegateEvents && acceptHits
          ? (event) => {
              isolateCanvasPointer(event)
              event.preventDefault()
              onElementDoubleClick?.(event, element)
            }
          : undefined
      }
    >
      {liveHit ? (
        shape === "round_table" ? (
          <circle
            cx={element.x}
            cy={element.y}
            r={padR + hitPadding}
            fill="transparent"
            stroke="none"
            pointerEvents="all"
          />
        ) : (
          <rect
            x={element.x - padW / 2 - hitPadding}
            y={element.y - padH / 2 - hitPadding}
            width={padW + hitPadding * 2}
            height={padH + hitPadding * 2}
            fill="transparent"
            stroke="none"
            pointerEvents="all"
          />
        )
      ) : null}
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
          showAestheticChairs={showAestheticChairs}
          zoom={zoom}
          label={element.type === "standing_zone" ? undefined : labelText}
          onSeatPointerDown={
            !delegateEvents && onSeatPointerDown && !soldOut && !selectOnPointerUp
              ? (event, seatId) => {
                  isolateCanvasPointer(event)
                  onSeatPointerDown(event, element, seatId)
                }
              : undefined
          }
          onSeatPointerUp={
            !delegateEvents && onSeatPointerUp && (!soldOut || selectOnPointerUp)
              ? (event, seatId) => {
                  isolateCanvasPointer(event)
                  onSeatPointerUp(event, element, seatId)
                }
              : undefined
          }
          hitPadding={hitPadding}
          onSeatDoubleClick={
            !delegateEvents && onSeatDoubleClick
              ? (event, seatId) => {
                  isolateCanvasPointer(event)
                  event.preventDefault()
                  onSeatDoubleClick(event, element, seatId)
                }
              : undefined
          }
          buyerOccupancy={buyerOccupancy}
        />
      </g>
      {testOccupied && !soldOut ? (
        <>
          {shape === "round_table" ? (
            <circle
              cx={element.x}
              cy={element.y}
              r={padR + 4}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={1.6}
              strokeDasharray="5 3"
              pointerEvents="none"
            />
          ) : (
            <rect
              x={element.x - padW / 2 - 3}
              y={element.y - padH / 2 - 3}
              width={padW + 6}
              height={padH + 6}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={1.6}
              strokeDasharray="5 3"
              rx={4}
              pointerEvents="none"
            />
          )}
          <text
            x={element.x}
            y={element.y - padH / 2 - 8}
            textAnchor="middle"
            fontSize={7 * semanticMapLabelScale(zoom)}
            fill="#f59e0b"
            fontWeight={800}
            className="pointer-events-none select-none"
          >
            TEST
          </text>
        </>
      ) : null}
      {element.type === "standing_zone" && showLabels ? (
        <>
          <text
            x={element.x}
            y={element.y - 4}
            textAnchor="middle"
            fill={element.color}
            fontSize={11 * semanticMapLabelScale(zoom)}
            className="pointer-events-none font-bold"
          >
            {labelText}
          </text>
          <text
            x={element.x}
            y={element.y + 12}
            textAnchor="middle"
            fontSize={10 * semanticMapLabelScale(zoom)}
            className="pointer-events-none fill-zinc-400"
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
          fontSize={8 * semanticMapLabelScale(zoom)}
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

export const VenueMapElementLayer = memo(function VenueMapElementLayer({
  elements,
  selectedIds = [],
  selectedSeatIds,
  occupancyBySeatId = {},
  testOccupancyBySeatId = {},
  onElementPointerDown,
  onElementPointerUp,
  onElementPointerEnter,
  onElementPointerLeave,
  onElementContextMenu,
  onSeatPointerDown,
  onSeatPointerUp,
  onElementDoubleClick,
  onSeatDoubleClick,
  selectOnPointerUp = false,
  hitPadding = 0,
  showSeats = true,
  showAestheticChairs = true,
  zoom = 1,
  interactive = true,
  spotlight = false,
  popSelected = true,
  visibleIds = null,
  lodHidden = false,
  highlightedIds = [],
  isolationDimIds = null,
  buyerOccupancy = false,
  preserveOrder = false,
  delegateEvents = false,
  allowSoldHits = false,
}: {
  elements: VenueMapElement[]
  selectedIds?: string[]
  selectedSeatIds?: string[]
  occupancyBySeatId?: Record<string, SeatStatus>
  testOccupancyBySeatId?: Record<string, SeatStatus>
  onElementPointerDown?: (
    event: React.PointerEvent,
    element: VenueMapElement,
  ) => void
  onElementPointerUp?: (
    event: React.PointerEvent,
    element: VenueMapElement,
  ) => void
  onElementPointerEnter?: (
    event: React.MouseEvent,
    element: VenueMapElement,
  ) => void
  onElementPointerLeave?: (
    event: React.MouseEvent,
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
  onSeatPointerUp?: (
    event: React.PointerEvent,
    element: VenueMapElement,
    seatId: string,
  ) => void
  onElementDoubleClick?: (
    event: React.MouseEvent,
    element: VenueMapElement,
  ) => void
  onSeatDoubleClick?: (
    event: React.MouseEvent,
    element: VenueMapElement,
    seatId: string,
  ) => void
  selectOnPointerUp?: boolean
  hitPadding?: number
  showSeats?: boolean
  /** Decorative chair ring on closed blocks. Never hides sellable seats. */
  showAestheticChairs?: boolean
  zoom?: number
  interactive?: boolean
  spotlight?: boolean
  popSelected?: boolean
  visibleIds?: Set<string> | null
  lodHidden?: boolean
  highlightedIds?: string[]
  isolationDimIds?: Set<string> | null
  buyerOccupancy?: boolean
  preserveOrder?: boolean
  delegateEvents?: boolean
  allowSoldHits?: boolean
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
  const renderLabels = !veryDense && zoom >= MAP_LABEL_MIN_ZOOM
  const renderChairs = showSeats && (!dense || zoom >= 0.7)
  const ordered = preserveOrder
    ? elements
    : [...elements].sort((left, right) => {
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
        const isolationDim = Boolean(isolationDimIds?.has(element.id))
        const soldOut =
          isVenueMapElementSoldOut(element, occupancyBySeatId) ||
          element.isLocked === true
        const testOccupied = elementHasEditorTestPaint(
          element,
          testOccupancyBySeatId,
          occupancyBySeatId,
        )
        if (!visible) return null
        return (
          <g
            key={element.id}
            style={{
              pointerEvents:
                interactive && (!soldOut || allowSoldHits) ? "auto" : "none",
            }}
          >
            <VenueElementShape
              element={element}
              selected={isSelected}
              occupancyBySeatId={occupancyBySeatId}
              selectedSeatIds={selectedSeats}
              soldOut={soldOut}
              testOccupied={testOccupied}
              onElementPointerDown={
                visible && interactive ? onElementPointerDown : undefined
              }
              onElementPointerUp={
                visible && interactive ? onElementPointerUp : undefined
              }
              selectOnPointerUp={selectOnPointerUp}
              hitPadding={hitPadding}
              onElementPointerEnter={
                visible && interactive ? onElementPointerEnter : undefined
              }
              onElementPointerLeave={
                visible && interactive ? onElementPointerLeave : undefined
              }
              onElementContextMenu={
                visible && interactive ? onElementContextMenu : undefined
              }
              onSeatPointerDown={
                visible && interactive ? onSeatPointerDown : undefined
              }
              onSeatPointerUp={
                visible && interactive ? onSeatPointerUp : undefined
              }
              onElementDoubleClick={
                visible && interactive ? onElementDoubleClick : undefined
              }
              onSeatDoubleClick={
                visible && interactive ? onSeatDoubleClick : undefined
              }
              showLabels={renderLabels || isSelected || isHighlighted}
              showChairs={renderChairs || isSelected}
              showAestheticChairs={showAestheticChairs}
              interactive={
                visible &&
                interactive &&
                !isolationDim &&
                (!soldOut || allowSoldHits)
              }
              zoom={zoom}
              dimmed={
                isolationDim || (hasSelection && !isSelected && !isHighlighted)
              }
              isolationDim={isolationDim}
              highlighted={isHighlighted}
              popSelected={popSelected}
              buyerOccupancy={buyerOccupancy}
              delegateEvents={delegateEvents}
              allowSoldHits={allowSoldHits}
            />
          </g>
        )
      })}
    </>
  )
})

export function hasRenderableVenueMap(map: InteractiveVenueMap): boolean {
  return (
    map.sectors.length > 0 ||
    (map.elements?.length ?? 0) > 0 ||
    Boolean(map.stage) ||
    Boolean(map.backgroundImage)
  )
}
