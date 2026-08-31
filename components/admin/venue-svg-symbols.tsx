"use client"

import {
  ChefHat,
  DoorOpen,
  LogIn,
  Music2,
  ParkingCircle,
  Sparkles,
  Toilet as Restroom,
  Utensils,
  type LucideIcon,
} from "lucide-react"

import {
  BUYER_SEAT_FILL,
  BUYER_SOLD_OPACITY,
  buyerSeatPaint,
} from "@/lib/seating/buyer-seat-fill"
import { lookupOccupancyStatus } from "@/lib/seating/venue-map-occupancy"
import {
  resolveVenueShapeType,
  VENUE_SHAPE,
} from "@/lib/seating/venue-element-geometry"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import type { VenueMapElement, VenueMapElementSeat, VenueShapeType } from "@/types/venue-map"

export const CHAIR_DOT_RADIUS = VENUE_SHAPE.chairRadius

type Occupancy = "available" | "occupied" | "blocked" | "selected" | "held"

function seatInteractionProps(
  seatId: string | undefined,
  onSeatPointerDown?: (event: React.PointerEvent, seatId: string) => void,
  onSeatDoubleClick?: (event: React.MouseEvent, seatId: string) => void,
  locked = false,
  onSeatPointerUp?: (event: React.PointerEvent, seatId: string) => void,
) {
  if (!seatId) return undefined
  return {
    "data-seat-id": seatId,
    "data-locked": locked ? "1" : undefined,
    className: locked ? "pointer-events-none" : undefined,
    style: locked ? { pointerEvents: "none" as const } : undefined,
    onPointerDown:
      !locked && onSeatPointerDown
        ? (event: React.PointerEvent) => onSeatPointerDown(event, seatId)
        : undefined,
    onPointerUp:
      !locked && onSeatPointerUp
        ? (event: React.PointerEvent) => onSeatPointerUp(event, seatId)
        : undefined,
    onDoubleClick:
      !locked && onSeatDoubleClick
        ? (event: React.MouseEvent) => {
            event.stopPropagation()
            event.preventDefault()
            onSeatDoubleClick(event, seatId)
          }
        : undefined,
  }
}

function expandedChairHit(
  x: number,
  y: number,
  seatId: string | undefined,
  hitPadding: number,
  onSeatPointerDown?: (event: React.PointerEvent, seatId: string) => void,
  onSeatDoubleClick?: (event: React.MouseEvent, seatId: string) => void,
  onSeatPointerUp?: (event: React.PointerEvent, seatId: string) => void,
  locked = false,
) {
  if (!seatId || locked) return null
  if (
    !onSeatPointerDown &&
    !onSeatDoubleClick &&
    !onSeatPointerUp &&
    hitPadding <= 0
  ) {
    return null
  }
  return (
    <circle
      cx={x}
      cy={y}
      r={Math.max(CHAIR_DOT_RADIUS, 11) + hitPadding}
      fill="transparent"
      stroke="transparent"
      strokeWidth={14}
      {...seatInteractionProps(
        seatId,
        onSeatPointerDown,
        onSeatDoubleClick,
        false,
        onSeatPointerUp,
      )}
    />
  )
}

type OccupancyMap = Record<string, Occupancy | SeatStatus | "available" | "occupied" | "blocked">

function seatState(
  seat: VenueMapElementSeat,
  occupancyBySeatId: OccupancyMap,
  selectedSeatIds: Set<string>,
  parentIds: Array<string | null | undefined> = [],
): Occupancy {
  if (selectedSeatIds.has(seat.id)) return "selected"
  for (const id of parentIds) {
    if (id && selectedSeatIds.has(id)) return "selected"
  }
  const live = lookupOccupancyStatus(
    occupancyBySeatId,
    seat.id,
    ...parentIds,
  )
  if (live === "occupied" || live === "blocked" || live === "held") {
    return live
  }
  if (seat.status === "blocked") return "blocked"
  return "available"
}

function elementOccupancyState(
  occupancyBySeatId: OccupancyMap,
  ...ids: Array<string | null | undefined>
): Occupancy {
  const live = lookupOccupancyStatus(occupancyBySeatId, ...ids)
  if (live === "occupied" || live === "blocked" || live === "held") return live
  return "available"
}

function fillFor(
  color: string,
  state: Occupancy,
  buyerOccupancy = false,
) {
  if (buyerOccupancy) {
    if (state === "held") return BUYER_SEAT_FILL.held
    if (state === "occupied" || state === "blocked") return BUYER_SEAT_FILL.sold
    return color || BUYER_SEAT_FILL.available
  }
  if (state === "held") return BUYER_SEAT_FILL.held
  if (state === "selected") return "#34d399"
  if (state === "occupied" || state === "blocked") return "#ef4444"
  return color || "#22c55e"
}

function strokeFor(
  color: string,
  selected: boolean,
  state: Occupancy = "available",
  buyerOccupancy = false,
) {
  if (buyerOccupancy) {
    if (state === "held") return "#c2410c"
    if (selected || state === "selected") return "#10b981"
    if (state === "occupied" || state === "blocked") return BUYER_SEAT_FILL.sold
    return color || BUYER_SEAT_FILL.available
  }
  if (state === "held") return "#c2410c"
  if (selected || state === "selected") return "#ffffff"
  if (state === "occupied" || state === "blocked") return "#7f1d1d"
  return color
}

function occupancyOpacity(
  state: Occupancy,
  buyerOccupancy: boolean,
  occupiedFallback: number,
  availableFallback = 0.95,
) {
  if (state === "occupied" || state === "blocked") {
    return buyerOccupancy ? BUYER_SOLD_OPACITY : occupiedFallback
  }
  if (state === "held") return 0.5
  return buyerOccupancy ? 1 : availableFallback
}

const TABLE_SELECTED_FILL = "#f4f4f5"
const TABLE_SELECTED_FILL_OPACITY = 0.96

function tableSurfaceProps(
  color: string,
  selected: boolean,
  state: Occupancy = "available",
  buyerOccupancy = false,
) {
  if (buyerOccupancy && !selected) {
    if (state === "occupied" || state === "blocked") {
      return {
        fill: BUYER_SEAT_FILL.sold,
        fillOpacity: BUYER_SOLD_OPACITY,
        stroke: BUYER_SEAT_FILL.sold,
        strokeWidth: 1.4,
        className: undefined,
      }
    }
    if (state === "held") {
      return {
        fill: BUYER_SEAT_FILL.held,
        fillOpacity: 0.55,
        stroke: "#c2410c",
        strokeWidth: 1.4,
        className: undefined,
      }
    }
  }
  return {
    fill: selected ? TABLE_SELECTED_FILL : color,
    fillOpacity: selected ? TABLE_SELECTED_FILL_OPACITY : 0.28,
    stroke: selected ? "var(--primary)" : color,
    strokeWidth: selected ? 3 : 1.4,
    className: selected ? "stroke-primary" : undefined,
  }
}

export function TheatreSeatSymbol({
  cx,
  cy,
  width = VENUE_SHAPE.theatreSeat,
  height = VENUE_SHAPE.theatreSeat,
  color,
  selected = false,
  occupied = false,
  held = false,
  rotation = 0,
  label,
  showLabel = false,
  buyerOccupancy = false,
}: {
  cx: number
  cy: number
  width?: number
  height?: number
  color: string
  selected?: boolean
  occupied?: boolean
  held?: boolean
  rotation?: number
  label?: string
  showLabel?: boolean
  buyerOccupancy?: boolean
}) {
  const w = Math.max(10, width)
  const h = Math.max(10, height)
  const state: Occupancy = occupied
    ? "occupied"
    : held
      ? "held"
      : selected
        ? "selected"
        : "available"
  const fill = fillFor(color, state, buyerOccupancy)
  const stroke = strokeFor(color, selected, state, buyerOccupancy)
  const rxBack = Math.min(3.2, w * 0.22)
  const rxSeat = Math.min(2.4, w * 0.18)
  const fontSize = Math.max(5, Math.min(7.5, w * 0.42))
  const selectedGlow = buyerOccupancy
    ? "drop-shadow(0px 0px 10px rgba(16, 185, 129, 0.9))"
    : "drop-shadow(0px 0px 8px rgba(255, 255, 255, 0.8))"

  return (
    <g
      transform={`rotate(${rotation} ${cx} ${cy})`}
      className="transition-all duration-200 ease-in-out"
      style={selected ? { filter: selectedGlow } : undefined}
    >
      <rect
        x={cx - w * 0.42}
        y={cy - h * 0.5}
        width={w * 0.84}
        height={h * 0.32}
        rx={rxBack}
        fill={fill}
        fillOpacity={occupancyOpacity(state, buyerOccupancy, 0.4, 0.95)}
        stroke={stroke}
        strokeWidth={selected ? (buyerOccupancy ? 2.4 : 3) : 0.9}
      />
      <rect
        x={cx - w * 0.4}
        y={cy - h * 0.14}
        width={w * 0.8}
        height={h * 0.58}
        rx={rxSeat}
        fill={fill}
        fillOpacity={occupancyOpacity(state, buyerOccupancy, 0.35, 0.82)}
        stroke={stroke}
        strokeWidth={selected ? (buyerOccupancy ? 2.4 : 3) : 0.9}
      />
      {showLabel && label ? (
        <text
          x={cx}
          y={cy + h * 0.16}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          className="pointer-events-none select-none fill-white font-bold"
        >
          {label}
        </text>
      ) : null}
    </g>
  )
}

export function RoundTableSymbol({
  cx,
  cy,
  radius,
  color,
  selected = false,
  chairs,
  occupancyBySeatId = {},
  selectedSeatIds,
  parentIds = [],
  onSeatPointerDown,
  onSeatDoubleClick,
  onSeatPointerUp,
  buyerOccupancy = false,
  hitPadding = 0,
}: {
  cx: number
  cy: number
  radius: number
  color: string
  selected?: boolean
  chairs: VenueMapElementSeat[]
  occupancyBySeatId?: OccupancyMap
  parentIds?: Array<string | null | undefined>
  selectedSeatIds: Set<string>
  onSeatPointerDown?: (event: React.PointerEvent, seatId: string) => void
  onSeatDoubleClick?: (event: React.MouseEvent, seatId: string) => void
  onSeatPointerUp?: (event: React.PointerEvent, seatId: string) => void
  buyerOccupancy?: boolean
  hitPadding?: number
}) {
  const r = Math.max(8, radius)
  const orbit = r + CHAIR_DOT_RADIUS + 2
  const count = chairs.length
  const tableState = elementOccupancyState(occupancyBySeatId, ...parentIds)

  return (
    <g>
      {Array.from({ length: count }, (_, index) => {
        const seat = chairs[index]
        const angle = (index / count) * Math.PI * 2
        const x = cx + Math.cos(angle) * orbit
        const y = cy + Math.sin(angle) * orbit
        const state = seat
          ? seatState(seat, occupancyBySeatId, selectedSeatIds, parentIds)
          : tableState
        const locked = state === "occupied" || state === "blocked"
        return (
          <g key={seat?.id ?? `chair-${index}`}>
            {expandedChairHit(
              x,
              y,
              seat?.id,
              hitPadding,
              onSeatPointerDown,
              onSeatDoubleClick,
              onSeatPointerUp,
              locked,
            )}
            <circle
              cx={x}
              cy={y}
              r={CHAIR_DOT_RADIUS}
              fill={fillFor(color, state, buyerOccupancy)}
              fillOpacity={occupancyOpacity(state, buyerOccupancy, 0.4)}
              stroke={strokeFor(color, selected, state, buyerOccupancy)}
              strokeWidth={state === "selected" || selected ? 1.8 : 0.7}
              {...seatInteractionProps(
                seat?.id,
                onSeatPointerDown,
                onSeatDoubleClick,
                locked,
                onSeatPointerUp,
              )}
            />
          </g>
        )
      })}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        {...tableSurfaceProps(color, selected, tableState, buyerOccupancy)}
      />
    </g>
  )
}

export function LongTableSymbol({
  cx,
  cy,
  width,
  height,
  color,
  selected = false,
  roundedCorner = 4,
  sideA,
  sideB,
  chairs,
  occupancyBySeatId = {},
  selectedSeatIds,
  parentIds = [],
  onSeatPointerDown,
  onSeatDoubleClick,
  onSeatPointerUp,
  buyerOccupancy = false,
  hitPadding = 0,
}: {
  cx: number
  cy: number
  width: number
  height: number
  color: string
  selected?: boolean
  roundedCorner?: number
  sideA: number
  sideB: number
  chairs: VenueMapElementSeat[]
  occupancyBySeatId?: OccupancyMap
  parentIds?: Array<string | null | undefined>
  selectedSeatIds: Set<string>
  onSeatPointerDown?: (event: React.PointerEvent, seatId: string) => void
  onSeatDoubleClick?: (event: React.MouseEvent, seatId: string) => void
  onSeatPointerUp?: (event: React.PointerEvent, seatId: string) => void
  buyerOccupancy?: boolean
  hitPadding?: number
}) {
  const w = Math.max(8, width)
  const h = Math.max(8, height)
  const rx = Math.max(0, Math.min(roundedCorner, Math.min(w, h) / 2))
  const inset = Math.min(8, w / 4)
  const offset = h / 2 + CHAIR_DOT_RADIUS + 2
  const tableState = elementOccupancyState(occupancyBySeatId, ...parentIds)

  function dots(count: number, y: number, startIndex: number) {
    const safe = Math.max(0, count)
    return Array.from({ length: safe }, (_, index) => {
      const t = safe === 1 ? 0.5 : index / (safe - 1)
      const x = cx - w / 2 + inset + t * (w - inset * 2)
      const seat = chairs[startIndex + index]
      const state = seat
        ? seatState(seat, occupancyBySeatId, selectedSeatIds, parentIds)
        : tableState
      const locked = state === "occupied" || state === "blocked"
      return (
        <g key={seat?.id ?? `side-${y}-${index}`}>
          {expandedChairHit(
            x,
            y,
            seat?.id,
            hitPadding,
            onSeatPointerDown,
            onSeatDoubleClick,
            onSeatPointerUp,
            locked,
          )}
          <circle
            cx={x}
            cy={y}
            r={CHAIR_DOT_RADIUS}
            fill={fillFor(color, state, buyerOccupancy)}
            fillOpacity={occupancyOpacity(state, buyerOccupancy, 0.4)}
            stroke={strokeFor(color, selected, state, buyerOccupancy)}
            strokeWidth={state === "selected" || selected ? 1.1 : 0.7}
            {...seatInteractionProps(
              seat?.id,
              onSeatPointerDown,
              onSeatDoubleClick,
              locked,
              onSeatPointerUp,
            )}
          />
        </g>
      )
    })
  }

  return (
    <g>
      {dots(sideA, cy - offset, 0)}
      {dots(sideB, cy + offset, sideA)}
      <rect
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={rx}
        {...tableSurfaceProps(color, selected, tableState, buyerOccupancy)}
      />
    </g>
  )
}

export function VipBoxSymbol({
  cx,
  cy,
  width,
  height,
  color,
  selected = false,
  roundedCorner = 6,
  chairs = [],
  occupancyBySeatId = {},
  selectedSeatIds,
  parentIds = [],
  onSeatPointerDown,
  onSeatDoubleClick,
  onSeatPointerUp,
  buyerOccupancy = false,
  hitPadding = 0,
}: {
  cx: number
  cy: number
  width: number
  height: number
  color: string
  selected?: boolean
  roundedCorner?: number
  chairs?: VenueMapElementSeat[]
  occupancyBySeatId?: OccupancyMap
  parentIds?: Array<string | null | undefined>
  selectedSeatIds?: Set<string>
  onSeatPointerDown?: (event: React.PointerEvent, seatId: string) => void
  onSeatDoubleClick?: (event: React.MouseEvent, seatId: string) => void
  onSeatPointerUp?: (event: React.PointerEvent, seatId: string) => void
  buyerOccupancy?: boolean
  hitPadding?: number
}) {
  const w = Math.max(24, width)
  const h = Math.max(18, height)
  const rx = Math.max(2, Math.min(roundedCorner, 10))
  const tableState = elementOccupancyState(occupancyBySeatId, ...parentIds)
  const paint = buyerOccupancy
    ? buyerSeatPaint(
        tableState === "occupied" || tableState === "blocked"
          ? "sold"
          : tableState,
      )
    : null
  const stroke = paint?.fillColor ?? color
  const surface = tableSurfaceProps(color, selected, tableState, buyerOccupancy)
  const arm = Math.max(7, w * 0.16)
  const back = Math.max(6, h * 0.22)
  const tableW = w * 0.28
  const tableH = h * 0.22
  const selectedSet = selectedSeatIds ?? new Set<string>()
  const count = chairs.length
  const cols = Math.max(1, Math.ceil(count / 2))

  return (
    <g>
      <rect
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={rx}
        fill={surface.fill}
        fillOpacity={surface.fillOpacity}
        stroke={surface.stroke}
        strokeWidth={surface.strokeWidth}
        className={surface.className}
      />
      <rect
        x={cx - w / 2 + 3}
        y={cy - h / 2 + 3}
        width={w - 6}
        height={back}
        rx={3}
        fill={paint?.fillColor ?? color}
        fillOpacity={paint ? paint.opacity : 0.55}
        stroke={stroke}
        strokeWidth={0.8}
      />
      <rect
        x={cx - w / 2 + 3}
        y={cy - h / 2 + 3}
        width={arm}
        height={h - 6}
        rx={3}
        fill={paint?.fillColor ?? color}
        fillOpacity={paint ? paint.opacity : 0.5}
        stroke={stroke}
        strokeWidth={0.8}
      />
      <rect
        x={cx + w / 2 - 3 - arm}
        y={cy - h / 2 + 3}
        width={arm}
        height={h - 6}
        rx={3}
        fill={paint?.fillColor ?? color}
        fillOpacity={paint ? paint.opacity : 0.5}
        stroke={stroke}
        strokeWidth={0.8}
      />
      <ellipse
        cx={cx}
        cy={cy + h * 0.12}
        rx={tableW / 2}
        ry={tableH / 2}
        fill={paint?.fillColor ?? color}
        fillOpacity={paint ? paint.opacity : 0.35}
        stroke={stroke}
        strokeWidth={0.9}
      />
      {chairs.map((seat, index) => {
        const col = index % cols
        const row = Math.floor(index / cols)
        const x = cx - (cols - 1) * 8 + col * 16
        const y = cy - 10 + row * 18
        const state = seatState(seat, occupancyBySeatId, selectedSet, parentIds)
        const locked = state === "occupied" || state === "blocked"
        return (
          <g key={seat.id}>
            {expandedChairHit(
              x,
              y,
              seat.id,
              hitPadding,
              onSeatPointerDown,
              onSeatDoubleClick,
              onSeatPointerUp,
              locked,
            )}
            <circle
              cx={x}
              cy={y}
              r={2.2}
              fill={fillFor(color, state, buyerOccupancy)}
              fillOpacity={occupancyOpacity(state, buyerOccupancy, 0.4)}
              stroke={strokeFor(color, selected, state, buyerOccupancy)}
              strokeWidth={state === "selected" ? 1.2 : 0.6}
              {...seatInteractionProps(
                seat.id,
                onSeatPointerDown,
                onSeatDoubleClick,
                locked,
                onSeatPointerUp,
              )}
            />
          </g>
        )
      })}
    </g>
  )
}

function InfraIcon({
  icon: Icon,
  cx,
  cy,
  size,
}: {
  icon: LucideIcon
  cx: number
  cy: number
  size: number
}) {
  return (
    <g transform={`translate(${cx - size / 2} ${cy - size / 2})`} className="pointer-events-none">
      <Icon
        width={size}
        height={size}
        strokeWidth={1.75}
        className="text-zinc-700 dark:text-zinc-200"
        aria-hidden
      />
    </g>
  )
}

export function InfrastructureSymbols({
  cx,
  cy,
  width,
  height,
  selected = false,
  shapeType,
  subtype,
  roundedCorner = 8,
  label,
  showLabel = true,
}: {
  cx: number
  cy: number
  width: number
  height: number
  selected?: boolean
  shapeType: VenueShapeType
  subtype?: VenueMapElement["subtype"]
  roundedCorner?: number
  label?: string
  showLabel?: boolean
}) {
  const w = Math.max(20, width)
  const h = Math.max(16, height)
  const rx = Math.max(2, Math.min(roundedCorner, 12))
  const iconSize = Math.max(12, Math.min(26, Math.min(w, h) * 0.42))
  const icon =
    shapeType === "infra_bar" || subtype === "bar"
      ? Utensils
      : shapeType === "infra_restroom" || subtype === "restroom"
        ? Restroom
        : shapeType === "infra_door" || subtype === "entrance"
          ? LogIn
          : subtype === "exit"
            ? DoorOpen
            : subtype === "parking"
              ? ParkingCircle
              : subtype === "dj_booth"
                ? Music2
                : subtype === "kitchen"
                  ? ChefHat
                  : Sparkles

  return (
    <g>
      <rect
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={rx}
        className={
          selected
            ? "fill-zinc-200/90 stroke-emerald-400 dark:fill-zinc-700/90"
            : "fill-zinc-300/80 stroke-zinc-500 dark:fill-zinc-800/90 dark:stroke-zinc-500"
        }
        strokeWidth={selected ? 2 : 1.2}
      />
      <InfraIcon icon={icon} cx={cx} cy={showLabel ? cy - 5 : cy} size={iconSize} />
      {showLabel && label ? (
        <text
          x={cx}
          y={cy + iconSize / 2 + 4}
          textAnchor="middle"
          className="pointer-events-none fill-zinc-700 text-[8px] font-bold tracking-wide dark:fill-zinc-200"
        >
          {label}
        </text>
      ) : null}
    </g>
  )
}

export function StandingZoneSymbol({
  cx,
  cy,
  width,
  height,
  color,
  selected = false,
  roundedCorner = 12,
  occupancy = "available",
  buyerOccupancy = false,
}: {
  cx: number
  cy: number
  width: number
  height: number
  color: string
  selected?: boolean
  roundedCorner?: number
  occupancy?: Occupancy
  buyerOccupancy?: boolean
}) {
  const w = Math.max(24, width)
  const h = Math.max(18, height)
  const rx = Math.max(4, Math.min(roundedCorner, 16))
  const fill = fillFor(color, occupancy, buyerOccupancy)
  return (
    <rect
      x={cx - w / 2}
      y={cy - h / 2}
      width={w}
      height={h}
      rx={rx}
      fill={fill}
      fillOpacity={occupancyOpacity(occupancy, buyerOccupancy, 0.16, 0.16)}
      stroke={strokeFor(color, selected, occupancy, buyerOccupancy)}
      strokeWidth={selected ? 3.2 : 1.4}
      strokeDasharray="5 3"
    />
  )
}

export function VenueElementSymbol({
  element,
  selected = false,
  occupancyBySeatId = {},
  selectedSeatIds,
  showLabels = true,
  showChairs = true,
  zoom = 1,
  label,
  onSeatPointerDown,
  onSeatDoubleClick,
  onSeatPointerUp,
  buyerOccupancy = false,
  hitPadding = 0,
}: {
  element: VenueMapElement
  selected?: boolean
  occupancyBySeatId?: OccupancyMap
  selectedSeatIds: Set<string>
  showLabels?: boolean
  showChairs?: boolean
  zoom?: number
  label?: string
  onSeatPointerDown?: (event: React.PointerEvent, seatId: string) => void
  onSeatDoubleClick?: (event: React.MouseEvent, seatId: string) => void
  onSeatPointerUp?: (event: React.PointerEvent, seatId: string) => void
  buyerOccupancy?: boolean
  hitPadding?: number
}) {
  const shape = resolveVenueShapeType(element)
  const color = element.color
  const rx = element.roundedCorner
  const chairs = showChairs ? (element.seats ?? []) : []
  const parentIds = [element.id]
  const live = elementOccupancyState(
    occupancyBySeatId,
    element.id,
    ...chairs.map((seat) => seat.id),
  )
  const occupied = live === "occupied" || live === "blocked"
  const held = live === "held"

  if (shape === "theatre_seat") {
    return (
      <TheatreSeatSymbol
        cx={element.x}
        cy={element.y}
        width={element.width || VENUE_SHAPE.theatreSeat}
        height={element.height || VENUE_SHAPE.theatreSeat}
        color={color}
        selected={selected}
        occupied={occupied && !selected}
        held={held && !selected}
        label={label}
        showLabel={showLabels}
        buyerOccupancy={buyerOccupancy}
      />
    )
  }
  if (shape === "round_table") {
    const radius = Math.max(8, Math.min(element.width || 28, element.height || 28) / 2)
    return (
      <RoundTableSymbol
        cx={element.x}
        cy={element.y}
        radius={radius}
        color={color}
        selected={selected}
        chairs={chairs}
        occupancyBySeatId={occupancyBySeatId}
        parentIds={parentIds}
        selectedSeatIds={selectedSeatIds}
        onSeatPointerDown={onSeatPointerDown}
        onSeatDoubleClick={onSeatDoubleClick}
        onSeatPointerUp={onSeatPointerUp}
        buyerOccupancy={buyerOccupancy}
        hitPadding={hitPadding}
      />
    )
  }
  if (shape === "long_table") {
    return (
      <LongTableSymbol
        cx={element.x}
        cy={element.y}
        width={element.width}
        height={element.height}
        color={color}
        selected={selected}
        roundedCorner={rx ?? 4}
        sideA={showChairs ? element.sideA : 0}
        sideB={showChairs ? element.sideB : 0}
        chairs={chairs}
        occupancyBySeatId={occupancyBySeatId}
        parentIds={parentIds}
        selectedSeatIds={selectedSeatIds}
        onSeatPointerDown={onSeatPointerDown}
        onSeatDoubleClick={onSeatDoubleClick}
        onSeatPointerUp={onSeatPointerUp}
        buyerOccupancy={buyerOccupancy}
        hitPadding={hitPadding}
      />
    )
  }
  if (shape === "vip_box") {
    return (
      <VipBoxSymbol
        cx={element.x}
        cy={element.y}
        width={element.width}
        height={element.height}
        color={color}
        selected={selected}
        roundedCorner={rx ?? 6}
        chairs={chairs}
        occupancyBySeatId={occupancyBySeatId}
        parentIds={parentIds}
        selectedSeatIds={selectedSeatIds}
        onSeatPointerDown={onSeatPointerDown}
        onSeatDoubleClick={onSeatDoubleClick}
        onSeatPointerUp={onSeatPointerUp}
        buyerOccupancy={buyerOccupancy}
        hitPadding={hitPadding}
      />
    )
  }
  if (shape === "standing_zone") {
    return (
      <StandingZoneSymbol
        cx={element.x}
        cy={element.y}
        width={element.width}
        height={element.height}
        color={color}
        selected={selected}
        roundedCorner={rx ?? 12}
        occupancy={live}
        buyerOccupancy={buyerOccupancy}
      />
    )
  }
  return (
    <InfrastructureSymbols
      cx={element.x}
      cy={element.y}
      width={element.width}
      height={element.height}
      selected={selected}
      shapeType={shape}
      subtype={element.subtype}
      roundedCorner={rx ?? 8}
      label={label}
      showLabel={showLabels && zoom >= 0.8}
    />
  )
}

export const VenueSymbolLibrary = {
  theatre_seat: TheatreSeatSymbol,
  round_table: RoundTableSymbol,
  long_table: LongTableSymbol,
  vip_box: VipBoxSymbol,
  standing_zone: StandingZoneSymbol,
  infrastructure: InfrastructureSymbols,
} as const

export function VenueShapePreview({
  shapeType,
  color = "#f97316",
}: {
  shapeType: VenueShapeType
  color?: string
}) {
  const chairs: VenueMapElementSeat[] = Array.from({ length: 6 }, (_, index) => ({
    id: `preview-${index}`,
    number: index + 1,
    x: 0,
    y: 0,
    status: "available",
  }))
  return (
    <svg viewBox="-20 -20 40 40" className="h-11 w-11" aria-hidden>
      {shapeType === "theatre_seat" ? (
        <TheatreSeatSymbol cx={0} cy={0} width={14} height={14} color={color} />
      ) : null}
      {shapeType === "round_table" ? (
        <RoundTableSymbol
          cx={0}
          cy={0}
          radius={8}
          color={color}
          chairs={chairs}
          selectedSeatIds={new Set()}
        />
      ) : null}
      {shapeType === "long_table" ? (
        <LongTableSymbol
          cx={0}
          cy={0}
          width={26}
          height={8}
          color={color}
          sideA={3}
          sideB={3}
          chairs={chairs}
          selectedSeatIds={new Set()}
        />
      ) : null}
      {shapeType === "vip_box" ? (
        <VipBoxSymbol cx={0} cy={0} width={28} height={18} color={color} />
      ) : null}
      {shapeType === "standing_zone" ? (
        <StandingZoneSymbol cx={0} cy={0} width={28} height={18} color={color} />
      ) : null}
      {shapeType.startsWith("infra_") ? (
        <InfrastructureSymbols
          cx={0}
          cy={0}
          width={28}
          height={20}
          shapeType={shapeType}
          showLabel={false}
        />
      ) : null}
    </svg>
  )
}
