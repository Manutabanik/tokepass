"use client"

import { LayoutGrid, MapPinned, Minus, Plus, RotateCcw, Users } from "lucide-react"

import { venueMapCapacity } from "@/lib/seating/venue-map-geometry"
import { cn } from "@/lib/utils"
import type { InteractiveVenueMap } from "@/types/venue-map"

function studioInventory(map: InteractiveVenueMap) {
  const elements = map.elements ?? []
  const tables = elements.filter(
    (item) =>
      item.type === "round_table" ||
      item.type === "long_table" ||
      item.type === "vip_box",
  ).length
  const standing = elements.filter((item) => item.type === "standing_zone").length
  const zones = (map.zones ?? []).length + standing
  return {
    total: venueMapCapacity(map),
    tables,
    zones,
  }
}

export function VenueStudioHud({
  map,
  className,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: {
  map: InteractiveVenueMap
  className?: string
  zoomPercent?: number
  onZoomIn?: () => void
  onZoomOut?: () => void
  onZoomReset?: () => void
}) {
  const stats = studioInventory(map)

  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2",
        className,
      )}
    >
      <div className="flex max-w-[calc(100vw-1.5rem)] flex-nowrap items-center gap-2.5 overflow-x-auto rounded-full border border-border bg-card/95 px-2.5 py-1 text-[11px] font-medium text-card-foreground shadow-md backdrop-blur-md hide-scrollbar md:gap-4 md:px-3">
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <Users className="size-3.5 shrink-0" aria-hidden="true" />
          {stats.total} {stats.total === 1 ? "lugar" : "lugares"}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground">
          <LayoutGrid className="size-3.5 shrink-0" aria-hidden="true" />
          {stats.tables} {stats.tables === 1 ? "mesa" : "mesas"}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground">
          <MapPinned className="size-3.5 shrink-0" aria-hidden="true" />
          {stats.zones} {stats.zones === 1 ? "zona" : "zonas"}
        </span>
        {onZoomIn && onZoomOut && onZoomReset ? (
          <span className="pointer-events-auto inline-flex shrink-0 items-center gap-1 border-l border-border pl-3">
            <button
              type="button"
              onClick={onZoomOut}
              className="grid size-7 place-items-center rounded-md hover:bg-muted"
              aria-label="Alejar"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="min-w-10 text-center tabular-nums">
              {zoomPercent ?? 100}%
            </span>
            <button
              type="button"
              onClick={onZoomIn}
              className="grid size-7 place-items-center rounded-md hover:bg-muted"
              aria-label="Acercar"
            >
              <Plus className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={onZoomReset}
              className="grid size-7 place-items-center rounded-md hover:bg-muted"
              aria-label="Restablecer zoom"
            >
              <RotateCcw className="size-3.5" />
            </button>
          </span>
        ) : null}
      </div>
    </div>
  )
}
