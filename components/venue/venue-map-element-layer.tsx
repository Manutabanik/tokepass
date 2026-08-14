import { memo } from "react"

import type { InteractiveVenueMap, VenueMapElement } from "@/types/venue-map"

const VenueElementShape = memo(function VenueElementShape({
  element,
  selected,
  occupancyBySeatId,
  onElementPointerDown,
  onSeatPointerDown,
  showSeats,
  showLabels,
}: {
  element: VenueMapElement
  selected: boolean
  occupancyBySeatId: Record<string, "available" | "occupied" | "blocked">
  onElementPointerDown?: (
    event: React.PointerEvent,
    element: VenueMapElement,
  ) => void
  onSeatPointerDown?: (
    event: React.PointerEvent,
    element: VenueMapElement,
    seatId: string,
  ) => void
  showSeats: boolean
  showLabels: boolean
}) {
  const transform = `rotate(${element.rotation} ${element.x} ${element.y})`
  if (element.type === "infrastructure") {
    return (
      <g
        transform={transform}
        onPointerDown={(event) => onElementPointerDown?.(event, element)}
      >
        <rect
          x={element.x - element.width / 2}
          y={element.y - element.height / 2}
          width={element.width}
          height={element.height}
          rx={8}
          className={
            selected
              ? "fill-zinc-100 stroke-emerald-400"
              : "fill-zinc-200 stroke-zinc-400"
          }
          strokeWidth={selected ? 2 : 1}
        />
        {showLabels ? (
          <text
            x={element.x}
            y={element.y + 4}
            textAnchor="middle"
            className="pointer-events-none fill-zinc-900 text-[10px] font-black tracking-[0.16em]"
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
        onPointerDown={(event) => onElementPointerDown?.(event, element)}
      >
        <rect
          x={element.x - element.width / 2}
          y={element.y - element.height / 2}
          width={element.width}
          height={element.height}
          rx={12}
          fill={element.color}
          fillOpacity={0.18}
          stroke={selected ? "#34d399" : element.color}
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
    <g>
      <g
        transform={transform}
        onPointerDown={(event) => onElementPointerDown?.(event, element)}
      >
        {element.type === "round_table" ? (
          <circle
            cx={element.x}
            cy={element.y}
            r={20}
            fill={element.color}
            fillOpacity={0.35}
            stroke={selected ? "#fff" : element.color}
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
            stroke={selected ? "#fff" : element.color}
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
  onSeatPointerDown,
  showSeats = true,
  zoom = 1,
}: {
  elements: VenueMapElement[]
  selectedIds?: string[]
  occupancyBySeatId?: Record<string, "available" | "occupied" | "blocked">
  onElementPointerDown?: (
    event: React.PointerEvent,
    element: VenueMapElement,
  ) => void
  onSeatPointerDown?: (
    event: React.PointerEvent,
    element: VenueMapElement,
    seatId: string,
  ) => void
  showSeats?: boolean
  zoom?: number
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
          onElementPointerDown={onElementPointerDown}
          onSeatPointerDown={onSeatPointerDown}
          showSeats={renderSeats || selected.has(element.id)}
          showLabels={renderLabels || selected.has(element.id)}
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
