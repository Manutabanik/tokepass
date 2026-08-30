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
  disabled = false,
  disabledReason,
  openLabel = "DISEÑAR MAPA EN PANTALLA COMPLETA",
}: {
  map: InteractiveVenueMap
  onOpen: () => void
  disabled?: boolean
  disabledReason?: string
  openLabel?: string
}) {
  const inventory = summarizeVenueInventory(map)
  const segments = inventory.sectors.filter((row) => row.share > 0)

  return (
    <div className="w-full max-w-full overflow-x-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-zinc-100 sm:p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <article className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 sm:col-span-1">
          <p className="truncate text-xs font-semibold tracking-wide text-zinc-400 uppercase">
            Aforo total
          </p>
          <p className="mt-2 truncate text-3xl font-bold tabular-nums tracking-tight text-zinc-100">
            {formatNumber(inventory.capacity)}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {inventory.capacity === 1 ? "lugar" : "lugares"}
            {inventory.elementCount > 0
              ? ` · ${formatNumber(inventory.elementCount)} ${inventory.elementLabel.toLocaleLowerCase("es")}`
              : ""}
          </p>
          <div
            className="mt-4 h-2.5 overflow-hidden rounded-full bg-zinc-800"
            role="img"
            aria-label="Distribucion del aforo por sector"
          >
            {segments.length > 0 ? (
              <div className="flex h-full w-full min-w-0">
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
              <div className="h-full w-full bg-zinc-800" />
            )}
          </div>
        </article>

        <article className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 sm:col-span-1">
          <p className="truncate text-xs font-semibold tracking-wide text-zinc-400 uppercase">
            Proyección de recaudación
          </p>
          <p className="mt-2 truncate text-3xl font-bold tabular-nums tracking-tight text-zinc-100">
            {formatCurrency(inventory.projectedRevenue)}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            Suma de capacidad por precio de cada sector
          </p>
        </article>

        <article className="col-span-1 min-w-0 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 sm:col-span-2">
          <p className="truncate text-xs font-semibold tracking-wide text-zinc-400 uppercase">
            Configuración de sectores
          </p>
          {inventory.sectors.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {inventory.sectors.map((row) => (
                <li key={row.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={onOpen}
                    className="flex w-full min-w-0 items-start justify-between gap-3 rounded-lg px-1 py-1 text-left transition hover:bg-zinc-800"
                  >
                    <span className="flex min-w-0 items-start gap-2">
                      <span
                        className="mt-1 size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: row.color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-zinc-100">
                          {row.name}
                        </span>
                        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="max-w-full truncate font-medium">
                            {row.modeLabel}
                          </Badge>
                          <span className="truncate text-xs text-muted-foreground">
                            {formatNumber(row.unitCount)} {row.unitLabel}
                          </span>
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-100">
                      {formatCurrency(row.price)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
              Todavía no hay zonas ni mesas. Diseñá el plano para ver aforo,
              recaudación y sectores en un solo lugar.
            </p>
          )}
        </article>
      </div>

      <div className="mt-4 w-full" title={disabled ? disabledReason : undefined}>
        <Button
          type="button"
          onClick={onOpen}
          disabled={disabled}
          aria-disabled={disabled}
          className={cn(
            "bg-primary hover:bg-primary/90 text-primary-foreground font-bold mt-0 h-12 w-full min-w-0 rounded-xl",
          )}
        >
          <Map className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{openLabel}</span>
        </Button>
        {disabled && disabledReason ? (
          <p className="mt-2 text-center text-xs text-red-600 dark:text-red-400">
            {disabledReason}
          </p>
        ) : null}
      </div>
    </div>
  )
}
