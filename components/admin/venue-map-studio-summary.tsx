"use client"

import { LayoutGrid, Map } from "lucide-react"

import { Button } from "@/components/ui/button"
import { venueMapStudioStatus } from "@/lib/seating/venue-map-geometry"
import type { InteractiveVenueMap } from "@/types/venue-map"

export function VenueMapStudioSummary({
  map,
  onOpen,
}: {
  map: InteractiveVenueMap
  onOpen: () => void
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
          <Map className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground">
            Mapa y Distribución del Recinto
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Diseñá la distribución de mesas, tablones, butacas y sectores de tu
            evento.
          </p>
          <p className="mt-3 text-sm font-medium text-foreground">
            {venueMapStudioStatus(map)}
          </p>
        </div>
      </div>
      <Button
        type="button"
        size="lg"
        onClick={onOpen}
        className="flex w-full items-center justify-center gap-2 bg-primary font-bold text-primary-foreground sm:w-auto"
      >
        <LayoutGrid className="h-5 w-5" />
        Diseñar Mapa en Pantalla Completa
      </Button>
    </div>
  )
}
