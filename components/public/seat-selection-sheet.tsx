"use client"

import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef } from "react"
import { toast } from "sonner"

import { MapPin } from "lucide-react"

import { InteractiveMapViewer } from "@/components/public/interactive-map-viewer"
import { SeatSelectionQuickList } from "@/components/public/seat-selection-quick-list"
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
  mapPlaceSelectionCap,
  resolvePurchaseLimit,
  storefrontLimitMessage,
} from "@/lib/checkout-limits"
import { formatTicketPrice } from "@/lib/format"
import { logger } from "@/lib/logger"
import { buildAccessibleSeatTree } from "@/lib/seating/accessible-seat-tree"
import { resolveSectorAssignMeta } from "@/lib/seating/assign-best-seats"
import {
  formatSeatSelectionFooterLabel,
  isTablePurchaseSku,
  storefrontItemFromElement,
  storefrontItemFromZone,
} from "@/lib/seating/storefront-selection"
import { listStorefrontSectorCatalog } from "@/lib/seating/storefront-sector-catalog"
import type {
  UniversalSeatSelection,
  UniversalSector,
  SeatStatus,
} from "@/lib/seating/universal-seat-types"
import { sectorUsesNumberedMap } from "@/lib/seating/venue-map-pricing"
import { elementBelongsToZone } from "@/lib/seating/venue-map-lod"
import {
  elementInventorySectorId,
  flattenSeatsForAvailability,
} from "@/lib/seating/venue-map-geometry"
import {
  asHoldEventDateId,
  withCheckoutEventDateId,
} from "@/lib/checkout/seat-hold-day"
import { useCheckoutStore } from "@/lib/stores/checkout-store"
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
    total?: number
    tierId?: string | null
    eventDateId?: string | null
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
  const numberedSector = sectorUsesNumberedMap({
    seatingSectorId: sectorId,
    map: context.map,
    sectors: context.sectors,
  })
  const numberedPlaces = selectedItems.filter(
    (item) => item.type === "seat" || item.type === "table",
  )
  const zoneCount = storefrontSelectionCount(
    selectedItems.filter(
      (item) => item.type === "zone" || item.type === "standing",
    ),
  )
  const selectedQuantity = Math.max(placeCount, zoneCount, numberedPlaces.length)
  const isValidSelection = selectedQuantity > 0

  useLockBodyScroll(open)

  function handleConfirm() {
    if (pending) return
    if (selectedQuantity <= 0) {
      toast.error(
        numberedSector
          ? "Debes seleccionar un asiento o mesa específica."
          : "Debes indicar cuántas entradas querés para esta zona.",
      )
      return
    }
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
          "z-[100] flex h-[100dvh] max-h-[100dvh] flex-col gap-0 overflow-hidden rounded-none border-none bg-background p-0",
          "max-md:m-0 max-md:h-[100dvh] max-md:max-w-none max-md:w-screen max-md:rounded-none max-md:border-none",
          "lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:h-[min(88dvh,840px)] lg:max-h-[88dvh] lg:w-[min(56rem,94vw)] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl lg:border lg:border-border",
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

        <div className="sticky bottom-0 z-10 mt-auto shrink-0 border-t border-border bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p
              className={cn(
                "flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold",
                isValidSelection ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {formatSeatSelectionFooterLabel(selectedItems)}
              </span>
            </p>
            {isValidSelection ? (
              <p className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                {formatTicketPrice(placeTotal)}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            disabled={!isValidSelection || pending}
            onClick={handleConfirm}
            className={cn(
              tapFeedbackClass,
              "h-auto w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white hover:bg-emerald-700",
            )}
          >
            {isValidSelection
              ? `Confirmar ${selectedQuantity} ${selectedQuantity === 1 ? "lugar" : "lugares"}`
              : "Seleccioná un lugar para continuar"}
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
    return null
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
  const placeSelectionCap = mapPlaceSelectionCap({
    layoutType: targetZone?.layoutType ?? (isTableSector ? "table_combo" : null),
    fallbackMax: maxTicketsPerUser,
    isTable: isTableSector,
  })
  const catalog = useMemo(
    () =>
      context.map
        ? listStorefrontSectorCatalog({
            map: context.map,
            occupancyBySeatId: context.occupancyBySeatId,
            selectedItems,
            priceBySectorId: context.priceBySectorId,
          })
        : [],
    [
      context.map,
      context.occupancyBySeatId,
      context.priceBySectorId,
      selectedItems,
    ],
  )
  const purchaseLimit = resolvePurchaseLimit(maxTicketsPerUser) ?? 20
  const gaQuantityBySector = useMemo(() => {
    const next: Record<string, number> = {}
    for (const item of selectedItems) {
      if (item.type !== "zone" && item.type !== "standing") continue
      const count = storefrontSelectionCount([item])
      next[item.id] = count
      if (item.sectorId) next[item.sectorId] = count
    }
    return next
  }, [selectedItems])
  const gaMaxBySector = useMemo(() => {
    const next: Record<string, number> = {}
    for (const sector of catalog) {
      const summary = context.sectorSummaries?.find(
        (row) =>
          row.sectorId === sector.id ||
          row.sectorName.trim().toLowerCase() === sector.name.trim().toLowerCase(),
      )
      const zone = (context.map?.zones ?? []).find((item) => item.id === sector.id)
      const available =
        typeof summary?.available === "number"
          ? Math.max(0, summary.available)
          : Math.max(0, Math.floor(Number(zone?.capacity) || 0) || purchaseLimit)
      next[sector.id] = Math.max(0, Math.min(purchaseLimit, available))
    }
    return next
  }, [catalog, context.map?.zones, context.sectorSummaries, purchaseLimit])
  const focusedCatalogKind = catalog.find(
    (sector) => sector.id === focusedSectorId,
  )?.kind
  const shouldSeedGa = focusedCatalogKind === "ga"

  const focusedMap = useMemo(() => {
    if (!context.map) return context.map
    if (!sectorId || !focusedSectorId) return context.map
    return isolateSectorMap(context.map, focusedSectorId)
  }, [context.map, focusedSectorId, sectorId])

  const isLoadingPlaces = loading || (open && !context.map)
  const assignZoneQuantity = context.onAssignZoneQuantity
  const assignZoneQuantityRef = useRef(assignZoneQuantity)
  const seededSectorRef = useRef<string | null>(null)

  useEffect(() => {
    assignZoneQuantityRef.current = assignZoneQuantity
  }, [assignZoneQuantity])

  useEffect(() => {
    if (!open) {
      seededSectorRef.current = null
      return
    }
    const timer = window.setTimeout(() => {
      const store = useStorefrontSeatStore.getState()
      const scopedItems = focusedSectorId
        ? store.selectedItems.filter(
            (item) =>
              item.id === focusedSectorId ||
              item.sectorId === focusedSectorId,
          )
        : store.selectedItems
      const existing = storefrontSelectionCount(scopedItems)
      const ids = store.selectedItems.map((item) => item.id)
      if (ids.length > 0) store.pulseFocus(ids)
      const stock = focusedSectorId ? (gaMaxBySector[focusedSectorId] ?? 0) : 0
      if (
        shouldSeedGa &&
        existing <= 0 &&
        focusedSectorId &&
        stock > 0 &&
        seededSectorRef.current !== focusedSectorId
      ) {
        seededSectorRef.current = focusedSectorId
        assignZoneQuantityRef.current(focusedSectorId, 1)
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [focusedSectorId, gaMaxBySector, open, shouldSeedGa])

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
      const item = storefrontItemFromElement(
        element,
        context.priceBySectorId,
        context.map,
      )
      if (!item) return
      const result = store.toggleSelectedItem(
        withCheckoutEventDateId(
          item,
          useCheckoutStore.getState().selectedScheduleId,
        ),
        placeSelectionCap,
      )
      if (!result.ok) {
        toast.error(storefrontLimitMessage(result.reason))
        return
      }
      store.pulseFocus([element.id])
      return
    }
    if (tableParent) {
      const item = storefrontItemFromElement(
        tableParent,
        context.priceBySectorId,
        context.map,
      )
      if (!item) return
      const result = store.toggleSelectedItem(
        withCheckoutEventDateId(
          item,
          useCheckoutStore.getState().selectedScheduleId,
        ),
        placeSelectionCap,
      )
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
      const result = store.toggleSelectedItem(
        withCheckoutEventDateId(
          item,
          useCheckoutStore.getState().selectedScheduleId,
        ),
        placeSelectionCap,
      )
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
        eventDateId:
          asHoldEventDateId(
            useCheckoutStore.getState().selectedScheduleId,
          ) ?? undefined,
      },
      placeSelectionCap,
    )
    if (!result.ok) {
      toast.error(storefrontLimitMessage(result.reason))
      return
    }
    store.pulseFocus([source.id])
  }

  return (
    <Tabs
      key={`${open}-${focusedSectorId ?? "sector"}`}
      defaultValue={selectionMode === "map" ? "mapa" : "lista"}
      className="flex min-h-0 flex-1 flex-col gap-0"
    >
      <div className="shrink-0 border-b border-border px-4 pt-3">
        <TabsList className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-background p-1 text-muted-foreground">
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
        {isLoadingPlaces ? (
          <QuickPlaceSkeleton />
        ) : (
          <SeatSelectionQuickList
            sectors={catalog}
            focusedSectorId={focusedSectorId}
            pending={pending}
            gaQuantityBySector={gaQuantityBySector}
            gaMaxBySector={gaMaxBySector}
            onTogglePlace={handleTogglePlace}
            onAssignZoneQuantity={context.onAssignZoneQuantity}
          />
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
            maxSelectable={placeSelectionCap}
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

function isolateSectorMap(
  map: InteractiveVenueMap,
  sectorId: string,
): InteractiveVenueMap {
  const zones = (map.zones ?? []).filter((zone) => zone.id === sectorId)
  if (zones.length === 0) return map
  return {
    ...map,
    zones,
    sectors: map.sectors.filter(
      (sector) =>
        sector.id === sectorId ||
        sector.name.trim().toLowerCase() ===
          (zones[0]?.name ?? "").trim().toLowerCase(),
    ),
    elements: (map.elements ?? []).filter((element) => {
      if (element.category !== "commercial") return true
      const zone = zones[0]
      if (!zone) return true
      return (
        elementBelongsToZone(element, zone) ||
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

