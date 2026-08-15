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
      <div className="flex max-w-[calc(100vw-1.5rem)] flex-nowrap gap-3 overflow-x-auto rounded-full bg-foreground/90 px-3 py-2 text-xs font-medium text-background shadow-2xl backdrop-blur-md hide-scrollbar md:gap-6 md:px-6 md:py-3 md:text-sm">
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <Users className="size-3.5 shrink-0 md:size-4" aria-hidden="true" />
          {stats.total} {stats.total === 1 ? "lugar" : "lugares"}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-background/80">
          <LayoutGrid className="size-3.5 shrink-0 md:size-4" aria-hidden="true" />
          {stats.tables} {stats.tables === 1 ? "mesa" : "mesas"}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-background/80">
          <MapPinned className="size-3.5 shrink-0 md:size-4" aria-hidden="true" />
          {stats.zones} {stats.zones === 1 ? "zona" : "zonas"}
        </span>
      </div>
    </div>
  )
}
