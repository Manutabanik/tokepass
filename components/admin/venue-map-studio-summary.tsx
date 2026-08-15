"use client"

import { Map } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatNumber } from "@/lib/format"
import { summarizeVenueInventory } from "@/lib/seating/venue-inventory-dashboard"
import { cn } from "@/lib/utils"
import type { InteractiveVenueMap } from "@/types/venue-map"

export function VenueMapStudioSummary({
  map,
  onOpen,
}: {
  map: InteractiveVenueMap
  onOpen: () => void
}) {
  const inventory = summarizeVenueInventory(map)
  const segments = inventory.sectors.filter((row) => row.share > 0)

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <article className="rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Aforo total
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-foreground">
            {formatNumber(inventory.capacity)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {inventory.capacity === 1 ? "lugar" : "lugares"}
            {inventory.elementCount > 0
              ? ` · ${formatNumber(inventory.elementCount)} ${inventory.elementLabel.toLocaleLowerCase("es")}`
              : ""}
          </p>
          <div
            className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label="Distribucion del aforo por sector"
          >
            {segments.length > 0 ? (
              <div className="flex h-full w-full">
                {segments.map((row) => (
                  <div
                    key={row.id}
                    className="h-full min-w-0 transition-[flex-grow] duration-300"
                    style={{
                      flexGrow: Math.max(row.share, 0.0001),
                      backgroundColor: row.color,
                    }}
                    title={`${row.name}: ${Math.round(row.share * 100)}%`}
                  />
                ))}
              </div>
            ) : (
              <div className="h-full w-full bg-muted" />
            )}
          </div>
        </article>

        <article className="rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Proyección de recaudación
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-foreground">
            {formatCurrency(inventory.projectedRevenue)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Suma de capacidad por precio de cada sector
          </p>
        </article>

        <article className="rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Configuración de sectores
          </p>
          {inventory.sectors.length > 0 ? (
            <ul className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
              {inventory.sectors.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={onOpen}
                    className="flex w-full items-start justify-between gap-3 rounded-lg px-1 py-1 text-left transition hover:bg-background/80"
                  >
                    <span className="flex min-w-0 items-start gap-2">
                      <span
                        className="mt-1 size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: row.color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">
                          {row.name}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="font-medium">
                            {row.modeLabel}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatNumber(row.unitCount)} {row.unitLabel}
                          </span>
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {formatCurrency(row.price)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Todavía no hay zonas ni mesas. Diseñá el plano para ver aforo,
              recaudación y sectores en un solo lugar.
            </p>
          )}
        </article>
      </div>

      <Button
        type="button"
        onClick={onOpen}
        className={cn(
          "bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-12 rounded-xl w-full mt-4",
        )}
      >
        <Map className="size-4" aria-hidden="true" />
        DISEÑAR MAPA EN PANTALLA COMPLETA
      </Button>
    </div>
  )
}
