import { VenueMapBackgroundLayer } from "@/components/venue/venue-map-background-layer"
import { VenueMapElementLayer } from "@/components/venue/venue-map-element-layer"
import type { InteractiveVenueMap } from "@/types/venue-map"

const CANVAS = { width: 800, height: 560 }

export function VenueMapCanvas({
  map,
  className,
}: {
  map: InteractiveVenueMap
  className?: string
}) {
  const elementCount = map.elements?.length ?? 0
  return (
    <svg
      viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
      className={className}
      role="img"
      aria-label="Plano de asientos"
    >
      <VenueMapBackgroundLayer map={map} />
      {map.aisles.map((aisle) => (
        <rect
          key={aisle.id}
          x={aisle.x}
          y={aisle.y}
          width={aisle.width}
          height={aisle.height}
          rx={6}
          className="fill-zinc-800/80"
        />
      ))}
      {map.stage ? (
        <g>
          <rect
            x={map.stage.x}
            y={map.stage.y}
            width={map.stage.width}
            height={map.stage.height}
            rx={10}
            className="fill-zinc-100"
          />
          <text
            x={map.stage.x + map.stage.width / 2}
            y={map.stage.y + map.stage.height / 2 + 5}
            textAnchor="middle"
            className="fill-zinc-900 text-[13px] font-black tracking-[0.28em]"
          >
            {map.stage.label}
          </text>
        </g>
      ) : null}
      {map.sectors.map((sector) =>
        sector.seats.map((seat) => (
          <circle
            key={seat.id}
            cx={seat.x}
            cy={seat.y}
            r={6}
            fill={seat.status === "blocked" ? "#27272a" : sector.color}
            opacity={seat.status === "blocked" ? 0.3 : 1}
          />
        )),
      )}
      <VenueMapElementLayer
        elements={map.elements ?? []}
        showSeats={elementCount < 220}
        zoom={elementCount >= 800 ? 0.7 : 1}
      />
      {map.labels.map((label) => (
        <text
          key={label.id}
          x={label.x}
          y={label.y}
          textAnchor="middle"
          fill={label.color}
          className="text-[15px] font-black tracking-[0.22em]"
        >
          {label.text}
        </text>
      ))}
    </svg>
  )
}
