"use client"

import { memo } from "react"
import {
  ChefHat,
  DoorOpen,
  GlassWater,
  LogIn,
  Music2,
  ParkingCircle,
  Sparkles,
  Toilet as Restroom,
} from "lucide-react"

import { isInfrastructureElement } from "@/types/venue-map"
import type { InteractiveVenueMap, VenueMapElement, VenueInfraSubtype } from "@/types/venue-map"

const INFRA_ICONS: Record<
  VenueInfraSubtype,
  typeof Sparkles
> = {
  stage: Sparkles,
  dj_booth: Music2,
  bar: GlassWater,
  restroom: Restroom,
  entrance: LogIn,
  exit: DoorOpen,
  parking: ParkingCircle,
  kitchen: ChefHat,
}

const VenueElementShape = memo(function VenueElementShape({
  element,
  selected,
  occupancyBySeatId,
  onElementPointerDown,
  onElementContextMenu,
  onSeatPointerDown,
  showSeats,
  showLabels,
  interactive,
}: {
  element: VenueMapElement
  selected: boolean
  occupancyBySeatId: Record<string, "available" | "occupied" | "blocked">
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
  showSeats: boolean
  showLabels: boolean
  interactive: boolean
}) {
  const transform = `rotate(${element.rotation} ${element.x} ${element.y})`
  const opacity = element.opacity ?? 1
  const infra = isInfrastructureElement(element)

  if (infra) {
    const Icon = INFRA_ICONS[element.subtype ?? "stage"] ?? Sparkles
    const iconSize = Math.max(14, Math.min(28, Math.min(element.width, element.height) * 0.42))
    return (
      <g
        transform={transform}
        opacity={opacity}
        className={interactive ? undefined : "pointer-events-none"}
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
        <rect
          x={element.x - element.width / 2}
          y={element.y - element.height / 2}
          width={element.width}
          height={element.height}
          rx={10}
          className={
            selected
              ? "fill-zinc-200/90 stroke-emerald-400 stroke-2 dark:fill-zinc-700/90"
              : "fill-zinc-300/80 stroke-zinc-500 dark:fill-zinc-800/90 dark:stroke-zinc-500"
          }
          strokeWidth={selected ? 2 : 1.2}
        />
        <foreignObject
          x={element.x - iconSize / 2}
          y={element.y - iconSize / 2 - (showLabels ? 6 : 0)}
          width={iconSize}
          height={iconSize}
          className="pointer-events-none overflow-visible"
        >
          <div className="flex h-full w-full items-center justify-center text-zinc-700 dark:text-zinc-200">
            <Icon style={{ width: iconSize * 0.85, height: iconSize * 0.85 }} />
          </div>
        </foreignObject>
        {showLabels ? (
          <text
            x={element.x}
            y={element.y + iconSize / 2 + 10}
            textAnchor="middle"
            className="pointer-events-none fill-zinc-700 text-[9px] font-bold tracking-wide dark:fill-zinc-200"
          >
            {element.label}
          </text>
        ) : null}
      </g>
    )
  }

  if (element.type === "standing_zone") {
    return (
      <g
        transform={transform}
        opacity={opacity}
        onPointerDown={(event) => onElementPointerDown?.(event, element)}
        onContextMenu={(event) => onElementContextMenu?.(event, element)}
      >
        <rect
          x={element.x - element.width / 2}
          y={element.y - element.height / 2}
          width={element.width}
          height={element.height}
          rx={12}
          fill={element.color}
          fillOpacity={0.18}
          className={selected ? "stroke-emerald-400" : undefined}
          stroke={selected ? undefined : element.color}
          strokeWidth={selected ? 2 : 1.4}
        />
        {showLabels ? (
          <>
            <text
              x={element.x}
              y={element.y - 4}
              textAnchor="middle"
              fill={element.color}
              className="pointer-events-none text-[11px] font-bold"
            >
              {element.label}
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
      </g>
    )
  }
  const tableW = element.type === "round_table" ? 36 : element.width
  const tableH = element.type === "round_table" ? 36 : element.height
  return (
    <g opacity={opacity}>
      <g
        transform={transform}
        onPointerDown={(event) => onElementPointerDown?.(event, element)}
        onContextMenu={(event) => onElementContextMenu?.(event, element)}
      >
        {element.type === "round_table" ? (
          <circle
            cx={element.x}
            cy={element.y}
            r={20}
            fill={element.color}
            fillOpacity={0.35}
            className={selected ? "stroke-emerald-400" : undefined}
            stroke={selected ? undefined : element.color}
            strokeWidth={selected ? 2 : 1.5}
          />
        ) : (
          <rect
            x={element.x - tableW / 2}
            y={element.y - tableH / 2}
            width={tableW}
            height={tableH}
            rx={element.type === "vip_box" ? 10 : 4}
            fill={element.color}
            fillOpacity={0.35}
            className={selected ? "stroke-emerald-400" : undefined}
            stroke={selected ? undefined : element.color}
            strokeWidth={selected ? 2 : 1.5}
          />
        )}
        {showLabels ? (
          <text
            x={element.x}
            y={element.y + 3}
            textAnchor="middle"
            className="pointer-events-none fill-white text-[9px] font-bold"
          >
            {element.label}
          </text>
        ) : null}
      </g>
      {showSeats
        ? element.seats.map((seat) => {
            const occupied = occupancyBySeatId[seat.id]
            const blocked = seat.status === "blocked" || occupied === "blocked"
            const taken = occupied === "occupied"
            return (
              <circle
                key={seat.id}
                cx={seat.x}
                cy={seat.y}
                r={5}
                fill={blocked || taken ? "#3f3f46" : element.color}
                opacity={blocked || taken ? 0.4 : 1}
                stroke={selected ? "#fff" : "rgba(0,0,0,0.35)"}
                strokeWidth={0.8}
                onPointerDown={(event) =>
                  onSeatPointerDown?.(event, element, seat.id)
                }
              />
            )
          })
        : null}
    </g>
  )
})

export function VenueMapElementLayer({
  elements,
  selectedIds = [],
  occupancyBySeatId = {},
  onElementPointerDown,
  onElementContextMenu,
  onSeatPointerDown,
  showSeats = true,
  zoom = 1,
  interactive = true,
}: {
  elements: VenueMapElement[]
  selectedIds?: string[]
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
}) {
  const selected = new Set(selectedIds)
  const dense = elements.length >= 220
  const veryDense = elements.length >= 800
  const renderSeats = showSeats && (!dense || zoom >= 1.15)
  const renderLabels = !veryDense && zoom >= 0.8

  return (
    <>
      {elements.map((element) => (
        <VenueElementShape
          key={element.id}
          element={element}
          selected={selected.has(element.id)}
          occupancyBySeatId={occupancyBySeatId}
          onElementPointerDown={interactive ? onElementPointerDown : undefined}
          onElementContextMenu={interactive ? onElementContextMenu : undefined}
          onSeatPointerDown={interactive ? onSeatPointerDown : undefined}
          showSeats={renderSeats || selected.has(element.id)}
          showLabels={renderLabels || selected.has(element.id)}
          interactive={interactive}
        />
      ))}
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
