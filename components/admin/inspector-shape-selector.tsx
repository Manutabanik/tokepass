"use client"

import { applyVenueShape, resolveVenueShapeType } from "@/lib/seating/venue-element-geometry"
import { cn } from "@/lib/utils"
import type { VenueMapElement, VenueShapeType } from "@/types/venue-map"

import { VenueShapePreview } from "@/components/admin/venue-svg-symbols"

const COMMERCIAL_SHAPES: Array<{ id: VenueShapeType; label: string }> = [
  { id: "theatre_seat", label: "Butaca" },
  { id: "round_table", label: "Mesa redonda" },
  { id: "long_table", label: "Tablón" },
  { id: "vip_box", label: "Box VIP" },
]

const INFRA_SHAPES: Array<{ id: VenueShapeType; label: string }> = [
  { id: "infra_stage", label: "Escenario" },
  { id: "infra_bar", label: "Barra" },
  { id: "infra_restroom", label: "Baños" },
  { id: "infra_door", label: "Puerta" },
  { id: "infra_generic", label: "Genérico" },
]

export function InspectorShapeSelector({
  element,
  onChange,
}: {
  element: VenueMapElement
  onChange: (patch: Partial<VenueMapElement>) => void
}) {
  const current = resolveVenueShapeType(element)
  const isRound = current === "round_table" || element.type === "round_table"
  const isChair = current === "theatre_seat" || element.type === "vip_chair"
  const shapes =
    element.category === "infrastructure" || element.type === "infrastructure"
      ? INFRA_SHAPES
      : element.type === "standing_zone"
        ? [{ id: "standing_zone" as const, label: "Campo" }, ...COMMERCIAL_SHAPES]
        : COMMERCIAL_SHAPES
  const radius = Math.round(Math.min(element.width, element.height) / 2)
  const rounded = element.roundedCorner ?? (element.type === "vip_box" ? 6 : 4)

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">Estilo y silueta visual</p>
      <div className="grid grid-cols-2 gap-2">
        {shapes.map((shape) => {
          const active = current === shape.id
          return (
            <button
              key={shape.id}
              type="button"
              onClick={() => {
                const next = applyVenueShape(element, shape.id)
                onChange({
                  shapeType: next.shapeType,
                  type: next.type,
                  width: next.width,
                  height: next.height,
                  chairCount: next.chairCount,
                  sideA: next.sideA,
                  sideB: next.sideB,
                  sellMode: next.sellMode,
                  capacity: next.capacity,
                  roundedCorner: next.roundedCorner,
                  seats: next.seats,
                })
              }}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-center transition-colors",
                active
                  ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-400/40"
                  : "border-border bg-card hover:border-emerald-500/40",
              )}
            >
              <VenueShapePreview shapeType={shape.id} color={element.color} />
          <span className="text-[10px] font-semibold text-foreground">{shape.label}</span>
            </button>
          )
        })}
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">
          {isRound ? `Radio (${radius} px)` : `Ancho (${Math.round(element.width)} px)`}
        </span>
        <input
          type="range"
          min={isChair ? 10 : isRound ? 8 : 16}
          max={isChair ? 48 : 220}
          value={isRound ? radius : Math.round(element.width)}
          onChange={(event) => {
            const value = Number(event.target.value)
            if (isRound) {
              onChange({ width: value * 2, height: value * 2 })
              return
            }
            if (isChair) {
              onChange({ width: value, height: value })
              return
            }
            onChange({ width: value })
          }}
          className="w-full accent-emerald-500"
        />
      </label>
      {!isRound && !isChair ? (
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">
            Alto ({Math.round(element.height)} px)
          </span>
          <input
            type="range"
            min={12}
            max={180}
            value={Math.round(element.height)}
            onChange={(event) => onChange({ height: Number(event.target.value) })}
            className="w-full accent-emerald-500"
          />
        </label>
      ) : null}
      {!isRound && !isChair ? (
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">
            Curvatura de esquinas ({rounded} px)
          </span>
          <input
            type="range"
            min={0}
            max={16}
            value={rounded}
            onChange={(event) => onChange({ roundedCorner: Number(event.target.value) })}
            className="w-full accent-emerald-500"
          />
        </label>
      ) : null}
    </div>
  )
}
