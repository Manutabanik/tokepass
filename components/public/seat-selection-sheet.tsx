"use client"

import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useState } from "react"
import { Minus, Plus } from "lucide-react"
import { toast } from "sonner"

import { InteractiveMapViewer } from "@/components/public/interactive-map-viewer"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLockBodyScroll } from "@/hooks/use-lock-body-scroll"
import {
  resolvePurchaseLimit,
  storefrontLimitMessage,
} from "@/lib/checkout-limits"
import { formatTicketPrice } from "@/lib/format"
import { logger } from "@/lib/logger"
import {
  compactSeatToken,
  groupSeatsForMatrix,
} from "@/lib/seating/accessible-seat-matrix"
import type {
  AccessibleRowNode,
  AccessibleSeatNode,
} from "@/lib/seating/accessible-seat-tree"
import { buildAccessibleSeatTree } from "@/lib/seating/accessible-seat-tree"
import { resolveSectorAssignMeta } from "@/lib/seating/assign-best-seats"
import {
  formatStorefrontSelectionGroups,
  isTablePurchaseSku,
  storefrontItemFromElement,
  storefrontItemFromZone,
} from "@/lib/seating/storefront-selection"
import type {
  UniversalSeatSelection,
  UniversalSector,
  SeatStatus,
} from "@/lib/seating/universal-seat-types"
import { resolveEffectiveSeatingType } from "@/lib/seating/seating-type"
import {
  elementInventorySectorId,
  flattenSeatsForAvailability,
} from "@/lib/seating/venue-map-geometry"
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
  const sector = sectorId?.trim()
  if (!sector) return []
  return items
    .filter((item) => item.sectorId === sector || item.id === sector)
    .map((item) => {
      if (item.type === "table" || item.inventoryType === "TABLES") {
        const seats = Math.max(1, Math.floor(item.capacity) || 1)
        return `Mesa completa (Incluye ${seats} accesos)`
      }
      return item.displayName?.trim() || item.name
    })
    .filter((name) => name.trim().length > 0)
}

class SeatModalErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error({
      context: "seat-selection-sheet",
      message: "seat_modal_inner_error",
      error,
      componentStack: info.componentStack,
    })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        <p className="text-sm font-semibold text-foreground">
          No pudimos cargar los lugares.
        </p>
        <p className="text-sm text-muted-foreground">
          Cerrá esta ventana y volvé a intentar. La cruz, ESC o el fondo oscuro
          siguen funcionando.
        </p>
      </div>
    )
  }
}

export function SeatSelectionSheet({
  open,
  onOpenChange,
  title,
  sectorId = null,
  pending = false,
  loading = false,
  maxTicketsPerUser = null,
  context,
  selectionMode = "auto",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  sectorId?: string | null
  pending?: boolean
  loading?: boolean
  maxTicketsPerUser?: number | null
  context: SeatSelectionContext
  selectionMode?: "auto" | "map" | "counter"
}) {
  const selectedItems = useStorefrontSeatStore((state) => state.selectedItems)
  const placeCount = storefrontSelectionCount(selectedItems)
  const placeTotal = storefrontSelectionTotal(selectedItems)
  const canConfirm = placeCount > 0

  useLockBodyScroll(open)

  function handleConfirm() {
    if (!canConfirm || pending) return
    context.onConfirmed()
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton
        overlayClassName="z-[100]"
        className={cn(
          "z-[100] flex h-[100dvh] max-h-[100dvh] flex-col gap-0 overflow-hidden rounded-none p-0",
          "lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:h-[min(88dvh,840px)] lg:max-h-[88dvh] lg:w-[min(56rem,94vw)] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl",
        )}
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 py-3 pr-14 text-left">
          <SheetTitle className="text-lg font-bold tracking-tight">
            {title}
          </SheetTitle>
          <SheetDescription className="mt-0.5 text-sm text-muted-foreground">
            Elegí un lugar de la lista o miralo en el mapa. Podés cerrar en
            cualquier momento.
          </SheetDescription>
        </SheetHeader>

        <SeatModalErrorBoundary>
          <SeatSelectionModalInner
            open={open}
            title={title}
            sectorId={sectorId}
            pending={pending}
            loading={loading}
            maxTicketsPerUser={maxTicketsPerUser}
            context={context}
            selectionMode={selectionMode}
          />
        </SeatModalErrorBoundary>

        <div className="sticky bottom-0 z-10 mt-auto shrink-0 border-t border-border bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {canConfirm ? (
            <p className="mb-3 text-center text-sm font-semibold leading-snug text-foreground">
              {formatAssistantLine(selectedItems, placeTotal)}
            </p>
          ) : (
            <p className="mb-3 text-center text-sm text-muted-foreground">
              Seleccioná un lugar para continuar.
            </p>
          )}
          <Button
            type="button"
            disabled={!canConfirm || pending}
            onClick={handleConfirm}
            className={cn(
              tapFeedbackClass,
              "h-auto w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white hover:bg-emerald-700",
            )}
          >
            Confirmar selección
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SeatSelectionModalInner({
  open,
  title,
  sectorId,
  pending,
  loading,
  maxTicketsPerUser,
  context,
  selectionMode,
}: {
  open: boolean
  title: string
  sectorId?: string | null
  pending: boolean
  loading: boolean
  maxTicketsPerUser: number | null
  context: SeatSelectionContext
  selectionMode: "auto" | "map" | "counter"
}) {
  const selectedItems = useStorefrontSeatStore((state) => state.selectedItems)
  const selectedUnitIds = useMemo(
    () => selectedItems.map((item) => item.id),
    [selectedItems],
  )
  const [peopleCount, setPeopleCount] = useState(1)

  const mapSeats = useMemo(() => {
    if (!context.map) return []
    try {
      return flattenSeatsForAvailability(context.map)
    } catch {
      return []
    }
  }, [context.map])

  const sectors = useMemo(() => {
    if (!context.map) return []
    try {
      return buildAccessibleSeatTree({
        map: context.map,
        occupancyBySeatId: context.occupancyBySeatId,
        selectedSeatIds: selectedUnitIds,
        unavailableZoneIds: context.unavailableZoneIds,
      })
    } catch {
      return []
    }
  }, [
    context.map,
    context.occupancyBySeatId,
    context.unavailableZoneIds,
    selectedUnitIds,
  ])

  const targetSector = useMemo(() => {
    if (sectorId) {
      return sectors.find((sector) => sector.id === sectorId) ?? null
    }
    return (
      sectors.find((item) => item.kind === "numbered" && !item.soldOut) ??
      sectors.find((item) => !item.soldOut) ??
      sectors[0] ??
      null
    )
  }, [sectorId, sectors])

  const targetZone = (context.map?.zones ?? []).find(
    (zone) => zone.id === (sectorId ?? targetSector?.id),
  )
  const selectedSectorName = targetZone?.name ?? targetSector?.name ?? title
  const focusedSectorId = targetZone?.id ?? targetSector?.id ?? sectorId ?? null

  const assignMeta = useMemo(() => {
    const sectorKey = targetZone?.id ?? targetSector?.id
    if (!context.map || !sectorKey) {
      return {
        isTableSector: false,
        capacityPerUnit: 1,
        sellMode: "per_seat" as const,
        unitNoun: "mesa" as const,
      }
    }
    return resolveSectorAssignMeta(
      context.map,
      sectorKey,
      mapSeats,
      selectedSectorName,
    )
  }, [context.map, mapSeats, selectedSectorName, targetSector, targetZone])

  const isTableSector = assignMeta.isTableSector
  const seatingType = targetZone
    ? resolveEffectiveSeatingType(targetZone, context.map)
    : targetSector?.seatingType
  const inventoryType = resolveSectorInventoryType({
    layoutType: targetZone?.layoutType,
    isTableSector,
    seatingType,
  })
  const seatsPerTable =
    targetZone?.capacityPerUnit || assignMeta.capacityPerUnit || 0
  const isGeneralAdmission =
    inventoryType === "GENERAL_ADMISSION" &&
    (seatingType === "GENERAL" ||
      selectionMode === "counter" ||
      targetSector?.kind === "ga")

  const fallbackPrice =
    (focusedSectorId ? context.priceBySectorId[focusedSectorId] : undefined) ??
    targetZone?.price ??
    targetSector?.price ??
    0

  const quickPlaces = useMemo(
    () =>
      buildQuickPlaces({
        rows: targetSector?.rows ?? [],
        inventoryType,
        sellMode: assignMeta.sellMode,
        unitNoun: assignMeta.unitNoun,
        fallbackPrice,
      }),
    [
      assignMeta.sellMode,
      assignMeta.unitNoun,
      fallbackPrice,
      inventoryType,
      targetSector?.rows,
    ],
  )

  const focusedMap = useMemo(() => {
    if (!context.map || !focusedSectorId) return context.map
    return isolateSectorMap(context.map, focusedSectorId)
  }, [context.map, focusedSectorId])

  const isLoadingPlaces = loading || (open && !context.map)

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      const store = useStorefrontSeatStore.getState()
      const existing = storefrontSelectionCount(store.selectedItems)
      setPeopleCount(Math.max(1, existing || 1))
      const ids = store.selectedItems.map((item) => item.id)
      if (ids.length > 0) store.pulseFocus(ids)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open])

  function handleTogglePlace(seatId: string) {
    if (pending || !context.map) return
    const store = useStorefrontSeatStore.getState()
    const element = (context.map.elements ?? []).find((item) => item.id === seatId)
    const tableParent = (context.map.elements ?? []).find(
      (item) =>
        isTablePurchaseSku(item) &&
        (item.id === seatId || item.seats.some((seat) => seat.id === seatId)),
    )
    if (element && (isTablePurchaseSku(element) || element.type === "standing_zone")) {
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
    if (tableParent) {
      const item = storefrontItemFromElement(tableParent, context.priceBySectorId)
      if (!item) return
      const result = store.toggleSelectedItem(item, maxTicketsPerUser)
      if (!result.ok) {
        toast.error(storefrontLimitMessage(result.reason))
        return
      }
      store.pulseFocus([tableParent.id])
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

  if (isGeneralAdmission) {
    return (
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <GeneralAdmissionPicker
          pending={pending}
          peopleCount={peopleCount}
          maxPeople={resolvePurchaseLimit(maxTicketsPerUser) ?? 20}
          sectorName={selectedSectorName}
          inventoryType={inventoryType}
          seatsPerTable={seatsPerTable}
          unitKind="ticket"
          onChange={(next) => {
            setPeopleCount(next)
            if (targetSector) {
              context.onAssignZoneQuantity(targetSector.id, next)
            } else if (targetZone) {
              context.onAssignZoneQuantity(targetZone.id, next)
            }
          }}
        />
      </div>
    )
  }

  return (
    <Tabs
      key={`${open}-${focusedSectorId ?? "sector"}`}
      defaultValue="lista"
      className="flex min-h-0 flex-1 flex-col gap-0"
    >
      <div className="shrink-0 border-b border-border px-4 pt-3">
        <TabsList className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-muted/50 p-1 text-muted-foreground">
          <TabsTrigger
            value="lista"
            className="inline-flex h-full w-full flex-1 items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium shadow-none after:hidden data-active:border-transparent data-active:bg-background data-active:text-foreground data-active:shadow-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm dark:data-active:border-transparent"
          >
            Selección rápida
          </TabsTrigger>
          <TabsTrigger
            value="mapa"
            className="inline-flex h-full w-full flex-1 items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium shadow-none after:hidden data-active:border-transparent data-active:bg-background data-active:text-foreground data-active:shadow-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm dark:data-active:border-transparent"
          >
            Ver en el mapa
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent
        value="lista"
        className="no-scrollbar mt-0 min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
      >
        <div className="mb-4 text-center">
          <h3 className="text-lg font-bold text-foreground">
            {selectedSectorName}
          </h3>
          <SectorInventoryDescription
            inventoryType={inventoryType}
            seatsPerTable={seatsPerTable}
          />
        </div>
        {isLoadingPlaces ? (
          <QuickPlaceSkeleton />
        ) : quickPlaces.length === 0 ? (
          <p className="px-1 py-10 text-center text-sm text-muted-foreground">
            No hay lugares disponibles
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {quickPlaces.map((place) => (
              <button
                key={place.id}
                type="button"
                disabled={pending}
                aria-pressed={place.selected}
                onClick={() => handleTogglePlace(place.id)}
                className={cn(
                  tapFeedbackClass,
                  "flex min-h-12 items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left font-semibold transition-all",
                  place.selected
                    ? "border-emerald-500 bg-emerald-600 text-white"
                    : "border-border bg-card text-foreground hover:border-emerald-500/60",
                  pending && "pointer-events-none opacity-60",
                )}
              >
                <span className="truncate">{place.label}</span>
                <span className="shrink-0 tabular-nums">
                  {formatTicketPrice(place.price)}
                </span>
              </button>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent
        value="mapa"
        className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden p-3"
      >
        {isLoadingPlaces ? (
          <Skeleton className="h-full min-h-[16rem] w-full rounded-xl" />
        ) : focusedMap ? (
          <InteractiveMapViewer
            map={focusedMap}
            eventId={context.eventId}
            occupancyBySeatId={context.occupancyBySeatId}
            priceBySectorId={context.priceBySectorId}
            pending={pending}
            selectedZoneId={focusedSectorId}
            unavailableZoneIds={context.unavailableZoneIds}
            heldSeatIds={context.heldSeatIds}
            maxSelectable={maxTicketsPerUser ?? undefined}
            onSelectZone={context.onSelectZone}
            className="h-full min-h-[16rem] md:h-full"
          />
        ) : (
          <p className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            El plano no está disponible.
          </p>
        )}
      </TabsContent>
    </Tabs>
  )
}

type QuickPlace = {
  id: string
  label: string
  price: number
  selected: boolean
}

function buildQuickPlaces(input: {
  rows: AccessibleRowNode[]
  inventoryType: SectorInventoryType
  sellMode: "per_seat" | "group"
  unitNoun: "mesa" | "palco"
  fallbackPrice: number
}): QuickPlace[] {
  if (input.inventoryType === "TABLES") {
    return groupSeatsForMatrix(input.rows).flatMap((group) => {
      const selectable = group.seats.filter(isSelectablePlace)
      if (selectable.length === 0) return []
      const price = selectable[0]?.price || input.fallbackPrice
      const label = formatTablePlaceLabel(group.title, input.unitNoun)
      if (input.sellMode === "group") {
        return [
          {
            id: selectable[0]!.id,
            label,
            price,
            selected: selectable.some((seat) => seat.status === "selected"),
          },
        ]
      }
      return selectable.map((seat) => ({
        id: seat.id,
        label: `${label} · ${unpaddedToken(seat)}`,
        price: seat.price || input.fallbackPrice,
        selected: seat.status === "selected",
      }))
    })
  }

  return input.rows.flatMap((row) =>
    row.seats.filter(isSelectablePlace).map((seat) => ({
      id: seat.id,
      label: formatNumberedPlaceLabel(row.label, seat),
      price: seat.price || input.fallbackPrice,
      selected: seat.status === "selected",
    })),
  )
}

function isSelectablePlace(seat: AccessibleSeatNode) {
  return seat.status === "available" || seat.status === "selected"
}

function unpaddedToken(seat: AccessibleSeatNode) {
  return compactSeatToken(seat.label, seat.number).replace(/^0+(?=\d)/, "")
}

function formatTablePlaceLabel(title: string, unitNoun: "mesa" | "palco") {
  const trimmed = title.trim()
  if (/mesa|palco/i.test(trimmed)) return trimmed
  const noun = unitNoun === "palco" ? "Palco" : "Mesa"
  return `${noun} ${trimmed.replace(/^fila\s+/i, "")}`.trim()
}

function formatNumberedPlaceLabel(rowLabel: string, seat: AccessibleSeatNode) {
  const seatName = seat.label.trim() || `Asiento ${seat.number}`
  const row = rowLabel.trim()
  if (!row || row === seatName) return seatName
  if (/^fila\b/i.test(row)) return `${row} · ${seatName}`
  return `Fila ${row} · ${seatName}`
}

function isolateSectorMap(
  map: InteractiveVenueMap,
  sectorId: string,
): InteractiveVenueMap {
  const zones = (map.zones ?? []).filter((zone) => zone.id === sectorId)
  if (zones.length === 0) return map
  return {
    ...map,
    zones,
    sectors: map.sectors.filter((sector) => sector.id === sectorId),
    elements: (map.elements ?? []).filter((element) => {
      if (element.category !== "commercial") return true
      const zoneId = element.zoneId?.trim()
      if (!zoneId) return true
      return (
        zoneId === sectorId ||
        element.groupId === sectorId ||
        elementInventorySectorId(element) === sectorId
      )
    }),
  }
}

function QuickPlaceSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full rounded-xl" />
      ))}
    </div>
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
  const ticketLabel = accesses === 1 ? "1 entrada" : `${accesses} entradas`
  const heading = names.join(" · ") || "Selección"
  return `${heading} · ${ticketLabel} · ${formatTicketPrice(total)}`
}

type SectorInventoryType =
  | "TABLES"
  | "SEATED_NUMERATED"
  | "GENERAL_ADMISSION"

function resolveSectorInventoryType(input: {
  layoutType?: string | null
  isTableSector: boolean
  seatingType?: string | null
}): SectorInventoryType {
  if (input.layoutType === "table_combo" || input.isTableSector) {
    return "TABLES"
  }
  if (
    input.layoutType === "numbered_seat" ||
    input.seatingType === "RESERVED"
  ) {
    return "SEATED_NUMERATED"
  }
  return "GENERAL_ADMISSION"
}

function SectorInventoryDescription({
  inventoryType,
  seatsPerTable,
}: {
  inventoryType: SectorInventoryType
  seatsPerTable: number
}) {
  return (
    <div className="mt-2 text-center text-sm text-muted-foreground">
      {inventoryType === "TABLES" && (
        <p>
          Mesa completa. Incluye {seatsPerTable || "X"} sillas exclusivas.
        </p>
      )}
      {inventoryType === "SEATED_NUMERATED" && (
        <p>Asiento numerado. Elegí tu ubicación en el plano.</p>
      )}
      {(inventoryType === "GENERAL_ADMISSION" || !inventoryType) && (
        <p>
          Acceso general (sin asiento asignado). Indicá cuántas entradas
          querés.
        </p>
      )}
    </div>
  )
}

function quantityUnitLabel(
  count: number,
  unitKind: "ticket" | "person",
): string {
  if (unitKind === "person") {
    return count === 1 ? "1 persona" : `${count} personas`
  }
  return count === 1 ? "1 entrada" : `${count} entradas`
}

function GeneralAdmissionPicker({
  sectorName,
  peopleCount,
  maxPeople,
  pending,
  unitKind,
  inventoryType,
  seatsPerTable,
  onChange,
}: {
  sectorName: string
  peopleCount: number
  maxPeople: number
  pending: boolean
  unitKind: "ticket" | "person"
  inventoryType: SectorInventoryType
  seatsPerTable: number
  onChange: (next: number) => void
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <h3 className="mb-2 text-center text-lg font-bold text-foreground">
        {sectorName}
      </h3>
      <SectorInventoryDescription
        inventoryType={inventoryType}
        seatsPerTable={seatsPerTable}
      />
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
