"use client"

import { Sparkles } from "lucide-react"
import { useMemo, useState } from "react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { MAX_TICKETS_PER_PURCHASE } from "@/lib/checkout-limits"
import { formatCurrency } from "@/lib/format"
import {
  assignContiguousSeats,
  buildAccessibleSeatTree,
  type AccessibleSectorNode,
} from "@/lib/seating/accessible-seat-tree"
import { flattenVenueMapSeats } from "@/lib/seating/venue-map-geometry"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import { cn } from "@/lib/utils"
import type { StorefrontLayoutSeat } from "@/lib/stores/storefront-seat-store"
import type { InteractiveVenueMap, VenueMapZone } from "@/types/venue-map"

export function AccessibleSeatSelector({
  map,
  occupancyBySeatId = {},
  selectedSeatIds,
  selectedZoneId = null,
  unavailableZoneIds = [],
  pending = false,
  onSelectZone,
  onToggleSeat,
  onAssignSeats,
  onAssignZoneQuantity,
}: {
  map: InteractiveVenueMap
  occupancyBySeatId?: Record<string, SeatStatus>
  selectedSeatIds: string[]
  selectedZoneId?: string | null
  unavailableZoneIds?: string[]
  pending?: boolean
  onSelectZone?: (zone: VenueMapZone) => void
  onToggleSeat: (seat: StorefrontLayoutSeat) => void
  onAssignSeats: (seats: StorefrontLayoutSeat[]) => void
  onAssignZoneQuantity: (sectorId: string, quantity: number) => void
}) {
  const selected = useMemo(() => new Set(selectedSeatIds), [selectedSeatIds])
  const sectors = useMemo(
    () =>
      buildAccessibleSeatTree({
        map,
        occupancyBySeatId,
        selectedSeatIds: selected,
        unavailableZoneIds,
      }),
    [map, occupancyBySeatId, selected, unavailableZoneIds],
  )
  const flatSeats = useMemo(() => flattenVenueMapSeats(map), [map])
  const numberedSectors = sectors.filter((sector) => sector.kind === "numbered")
  const [autoSectorId, setAutoSectorId] = useState(
    () => numberedSectors[0]?.id ?? sectors[0]?.id ?? "",
  )
  const [autoQuantity, setAutoQuantity] = useState(2)
  const [autoError, setAutoError] = useState<string | null>(null)

  const autoSector =
    sectors.find((sector) => sector.id === autoSectorId) ?? sectors[0] ?? null

  function handleAssign() {
    if (!autoSector || pending) return
    const quantity = Math.min(
      MAX_TICKETS_PER_PURCHASE,
      Math.max(1, autoQuantity),
    )
    if (autoSector.kind === "ga") {
      if (autoSector.soldOut) {
        setAutoError("Ese sector no tiene lugares disponibles.")
        return
      }
      setAutoError(null)
      onAssignZoneQuantity(autoSector.id, quantity)
      return
    }
    const found = assignContiguousSeats({
      seats: flatSeats,
      sectorId: autoSector.id,
      quantity,
      occupancyBySeatId,
      selectedSeatIds: selected,
    })
    if (found.length === 0) {
      setAutoError(
        "No hay asientos juntos en ese sector. Probá otra cantidad o sector.",
      )
      return
    }
    setAutoError(null)
    onAssignSeats(
      found.map((seat) => ({
        id: seat.id,
        row: seat.row,
        number: seat.number,
        sectorId: seat.sectorId,
        sectorName: seat.sectorName,
        price: seat.price,
        color: seat.color,
        label: seat.label,
      })),
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-6">
        <AutoAssignCard
          sectors={sectors}
          sectorId={autoSector?.id ?? ""}
          quantity={autoQuantity}
          error={autoError}
          pending={pending}
          onSectorChange={(value) => {
            setAutoSectorId(value)
            setAutoError(null)
          }}
          onQuantityChange={(value) => {
            setAutoQuantity(value)
            setAutoError(null)
          }}
          onAssign={handleAssign}
        />

        {sectors.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No hay sectores publicados para elegir en lista.
          </p>
        ) : (
          <Accordion
            multiple
            className="mt-4 overflow-hidden rounded-2xl border border-border"
          >
            {sectors.map((sector) => (
              <AccordionItem key={sector.id} value={sector.id} className="px-3">
                <AccordionTrigger className="min-h-12 py-3 hover:no-underline">
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className="size-3.5 shrink-0 rounded-full ring-1 ring-border"
                      style={{ backgroundColor: sector.color }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 text-left">
                      <span className="block truncate font-semibold text-foreground">
                        {sector.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {sector.soldOut
                          ? "Agotado"
                          : sector.kind === "ga"
                            ? formatCurrency(sector.price)
                            : `${sector.availableCount} libres · ${formatCurrency(sector.price)}`}
                      </span>
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {sector.kind === "ga" ? (
                    <div className="pb-3">
                      <p className="text-sm text-muted-foreground">
                        Acceso general. No hace falta elegir butaca.
                      </p>
                      <Button
                        type="button"
                        disabled={pending || sector.soldOut}
                        onClick={() => {
                          const zone = (map.zones ?? []).find(
                            (item) => item.id === sector.id,
                          )
                          if (zone) onSelectZone?.(zone)
                          else onAssignZoneQuantity(sector.id, 1)
                        }}
                        className="mt-3 h-11 w-full rounded-xl"
                      >
                        {selectedZoneId === sector.id
                          ? "Sector seleccionado"
                          : "Elegir este sector"}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4 pb-3">
                      {sector.rows.map((row) => (
                        <div key={row.id}>
                          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                            Fila {row.label}
                          </p>
                          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                            {row.seats.map((seat) => {
                              const disabled =
                                pending ||
                                seat.status === "occupied" ||
                                seat.status === "blocked"
                              const picked = seat.status === "selected"
                              return (
                                <button
                                  key={seat.id}
                                  type="button"
                                  disabled={disabled}
                                  aria-pressed={picked}
                                  aria-label={
                                    disabled
                                      ? `Asiento ${seat.number} ocupado`
                                      : `Asiento ${seat.number} de la fila ${row.label}`
                                  }
                                  onClick={() => {
                                    const source = flatSeats.find(
                                      (item) => item.id === seat.id,
                                    )
                                    if (!source) return
                                    onToggleSeat({
                                      id: source.id,
                                      row: source.row,
                                      number: source.number,
                                      sectorId: source.sectorId,
                                      sectorName: source.sectorName,
                                      price: source.price,
                                      color: source.color,
                                      label: source.label,
                                    })
                                  }}
                                  className={cn(
                                    "grid size-11 place-items-center rounded-lg border-2 text-sm font-bold transition-colors",
                                    disabled &&
                                      "cursor-not-allowed border-border bg-muted text-muted-foreground",
                                    !disabled &&
                                      !picked &&
                                      "border-primary bg-transparent text-foreground hover:bg-primary/10",
                                    picked &&
                                      "border-primary bg-primary text-primary-foreground",
                                  )}
                                >
                                  {seat.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  )
}

function AutoAssignCard({
  sectors,
  sectorId,
  quantity,
  error,
  pending,
  onSectorChange,
  onQuantityChange,
  onAssign,
}: {
  sectors: AccessibleSectorNode[]
  sectorId: string
  quantity: number
  error: string | null
  pending: boolean
  onSectorChange: (sectorId: string) => void
  onQuantityChange: (quantity: number) => void
  onAssign: () => void
}) {
  return (
    <section className="rounded-2xl border border-primary/35 bg-primary/10 p-4">
      <p className="flex items-center gap-2 text-sm font-extrabold text-foreground">
        <Sparkles className="size-4 text-primary" aria-hidden="true" />
        Buscar el mejor lugar automáticamente
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Elegí cuántas entradas y el sector. Asignamos lugares juntos si el
        plano tiene butacas.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-foreground">
          Cantidad
          <input
            type="number"
            min={1}
            max={MAX_TICKETS_PER_PURCHASE}
            value={quantity}
            disabled={pending}
            onChange={(event) =>
              onQuantityChange(
                Math.min(
                  MAX_TICKETS_PER_PURCHASE,
                  Math.max(1, Number(event.target.value) || 1),
                ),
              )
            }
            className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-foreground"
          />
        </label>
        <label className="block text-sm font-medium text-foreground">
          Sector
          <select
            value={sectorId}
            disabled={pending || sectors.length === 0}
            onChange={(event) => onSectorChange(event.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-foreground"
          >
            {sectors.map((sector) => (
              <option key={sector.id} value={sector.id} disabled={sector.soldOut}>
                {sector.name}
                {sector.soldOut ? " (agotado)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <p className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-200" role="status">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        disabled={pending || !sectorId}
        onClick={onAssign}
        className="mt-3 h-11 w-full rounded-xl font-bold"
      >
        Asignar lugares
      </Button>
    </section>
  )
}
