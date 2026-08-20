"use client"

import { Minus, Plus, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { AccessiblePlaceGrid } from "@/components/public/accessible-place-grid"
import { SeatSelectionSplitMap } from "@/components/public/seat-selection-split-map"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useLockBodyScroll } from "@/hooks/use-lock-body-scroll"
import {
  resolvePurchaseLimit,
  storefrontLimitMessage,
} from "@/lib/checkout-limits"
import { formatTicketPrice } from "@/lib/format"
import { buildAccessibleSeatTree } from "@/lib/seating/accessible-seat-tree"
import { resolveSectorAssignMeta } from "@/lib/seating/assign-best-seats"
import {
  formatStorefrontSelectionGroups,
  storefrontItemFromElement,
  storefrontItemFromZone,
} from "@/lib/seating/storefront-selection"
import type {
  UniversalSeatSelection,
  UniversalSector,
  SeatStatus,
} from "@/lib/seating/universal-seat-types"
import { flattenSeatsForAvailability } from "@/lib/seating/venue-map-geometry"
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
  sectorSummaries?: Array<{
    sectorId: string
    sectorName: string
    available: number
    tierId?: string | null
  }>
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
  selectionMode = "auto",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  sectorId?: string | null
  pending?: boolean
  maxTicketsPerUser?: number | null
  context: SeatSelectionContext
  selectionMode?: "auto" | "map" | "counter"
}) {
  const selectedItems = useStorefrontSeatStore((state) => state.selectedItems)
  const selectedUnitIds = useMemo(
    () => selectedItems.map((item) => item.id),
    [selectedItems],
  )
  const [mapExpanded, setMapExpanded] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    setMapExpanded(open)
  }
  const [peopleCount, setPeopleCount] = useState(1)

  useLockBodyScroll(open)

  const mapSeats = useMemo(
    () => (context.map ? flattenSeatsForAvailability(context.map) : []),
    [context.map],
  )

  const sectors = useMemo(() => {
    if (!context.map) return []
    return buildAccessibleSeatTree({
      map: context.map,
      occupancyBySeatId: context.occupancyBySeatId,
      selectedSeatIds: selectedUnitIds,
      unavailableZoneIds: context.unavailableZoneIds,
    })
  }, [
    context.map,
    context.occupancyBySeatId,
    context.unavailableZoneIds,
    selectedUnitIds,
  ])

  const targetSector = useMemo(() => {
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
  }, [sectorId, sectors])

  const assignMeta = useMemo(() => {
    if (!context.map || !targetSector) {
      return {
        isTableSector: false,
        capacityPerUnit: 1,
        sellMode: "per_seat" as const,
        unitNoun: "mesa" as const,
      }
    }
    return resolveSectorAssignMeta(
      context.map,
      targetSector.id,
      mapSeats,
      targetSector.name,
    )
  }, [context.map, mapSeats, targetSector])

  const isTableSector = assignMeta.isTableSector
  const isGeneralAdmission =
    selectionMode === "counter" ||
    (selectionMode !== "map" && targetSector?.kind === "ga")
  const showFullMap = !isGeneralAdmission
  const placeCount = storefrontSelectionCount(selectedItems)
  const placeTotal = storefrontSelectionTotal(selectedItems)
  const canConfirm = placeCount > 0
  const assistantLine = formatAssistantLine(selectedItems, placeTotal)
  const emptyPrompt = isTableSector
    ? "Seleccioná una mesa en la lista o en el mapa."
    : "Seleccioná un lugar en la lista o en el mapa."
  const assignZoneQuantity = context.onAssignZoneQuantity
  const targetSectorId = targetSector?.id ?? null

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      const store = useStorefrontSeatStore.getState()
      const existing = storefrontSelectionCount(store.selectedItems)
      const nextCount = Math.max(1, existing || 1)
      setPeopleCount(nextCount)
      const ids = store.selectedItems.map((item) => item.id)
      if (ids.length > 0) store.pulseFocus(ids)
      if (isGeneralAdmission && targetSectorId) {
        assignZoneQuantity(targetSectorId, nextCount)
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open, isGeneralAdmission, targetSectorId, assignZoneQuantity])

  function handleTogglePlace(seatId: string) {
    if (pending || !context.map) return
    const store = useStorefrontSeatStore.getState()
    const element = (context.map.elements ?? []).find((item) => item.id === seatId)
    if (
      element &&
      (element.sellMode === "group" || element.type === "standing_zone")
    ) {
      const item = storefrontItemFromElement(element, context.priceBySectorId)
      if (!item) return
      const result = store.toggleSelectedItem(item, maxTicketsPerUser)
      if (!result.ok) {
        toast.error(storefrontLimitMessage(result.reason))
        return
      }
      store.pulseFocus([element.id])
      return
    }

    const zone = (context.map.zones ?? []).find((item) => item.id === seatId)
    if (zone) {
      const item = storefrontItemFromZone(zone, context.priceBySectorId)
      if (!item) return
      const result = store.toggleSelectedItem(item, maxTicketsPerUser)
      if (!result.ok) {
        toast.error(storefrontLimitMessage(result.reason))
        return
      }
      store.pulseFocus([zone.id])
      return
    }

    const source = mapSeats.find((item) => item.id === seatId)
    if (!source) return
    const result = store.toggleLayoutSeat(
      {
        id: source.id,
        row: source.row,
        number: source.number,
        sectorId: source.sectorId,
        sectorName: source.sectorName,
        price: source.price,
        color: source.color,
        label: source.label,
      },
      maxTicketsPerUser,
    )
    if (!result.ok) {
      toast.error(storefrontLimitMessage(result.reason))
      return
    }
    store.pulseFocus([source.id])
  }

  function handleConfirm() {
    if (!canConfirm) return
    context.onConfirmed()
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && mapExpanded) {
          setMapExpanded(false)
          return
        }
        onOpenChange(next)
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        overlayClassName="z-[100]"
        className={cn(
          "z-[100] flex flex-col gap-0 overflow-hidden rounded-none p-0",
          isGeneralAdmission
            ? "h-auto max-h-[min(36rem,90dvh)]"
            : "h-[100dvh] max-h-[100dvh]",
          "lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:max-h-[88dvh] lg:w-[min(56rem,94vw)] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl",
          isGeneralAdmission
            ? "lg:h-auto"
            : "lg:h-[min(88dvh,840px)]",
        )}
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 py-3 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-lg font-bold tracking-tight">
                {title}
              </SheetTitle>
              <SheetDescription className="mt-0.5 text-sm text-muted-foreground">
                {isGeneralAdmission
                  ? "Indicá cuántas entradas querés."
                  : "El mapa de arriba muestra dónde queda el lugar que elijas abajo."}
              </SheetDescription>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          {showFullMap ? (
            <SeatSelectionSplitMap
              map={context.map}
              eventId={context.eventId}
              eventTitle={context.eventTitle}
              pending={pending}
              maxSelectable={maxTicketsPerUser}
              selectedZoneId={context.selectedZoneId}
              unavailableZoneIds={context.unavailableZoneIds}
              occupancyBySeatId={context.occupancyBySeatId}
              heldSeatIds={context.heldSeatIds}
              priceBySectorId={context.priceBySectorId}
              sectors={context.sectors}
              expanded={mapExpanded}
              onExpandedChange={setMapExpanded}
              onSelectZone={context.onSelectZone}
              onContinue={context.onUniversalContinue}
            />
          ) : null}

          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            {isGeneralAdmission ? (
              <GeneralAdmissionPicker
                pending={pending}
                peopleCount={peopleCount}
                maxPeople={resolvePurchaseLimit(maxTicketsPerUser) ?? 20}
                sectorName={targetSector?.name ?? title}
                unitKind="access"
                onChange={(next) => {
                  setPeopleCount(next)
                  if (targetSector) {
                    context.onAssignZoneQuantity(targetSector.id, next)
                  }
                }}
              />
            ) : (
              <AccessiblePlaceGrid
                pending={pending}
                rows={targetSector?.rows ?? []}
                onToggle={(seat) => handleTogglePlace(seat.id)}
              />
            )}
          </div>
        </div>

        <div className="sticky bottom-0 z-10 mt-auto shrink-0 border-t border-border bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {canConfirm ? (
            <p className="mb-3 text-center text-lg font-bold leading-snug text-foreground">
              {assistantLine}
            </p>
          ) : (
            <p className="mb-3 text-center text-sm text-muted-foreground">
              {emptyPrompt}
            </p>
          )}
          <Button
            type="button"
            disabled={!canConfirm || pending}
            onClick={handleConfirm}
            className={cn(
              tapFeedbackClass,
              "h-auto w-full rounded-2xl py-3.5 text-base font-bold transition-all duration-200",
            )}
          >
            {canConfirm
              ? `Confirmar ${placeCount} ${placeCount === 1 ? "lugar" : "lugares"} · ${formatTicketPrice(placeTotal)}`
              : "Confirmá al menos un lugar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function formatAssistantLine(
  items: StorefrontSelectedItem[],
  total: number,
): string {
  const groups = formatStorefrontSelectionGroups(items)
  const names = groups
    .map((group) => group.placeLabel || group.label)
    .filter((name) => name.trim().length > 0)
  const accesses = items.reduce(
    (sum, item) => sum + Math.max(1, Math.floor(item.capacity) || 1),
    0,
  )
  const accessLabel = accesses === 1 ? "1 acceso" : `${accesses} accesos`
  const heading = names.join(" · ") || "Selección"
  return `${heading} · ${accessLabel} · ${formatTicketPrice(total)}`
}

function quantityUnitLabel(
  count: number,
  unitKind: "access" | "person",
): string {
  if (unitKind === "person") {
    return count === 1 ? "1 persona" : `${count} personas`
  }
  return count === 1 ? "1 acceso" : `${count} accesos`
}

function GeneralAdmissionPicker({
  sectorName,
  peopleCount,
  maxPeople,
  pending,
  unitKind,
  onChange,
}: {
  sectorName: string
  peopleCount: number
  maxPeople: number
  pending: boolean
  unitKind: "access" | "person"
  onChange: (next: number) => void
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <h3 className="mb-2 text-center text-lg font-bold text-gray-900 dark:text-foreground">
        {sectorName}
      </h3>
      <p className="text-center text-sm text-muted-foreground">
        Acceso general. Indicá cuántas{" "}
        {unitKind === "person" ? "personas" : "entradas"} querés.
      </p>
      <div className="flex items-center gap-3 rounded-full bg-secondary/50 px-1 py-1">
        <button
          type="button"
          disabled={pending || peopleCount <= 1}
          onClick={() => onChange(Math.max(1, peopleCount - 1))}
          className={cn(
            tapFeedbackClass,
            "flex size-12 items-center justify-center rounded-full hover:bg-background disabled:opacity-40",
          )}
          aria-label="Quitar"
        >
          <Minus className="size-4" />
        </button>
        <span className="min-w-16 text-center text-lg font-black tabular-nums">
          {quantityUnitLabel(peopleCount, unitKind)}
        </span>
        <button
          type="button"
          disabled={pending || peopleCount >= maxPeople}
          onClick={() => onChange(Math.min(maxPeople, peopleCount + 1))}
          className={cn(
            tapFeedbackClass,
            "flex size-12 items-center justify-center rounded-full hover:bg-background disabled:opacity-40",
          )}
          aria-label="Agregar"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  )
}
