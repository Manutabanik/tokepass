"use client"

import { LayoutGrid, MapPinned, Users } from "lucide-react"

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
}: {
  map: InteractiveVenueMap
  className?: string
}) {
  const stats = studioInventory(map)

  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-6 left-1/2 z-50 -translate-x-1/2",
        className,
      )}
    >
      <div className="flex gap-6 rounded-full bg-foreground/90 px-6 py-3 text-sm font-medium text-background shadow-2xl backdrop-blur-md">
        <span className="inline-flex items-center gap-2">
          <Users className="size-4 shrink-0" aria-hidden="true" />
          Total: {stats.total} {stats.total === 1 ? "lugar" : "lugares"}
        </span>
        <span className="inline-flex items-center gap-2 text-background/80">
          <LayoutGrid className="size-4 shrink-0" aria-hidden="true" />
          Mesas: {stats.tables}
        </span>
        <span className="inline-flex items-center gap-2 text-background/80">
          <MapPinned className="size-4 shrink-0" aria-hidden="true" />
          Zonas: {stats.zones}
        </span>
      </div>
    </div>
  )
}
