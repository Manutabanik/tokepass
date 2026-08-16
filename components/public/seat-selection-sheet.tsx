"use client"

import { Minus, Plus, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { AdaptiveSeatingFlow } from "@/components/public/adaptive-seating-flow"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLockBodyScroll } from "@/hooks/use-lock-body-scroll"
import { resolvePurchaseLimit } from "@/lib/checkout-limits"
import { formatCurrency } from "@/lib/format"
import { buildAccessibleSeatTree } from "@/lib/seating/accessible-seat-tree"
import { suggestAssignmentForPeople } from "@/lib/seating/assign-best-seats"
import type {
  UniversalSeatSelection,
  UniversalSector,
  SeatStatus,
} from "@/lib/seating/universal-seat-types"
import { flattenVenueMapSeats } from "@/lib/seating/venue-map-geometry"
import {
  storefrontSelectionCount,
  storefrontSelectionTotal,
  useStorefrontSeatStore,
  type StorefrontLayoutSeat,
  type StorefrontSelectedItem,
} from "@/lib/stores/storefront-seat-store"
import { cn, tapFeedbackClass } from "@/lib/utils"
import type { InteractiveVenueMap, VenueMapElement, VenueMapZone } from "@/types/venue-map"

export type SeatSelectionContext = {
  map: InteractiveVenueMap | null
  eventId?: string | null
  heldSeatIds?: string[]
  occupancyBySeatId: Record<string, SeatStatus>
  priceBySectorId: Record<string, number>
  selectedZoneId: string | null
  unavailableZoneIds: string[]
  eventTitle: string
  sectors: UniversalSector[]
  onAssignSeats: (seats: StorefrontLayoutSeat[]) => void
  onAssignTables: (tables: VenueMapElement[]) => void
  onAssignZoneQuantity: (sectorId: string, quantity: number) => void
  onSelectZone: (zone: VenueMapZone) => void
  onUniversalContinue: (selection: UniversalSeatSelection) => void
  onConfirmed: () => void
}

export function selectedPlacesForCategory(
  items: StorefrontSelectedItem[],
  sectorId?: string | null,
) {
  const relevant = sectorId
    ? items.filter((item) => item.sectorId === sectorId)
    : items
  return relevant.map((item) => item.name).filter((name) => name.trim().length > 0)
}

export function SeatSelectionSheet({
  open,
  onOpenChange,
  title,
  sectorId = null,
  pending = false,
  maxTicketsPerUser = null,
  context,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  sectorId?: string | null
  pending?: boolean
  maxTicketsPerUser?: number | null
  context: SeatSelectionContext
}) {
  const selectedItems = useStorefrontSeatStore((state) => state.selectedItems)
  const layoutSeats = useStorefrontSeatStore((state) => state.layoutSeats)
  const selectedSeatIds = useMemo(
    () => layoutSeats.map((seat) => seat.id),
    [layoutSeats],
  )
  const [tab, setTab] = useState<"list" | "map">("list")
  const [quantity, setQuantity] = useState(2)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [justAssigned, setJustAssigned] = useState(false)
  const preserveSelectionRef = useRef<number | null>(null)

  useLockBodyScroll(open)

  useEffect(() => {
    if (!open) return
    setTab("list")
    setAssignError(null)
    const existing = storefrontSelectionCount(
      useStorefrontSeatStore.getState().selectedItems,
    )
    if (existing > 0) {
      setQuantity(existing)
      setJustAssigned(true)
      preserveSelectionRef.current = existing
    } else {
      setJustAssigned(false)
      preserveSelectionRef.current = null
    }
    useStorefrontSeatStore.getState().setView("list")
  }, [open])

  const purchaseCap = resolvePurchaseLimit(maxTicketsPerUser) ?? 20
  const placeCount = storefrontSelectionCount(selectedItems)
  const placeTotal = storefrontSelectionTotal(selectedItems)
  const canConfirm = placeCount > 0

  const sectors = useMemo(() => {
    if (!context.map) return []
    return buildAccessibleSeatTree({
      map: context.map,
      occupancyBySeatId: context.occupancyBySeatId,
      selectedSeatIds,
      unavailableZoneIds: context.unavailableZoneIds,
    })
  }, [
    context.map,
    context.occupancyBySeatId,
    context.unavailableZoneIds,
    selectedSeatIds,
  ])

  function resolveTargetSector() {
    const preferred = sectorId
      ? sectors.find((sector) => sector.id === sectorId)
      : null
    return (
      preferred ??
      sectors.find((item) => item.kind === "numbered" && !item.soldOut) ??
      sectors.find((item) => !item.soldOut) ??
      sectors[0] ??
      null
    )
  }

  function handleAssignBest() {
    if (pending || !context.map || quantity < 1) return
    const sector = resolveTargetSector()

    if (!sector) {
      setAssignError("No hay sectores disponibles para asignar.")
      return
    }

    if (sector.kind === "ga") {
      context.onAssignZoneQuantity(sector.id, quantity)
      setAssignError(null)
      setJustAssigned(true)
      return
    }

    const suggestion = suggestAssignmentForPeople({
      map: context.map,
      seats: flattenVenueMapSeats(context.map),
      sectorId: sector.id,
      sectorName: sector.name,
      people: quantity,
      isTableSector: sector.isTableSector,
      capacityPerUnit: sector.capacityPerUnit,
      occupancyBySeatId: context.occupancyBySeatId,
    })

    if (suggestion.kind === "tables") {
      context.onAssignTables(suggestion.tables)
      useStorefrontSeatStore
        .getState()
        .pulseFocus(suggestion.tables.map((table) => table.id))
      setAssignError(null)
      setJustAssigned(true)
      return
    }

    if (suggestion.kind === "seats") {
      context.onAssignSeats(
        suggestion.seats.map((seat) => ({
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
      useStorefrontSeatStore
        .getState()
        .pulseFocus(suggestion.seats.map((seat) => seat.id))
      setAssignError(null)
      setJustAssigned(true)
      return
    }

    setAssignError(
      "No hay lugares juntos disponibles. Probá otra cantidad o elegí en el mapa.",
    )
  }

  useEffect(() => {
    if (!open || tab !== "list" || pending || !context.map || quantity < 1) {
      return
    }
    if (preserveSelectionRef.current === quantity) return
    handleAssignBest()
  }, [open, tab, quantity, sectorId, pending, context.map])

  function handleConfirm() {
    if (!canConfirm) return
    context.onConfirmed()
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        overlayClassName="z-[100]"
        className={cn(
          "z-[100] h-[92dvh] max-h-[92dvh] gap-0 overflow-hidden p-0",
          "lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:h-[min(88dvh,840px)] lg:max-h-[88dvh] lg:w-[min(56rem,94vw)] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl",
        )}
      >
        <SheetHeader className="flex-none border-b border-border px-4 py-3 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-lg font-bold tracking-tight">
                {title}
              </SheetTitle>
              <SheetDescription className="mt-0.5 text-sm text-muted-foreground">
                Indicá cuántas personas son y te armamos la mejor combinación.
              </SheetDescription>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => {
            const next = value === "map" ? "map" : "list"
            setTab(next)
            useStorefrontSeatStore.getState().setView(next)
          }}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="flex-none px-4 pt-3">
            <TabsList className="h-11 w-full rounded-full bg-secondary/70 p-1 group-data-horizontal/tabs:h-11">
              <TabsTrigger
                value="list"
                className="rounded-full px-3 text-sm font-semibold data-active:bg-background data-active:text-foreground"
              >
                Búsqueda Rápida
              </TabsTrigger>
              <TabsTrigger
                value="map"
                className="rounded-full px-3 text-sm font-semibold data-active:bg-background data-active:text-foreground"
              >
                Elegir en el Mapa
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="list"
            className="no-scrollbar mt-0 flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5"
          >
            <p className="text-center text-base font-semibold text-foreground">
              ¿Cuántas personas son?
            </p>
            <div className="mt-4 flex items-center justify-center">
              <div className="flex items-center gap-3 rounded-full bg-secondary/50 px-1 py-1">
                <button
                  type="button"
                  disabled={pending || quantity <= 1}
                  onClick={() => {
                    preserveSelectionRef.current = null
                    setQuantity((current) => Math.max(1, current - 1))
                    setAssignError(null)
                  }}
                  className={cn(
                    tapFeedbackClass,
                    "flex size-10 items-center justify-center rounded-full hover:bg-background disabled:opacity-40",
                  )}
                  aria-label="Quitar"
                >
                  <Minus className="size-4" />
                </button>
                <span className="w-8 text-center text-2xl font-black tabular-nums">
                  {quantity}
                </span>
                <button
                  type="button"
                  disabled={pending || quantity >= purchaseCap}
                  onClick={() => {
                    preserveSelectionRef.current = null
                    setQuantity((current) => Math.min(purchaseCap, current + 1))
                    setAssignError(null)
                  }}
                  className={cn(
                    tapFeedbackClass,
                    "flex size-10 items-center justify-center rounded-full hover:bg-background disabled:opacity-40",
                  )}
                  aria-label="Agregar"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {justAssigned
                ? `Combinación sugerida para ${quantity} ${quantity === 1 ? "persona" : "personas"}.`
                : "Buscamos mesas o sillas juntas para tu grupo."}
            </p>
            <Button
              type="button"
              disabled={pending || !context.map}
              onClick={handleAssignBest}
              className={cn(
                tapFeedbackClass,
                "mt-4 h-auto w-full rounded-2xl py-3.5 text-base font-bold",
              )}
            >
              Recalcular mejor combinación
            </Button>
            {assignError ? (
              <p className="mt-3 text-center text-sm text-destructive">
                {assignError}
              </p>
            ) : null}

            {justAssigned && context.map ? (
              <div className="mt-5 min-h-[200px] flex-1 overflow-hidden rounded-2xl border border-primary/20 bg-zinc-950">
                <AdaptiveSeatingFlow
                  immersive
                  readOnly
                  pending={pending}
                  maxSelectable={maxTicketsPerUser}
                  eventId={context.eventId}
                  eventTitle={context.eventTitle}
                  venueMap={context.map}
                  selectedZoneId={context.selectedZoneId}
                  unavailableZoneIds={context.unavailableZoneIds}
                  occupancyBySeatId={context.occupancyBySeatId}
                  heldSeatIds={context.heldSeatIds}
                  priceBySectorId={context.priceBySectorId}
                  sectors={context.sectors}
                />
              </div>
            ) : null}
          </TabsContent>

          <TabsContent
            value="map"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {context.map ? (
              <div className="min-h-0 flex-1">
                <AdaptiveSeatingFlow
                  immersive
                  pending={pending}
                  maxSelectable={maxTicketsPerUser}
                  eventId={context.eventId}
                  eventTitle={context.eventTitle}
                  venueMap={context.map}
                  selectedZoneId={context.selectedZoneId}
                  unavailableZoneIds={context.unavailableZoneIds}
                  occupancyBySeatId={context.occupancyBySeatId}
                  heldSeatIds={context.heldSeatIds}
                  priceBySectorId={context.priceBySectorId}
                  sectors={context.sectors}
                  onSelectZone={context.onSelectZone}
                  onContinue={context.onUniversalContinue}
                />
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                El plano no está disponible.
              </p>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex-none border-t border-border bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Button
            type="button"
            disabled={!canConfirm || pending}
            onClick={handleConfirm}
            className={cn(
              tapFeedbackClass,
              "h-auto w-full rounded-2xl py-3.5 text-base font-bold",
            )}
          >
            {canConfirm
              ? `Confirmar selección de ${placeCount} ${placeCount === 1 ? "lugar" : "lugares"} · ${formatCurrency(placeTotal)}`
              : "Confirmá al menos un lugar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
