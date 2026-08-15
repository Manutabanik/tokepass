"use client"

import { Map } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import { summarizeVenueInventory } from "@/lib/seating/venue-inventory-dashboard"
import type { InteractiveVenueMap } from "@/types/venue-map"

function sectorSummary(row: {
  unitCount: number
  unitLabel: string
  people: number
  price: number
}) {
  const parts = [
    `${row.unitCount} ${row.unitLabel}`,
    `${row.people} ${row.people === 1 ? "persona" : "personas"}`,
  ]
  if (row.price > 0) parts.push(formatCurrency(row.price))
  return parts.join(" · ")
}

export function VenueMapStudioSummary({
  map,
  onOpen,
}: {
  map: InteractiveVenueMap
  onOpen: () => void
}) {
  const inventory = summarizeVenueInventory(map)

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      {inventory.hasInventory ? (
        <>
          <div className="mb-6 grid grid-cols-3 gap-4 border-b border-border/50 pb-6">
            <div className="min-w-0">
              <p className="text-2xl font-bold tabular-nums text-foreground">
                {inventory.capacity}
              </p>
              <p className="text-sm text-muted-foreground">
                {inventory.capacity === 1 ? "Lugar" : "Lugares"}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold tabular-nums text-foreground">
                {inventory.elementCount}
              </p>
              <p className="text-sm text-muted-foreground">
                {inventory.elementLabel}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold tabular-nums text-foreground">
                {inventory.sectorCount}
              </p>
              <p className="text-sm text-muted-foreground">
                {inventory.sectorLabel}
              </p>
            </div>
          </div>

          <ul>
            {inventory.sectors.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate font-medium text-foreground">
                    {row.name}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {sectorSummary(row)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mb-6">
          <h3 className="text-base font-semibold text-foreground">
            Mapa del recinto
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Todavía no hay zonas ni mesas. Diseñá el plano para ver aforo,
            elementos y sectores en un solo lugar.
          </p>
        </div>
      )}

      <Button
        type="button"
        variant="default"
        size="lg"
        onClick={onOpen}
        className="mt-6 w-full"
      >
        <Map className="size-4" aria-hidden="true" />
        Diseñar Mapa en Pantalla Completa
      </Button>
    </div>
  )
}
