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
  resolveVenueShapeType,
  VENUE_SHAPE,
} from "@/lib/seating/venue-element-geometry"
import type { VenueMapElement, VenueMapElementSeat, VenueShapeType } from "@/types/venue-map"

export const CHAIR_DOT_RADIUS = VENUE_SHAPE.chairRadius

type Occupancy = "available" | "occupied" | "blocked" | "selected"

function seatState(
  seat: VenueMapElementSeat,
  occupancyBySeatId: Record<string, Occupancy | "available" | "occupied" | "blocked">,
  selectedSeatIds: Set<string>,
): Occupancy {
  if (selectedSeatIds.has(seat.id)) return "selected"
  const live = occupancyBySeatId[seat.id]
  if (live === "occupied" || live === "blocked" || live === "selected") return live
  if (seat.status === "blocked") return "blocked"
  return "available"
}

function fillFor(color: string, state: Occupancy) {
  if (state === "selected") return "#34d399"
  if (state === "occupied" || state === "blocked") return "#3f3f46"
  return color
}

function strokeFor(color: string, selected: boolean, state: Occupancy = "available") {
  if (selected || state === "selected") return "#ffffff"
  if (state === "occupied" || state === "blocked") return "#52525b"
  return color
}

export function TheatreSeatSymbol({
  cx,
  cy,
  width = VENUE_SHAPE.theatreSeat,
  height = VENUE_SHAPE.theatreSeat,
  color,
  selected = false,
  occupied = false,
  rotation = 0,
  label,
  showLabel = false,
}: {
  cx: number
  cy: number
  width?: number
  height?: number
  color: string
  selected?: boolean
  occupied?: boolean
  rotation?: number
  label?: string
  showLabel?: boolean
}) {
  const w = Math.max(10, width)
  const h = Math.max(10, height)
  const state: Occupancy = occupied ? "blocked" : selected ? "selected" : "available"
  const fill = fillFor(color, state)
  const stroke = strokeFor(color, selected, state)
  const rxBack = Math.min(3.2, w * 0.22)
  const rxSeat = Math.min(2.4, w * 0.18)
  const fontSize = Math.max(5, Math.min(7.5, w * 0.42))

  return (
    <g
      transform={`rotate(${rotation} ${cx} ${cy})`}
      className="transition-all duration-200 ease-in-out"
      style={
        selected
          ? { filter: "drop-shadow(0px 0px 8px rgba(255, 255, 255, 0.8))" }
          : undefined
      }
    >
      <rect
        x={cx - w * 0.42}
        y={cy - h * 0.5}
        width={w * 0.84}
        height={h * 0.32}
        rx={rxBack}
        fill={fill}
        fillOpacity={occupied ? 0.4 : 0.95}
        stroke={stroke}
        strokeWidth={selected ? 3 : 0.9}
      />
      <rect
        x={cx - w * 0.4}
        y={cy - h * 0.14}
        width={w * 0.8}
        height={h * 0.58}
        rx={rxSeat}
        fill={fill}
        fillOpacity={occupied ? 0.35 : 0.82}
        stroke={stroke}
        strokeWidth={selected ? 3 : 0.9}
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
  onSeatPointerDown,
}: {
  cx: number
  cy: number
  radius: number
  color: string
  selected?: boolean
  chairs: VenueMapElementSeat[]
  occupancyBySeatId?: Record<string, Occupancy | "available" | "occupied" | "blocked">
  selectedSeatIds: Set<string>
  onSeatPointerDown?: (event: React.PointerEvent, seatId: string) => void
}) {
  const r = Math.max(8, radius)
  const orbit = r + CHAIR_DOT_RADIUS + 2
  const count = chairs.length

  return (
    <g>
      {Array.from({ length: count }, (_, index) => {
        const seat = chairs[index]
        const angle = (index / count) * Math.PI * 2
        const x = cx + Math.cos(angle) * orbit
        const y = cy + Math.sin(angle) * orbit
        const state = seat
          ? seatState(seat, occupancyBySeatId, selectedSeatIds)
          : "available"
        return (
          <g key={seat?.id ?? `chair-${index}`}>
            {seat && onSeatPointerDown ? (
              <circle
                cx={x}
                cy={y}
                r={Math.max(CHAIR_DOT_RADIUS, 11)}
                fill="transparent"
                stroke="transparent"
                strokeWidth={14}
                onPointerDown={(event) => onSeatPointerDown(event, seat.id)}
              />
            ) : null}
            <circle
              cx={x}
              cy={y}
              r={CHAIR_DOT_RADIUS}
              fill={fillFor(color, state)}
              fillOpacity={state === "occupied" || state === "blocked" ? 0.4 : 0.95}
              stroke={strokeFor(color, selected, state)}
              strokeWidth={state === "selected" || selected ? 1.8 : 0.7}
              onPointerDown={
                seat && onSeatPointerDown
                  ? (event) => onSeatPointerDown(event, seat.id)
                  : undefined
              }
            />
          </g>
        )
      })}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={color}
        fillOpacity={selected ? 0.55 : 0.28}
        stroke={selected ? "#ffffff" : color}
        strokeWidth={selected ? 3.2 : 1.4}
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
  onSeatPointerDown,
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
  occupancyBySeatId?: Record<string, Occupancy | "available" | "occupied" | "blocked">
  selectedSeatIds: Set<string>
  onSeatPointerDown?: (event: React.PointerEvent, seatId: string) => void
}) {
  const w = Math.max(8, width)
  const h = Math.max(8, height)
  const rx = Math.max(0, Math.min(roundedCorner, Math.min(w, h) / 2))
  const inset = Math.min(8, w / 4)
  const offset = h / 2 + CHAIR_DOT_RADIUS + 2

  function dots(count: number, y: number, startIndex: number) {
    const safe = Math.max(0, count)
    return Array.from({ length: safe }, (_, index) => {
      const t = safe === 1 ? 0.5 : index / (safe - 1)
      const x = cx - w / 2 + inset + t * (w - inset * 2)
      const seat = chairs[startIndex + index]
      const state = seat
        ? seatState(seat, occupancyBySeatId, selectedSeatIds)
        : "available"
      return (
        <circle
          key={seat?.id ?? `side-${y}-${index}`}
          cx={x}
          cy={y}
          r={CHAIR_DOT_RADIUS}
          fill={fillFor(color, state)}
          fillOpacity={state === "occupied" || state === "blocked" ? 0.4 : 0.95}
          stroke={strokeFor(color, selected, state)}
          strokeWidth={state === "selected" || selected ? 1.1 : 0.7}
          onPointerDown={
            seat && onSeatPointerDown
              ? (event) => onSeatPointerDown(event, seat.id)
              : undefined
          }
        />
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
        fill={color}
        fillOpacity={selected ? 0.55 : 0.28}
        stroke={selected ? "#ffffff" : color}
        strokeWidth={selected ? 3.2 : 1.4}
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
  onSeatPointerDown,
}: {
  cx: number
  cy: number
  width: number
  height: number
  color: string
  selected?: boolean
  roundedCorner?: number
  chairs?: VenueMapElementSeat[]
  occupancyBySeatId?: Record<string, Occupancy | "available" | "occupied" | "blocked">
  selectedSeatIds?: Set<string>
  onSeatPointerDown?: (event: React.PointerEvent, seatId: string) => void
}) {
  const w = Math.max(24, width)
  const h = Math.max(18, height)
  const rx = Math.max(2, Math.min(roundedCorner, 10))
  const stroke = selected ? "#ffffff" : color
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
        fill={color}
        fillOpacity={selected ? 0.42 : 0.12}
        stroke={stroke}
        strokeWidth={selected ? 3 : 1.4}
      />
      <rect
        x={cx - w / 2 + 3}
        y={cy - h / 2 + 3}
        width={w - 6}
        height={back}
        rx={3}
        fill={color}
        fillOpacity={0.55}
        stroke={stroke}
        strokeWidth={0.8}
      />
      <rect
        x={cx - w / 2 + 3}
        y={cy - h / 2 + 3}
        width={arm}
        height={h - 6}
        rx={3}
        fill={color}
        fillOpacity={0.5}
        stroke={stroke}
        strokeWidth={0.8}
      />
      <rect
        x={cx + w / 2 - 3 - arm}
        y={cy - h / 2 + 3}
        width={arm}
        height={h - 6}
        rx={3}
        fill={color}
        fillOpacity={0.5}
        stroke={stroke}
        strokeWidth={0.8}
      />
      <ellipse
        cx={cx}
        cy={cy + h * 0.12}
        rx={tableW / 2}
        ry={tableH / 2}
        fill={color}
        fillOpacity={0.35}
        stroke={stroke}
        strokeWidth={0.9}
      />
      {chairs.map((seat, index) => {
        const col = index % cols
        const row = Math.floor(index / cols)
        const x = cx - (cols - 1) * 8 + col * 16
        const y = cy - 10 + row * 18
        const state = seatState(seat, occupancyBySeatId, selectedSet)
        return (
          <circle
            key={seat.id}
            cx={x}
            cy={y}
            r={2.2}
            fill={fillFor(color, state)}
            fillOpacity={state === "occupied" || state === "blocked" ? 0.4 : 0.9}
            stroke={strokeFor(color, selected, state)}
            strokeWidth={0.6}
            onPointerDown={
              onSeatPointerDown
                ? (event) => onSeatPointerDown(event, seat.id)
                : undefined
            }
          />
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
}: {
  cx: number
  cy: number
  width: number
  height: number
  color: string
  selected?: boolean
  roundedCorner?: number
}) {
  const w = Math.max(24, width)
  const h = Math.max(18, height)
  const rx = Math.max(4, Math.min(roundedCorner, 16))
  return (
    <rect
      x={cx - w / 2}
      y={cy - h / 2}
      width={w}
      height={h}
      rx={rx}
      fill={color}
      fillOpacity={0.16}
      stroke={selected ? "#ffffff" : color}
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
}: {
  element: VenueMapElement
  selected?: boolean
  occupancyBySeatId?: Record<string, Occupancy | "available" | "occupied" | "blocked">
  selectedSeatIds: Set<string>
  showLabels?: boolean
  showChairs?: boolean
  zoom?: number
  label?: string
  onSeatPointerDown?: (event: React.PointerEvent, seatId: string) => void
}) {
  const shape = resolveVenueShapeType(element)
  const color = element.color
  const rx = element.roundedCorner
  const chairs = showChairs ? (element.seats ?? []) : []

  if (shape === "theatre_seat") {
    return (
      <TheatreSeatSymbol
        cx={element.x}
        cy={element.y}
        width={element.width || VENUE_SHAPE.theatreSeat}
        height={element.height || VENUE_SHAPE.theatreSeat}
        color={color}
        selected={selected}
        label={label}
        showLabel={showLabels}
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
        selectedSeatIds={selectedSeatIds}
        onSeatPointerDown={onSeatPointerDown}
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
        selectedSeatIds={selectedSeatIds}
        onSeatPointerDown={onSeatPointerDown}
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
        selectedSeatIds={selectedSeatIds}
        onSeatPointerDown={onSeatPointerDown}
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
