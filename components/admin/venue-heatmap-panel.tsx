"use client"

import { Palette } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PriceInput } from "@/components/ui/price-input"
import { formatCurrency } from "@/lib/format"
import { venueMapPriceRange } from "@/lib/seating/venue-heatmap"
import {
  listVenuePriceGroups,
  type VenuePriceGroup,
} from "@/lib/seating/venue-price-groups"
import { cn } from "@/lib/utils"
import type { InteractiveVenueMap } from "@/types/venue-map"

export function VenueHeatmapPanel({
  map,
  activeKey,
  onSelectGroup,
  onPatchGroup,
}: {
  map: InteractiveVenueMap
  activeKey?: string | null
  onSelectGroup: (group: VenuePriceGroup) => void
  onPatchGroup: (
    group: VenuePriceGroup,
    patch: { price?: number; color?: string; name?: string },
  ) => void
}) {
  const groups = listVenuePriceGroups(map)
  const range = venueMapPriceRange(map)
  const active = groups.find((group) => group.key === activeKey) ?? null

  if (groups.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Tarifas</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Todavía no hay sectores vendibles. Volvé a Arquitectura para dibujar
          el recinto.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Heatmap de tarifas</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          El lienzo es de solo lectura. Elegí un sector acá o en el mapa para
          editar nombre, precio y color. El identificador interno no cambia:
          podés renombrar Grada Naranja sin romper las entradas.
        </p>
      </div>
      <div className="space-y-1.5">
        <div
          className="h-2.5 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, rgb(34 197 94), rgb(234 179 8), rgb(239 68 68))",
          }}
          aria-hidden="true"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{formatCurrency(range.min)}</span>
          <span>{formatCurrency(range.max)}</span>
        </div>
      </div>
      {active ? (
        <div className="space-y-3 rounded-xl border border-border bg-background p-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nombre</Label>
            <Input
              value={active.name}
              onChange={(event) =>
                onPatchGroup(active, { name: event.target.value })
              }
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {active.count} {active.unit} · {active.priceHint}
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Precio</Label>
            <PriceInput
              min={0}
              value={active.price}
              placeholder="0"
              onValueChange={(value) => {
                if (value == null) return
                onPatchGroup(active, { price: value })
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Color del sector</Label>
            <div className="flex items-center gap-2">
              <Palette className="size-4 text-muted-foreground" aria-hidden="true" />
              <input
                type="color"
                value={active.color}
                onChange={(event) =>
                  onPatchGroup(active, { color: event.target.value })
                }
                className="h-11 w-full cursor-pointer rounded border border-border bg-transparent"
              />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Clic en un sector del mapa o en la lista para editar su tarifa.
        </p>
      )}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Sectores
        </p>
        <ul className="space-y-1">
          {groups.map((group) => (
            <li key={group.key}>
              <button
                type="button"
                onClick={() => onSelectGroup(group)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition",
                  activeKey === group.key
                    ? "border-primary/40 bg-primary/10"
                    : "border-transparent hover:bg-muted/60",
                )}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: group.color }}
                />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {group.name}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatCurrency(group.price)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
