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
  compactSeatToken,
  groupSeatsForMatrix,
} from "@/lib/seating/accessible-seat-matrix"
import {
  assignContiguousSeats,
  buildAccessibleSeatTree,
  type AccessibleSeatNode,
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
  referenceImageUrl = null,
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
  referenceImageUrl?: string | null
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

  const referenceSrc = referenceImageUrl?.trim() || map.backgroundImage?.trim() || ""

  return (
    <div className="w-full space-y-6 bg-transparent">
      {referenceSrc ? (
        <figure className="mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={referenceSrc}
            alt="Plano de referencia del recinto"
            className="mb-2 h-auto max-h-[300px] w-full rounded-xl border object-contain shadow-sm"
          />
          <figcaption className="text-xs text-muted-foreground">
            Plano de referencia. Los colores y sectores pueden variar.
          </figcaption>
        </figure>
      ) : null}
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
        <p className="text-sm text-muted-foreground">
          No hay sectores publicados para elegir en lista.
        </p>
      ) : (
        <div className="space-y-4">
          {sectors.map((sector) => (
            <Accordion
              key={sector.id}
              multiple
              className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
            >
              <AccordionItem value={sector.id} className="border-0 px-2">
                <AccordionTrigger className="min-h-12 px-4 py-4 hover:no-underline">
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
                    <div className="px-4 pb-6">
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
                        className="mt-4 h-auto w-full rounded-xl p-6 font-bold shadow-sm"
                      >
                        {selectedZoneId === sector.id
                          ? "Sector seleccionado"
                          : "Elegir este sector"}
                      </Button>
                    </div>
                  ) : (
                    <div className="px-4 pb-6">
                      {groupSeatsForMatrix(sector.rows).map((group, index) => (
                        <div key={group.title}>
                          <h4
                            className={cn(
                              "mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                              index === 0 ? "mt-1" : "mt-6",
                            )}
                          >
                            {group.title}
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {group.seats.map((seat) => (
                              <SeatMatrixButton
                                key={seat.id}
                                seat={seat}
                                groupTitle={group.title}
                                pending={pending}
                                onToggle={() => {
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
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ))}
        </div>
      )}
    </div>
  )
}

function SeatMatrixButton({
  seat,
  groupTitle,
  pending,
  onToggle,
}: {
  seat: AccessibleSeatNode
  groupTitle: string
  pending: boolean
  onToggle: () => void
}) {
  const token = compactSeatToken(seat.label, seat.number)
  const taken = seat.status === "occupied" || seat.status === "blocked"
  const selected = seat.status === "selected"
  const disabled = pending || taken

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      aria-label={
        taken
          ? `${groupTitle} ${token} ocupado`
          : `${groupTitle} ${token}`
      }
      onClick={onToggle}
      className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-sm font-medium tabular-nums transition-colors",
        !disabled &&
          !selected &&
          "border border-input bg-background text-foreground hover:border-primary hover:bg-primary/10",
        selected &&
          "border border-primary bg-primary text-primary-foreground shadow-sm",
        taken &&
          "cursor-not-allowed border-transparent bg-muted text-muted-foreground opacity-50",
      )}
    >
      {token}
    </button>
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
    <section className="rounded-xl border border-primary/35 bg-primary/10 p-6 shadow-sm">
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
        className="mt-4 h-auto w-full rounded-xl p-6 font-bold shadow-sm"
      >
        Asignar lugares
      </Button>
    </section>
  )
}
