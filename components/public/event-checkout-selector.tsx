"use client"

import {
  AlertCircle,
  Clock,
  Info,
  Minus,
  Plus,
  Sparkles,
} from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useMemo, useState } from "react"

import { BundleCardSelector } from "@/components/public/bundle-card-selector"
import {
  SeatSelectionSheet,
  selectedPlacesForCategory,
  type SeatSelectionContext,
} from "@/components/public/seat-selection-sheet"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import {
  useStorefrontSeatStore,
  type StorefrontSelectedItem,
} from "@/lib/stores/storefront-seat-store"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { resolveTicketHighlightBadge } from "@/lib/checkout/ticket-picker"
import { resolveStockScarcity } from "@/lib/checkout/stock-scarcity"
import { formatCurrency } from "@/lib/format"
import { resolveSalePhases } from "@/lib/inventory/active-phase"
import {
  inferInventoryTierType,
  isQuantityInventoryType,
  type InventoryTierType,
} from "@/lib/inventory/unified-inventory"
import { resolvePurchaseLimit } from "@/lib/checkout-limits"
import { resolveCategoryAvailability } from "@/lib/checkout/category-stock"
import {
  displayChargePrice,
  resolveChargeUnit,
} from "@/lib/checkout/charge-unit"
import { resolveSectorAssignMeta } from "@/lib/seating/assign-best-seats"
import {
  FULL_PASS_TAB_ID,
  defaultCheckoutDateId,
  defaultCheckoutKindTab,
  isSamePriceAnyDay,
  listCheckoutDateCards,
  shouldShowCheckoutKindTabs,
  ticketMatchesTab,
  type CheckoutKindTab,
} from "@/lib/checkout/ticket-day-groups"
import { flattenSeatsForAvailability } from "@/lib/seating/venue-map-geometry"
import { cn, tapFeedbackClass } from "@/lib/utils"
import type { ScheduleDay } from "@/types/events"

export type SelectedNumberedSeat = {
  tierId: string
  seatingUnitId: string
  sectorKey: string | null
  tableNumber: number | null
  label: string
  price: number
}

type Props = {
  tiers: TicketSelectorTier[]
  quantities: Record<string, number>
  isPending: boolean
  hasSeatingFlow: boolean
  hasInteractiveMap?: boolean
  mapLoading?: boolean
  focusedTierId?: string | null
  selectedSeat: SelectedNumberedSeat | null
  selectedPlaceCount?: number
  includesGeneralAccess?: boolean
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  onOpenSeatFlow: () => void
  onPurchaseIntent?: () => void
  onClearSeat: () => void
  maxTicketsPerUser?: number | null
  selectedCount?: number
  seatSelection?: SeatSelectionContext | null
  scheduleDays?: ScheduleDay[]
  selectedDateId?: string | null
  onSelectedDateIdChange?: (dateId: string) => void
  seatSheetOpen?: boolean
  onSeatSheetOpenChange?: (open: boolean) => void
}

const SYNTHETIC_MAP_TIER_ID = "__interactive-map__"

function tierRequiresMap(tier: TicketSelectorTier): boolean {
  return (
    inferInventoryTierType({
      tierType: tier.tierType,
      layoutType: tier.layoutType,
      category: tier.category,
      bundleItems: (tier.comboItems ?? []).map((item, index) => ({
        tierId: `${tier.id}-${index}`,
        quantity: item.quantity,
      })),
    }) === "seated"
  )
}

export function EventCheckoutSelector({
  tiers,
  quantities,
  isPending,
  hasSeatingFlow,
  hasInteractiveMap = false,
  mapLoading = false,
  focusedTierId = null,
  selectedSeat,
  selectedPlaceCount = 0,
  includesGeneralAccess = false,
  onQuantityChange,
  onOpenSeatFlow,
  onPurchaseIntent,
  onClearSeat,
  maxTicketsPerUser = null,
  selectedCount = 0,
  seatSelection = null,
  scheduleDays = [],
  selectedDateId = null,
  onSelectedDateIdChange,
  seatSheetOpen,
  onSeatSheetOpenChange,
}: Props) {
  const [uncontrolledSeatSheetOpen, setUncontrolledSeatSheetOpen] =
    useState(false)
  const isSeatSelectionOpen = seatSheetOpen ?? uncontrolledSeatSheetOpen
  const setIsSeatSelectionOpen =
    onSeatSheetOpenChange ?? setUncontrolledSeatSheetOpen
  const [activeSeatCategory, setActiveSeatCategory] = useState<{
    id: string
    name: string
    sectorId: string | null
  } | null>(null)
  const selectedItems = useStorefrontSeatStore((state) => state.selectedItems)
  const grouped = groupCheckoutTiers(tiers)
  const listTiers = tiers.filter((tier) => {
    const type = inferInventoryTierType({
      tierType: tier.tierType,
      layoutType: tier.layoutType,
      category: tier.category,
      bundleItems: (tier.comboItems ?? []).map((item, index) => ({
        tierId: `${tier.id}-${index}`,
        quantity: item.quantity,
      })),
    })
    return type !== "bundle"
  })
  const hasSeatedRow = listTiers.some(tierRequiresMap)
  const showSyntheticMapRow =
    (hasInteractiveMap || hasSeatingFlow) && !hasSeatedRow
  const hasInventory =
    listTiers.length > 0 ||
    grouped.bundle.length > 0 ||
    showSyntheticMapRow

  if (!hasInventory) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay inventario disponible para este evento.
      </p>
    )
  }

  const hasMapSelection = selectedPlaceCount > 0
  const placeLabel = selectedSeat?.label?.trim() || null
  const generalQty = grouped.general.reduce(
    (sum, tier) => sum + (quantities[tier.id] ?? 0),
    0,
  )
  const showInclusionWarning =
    includesGeneralAccess && hasMapSelection && generalQty > 0
  const showReservedSeat = Boolean(placeLabel) && !hasMapSelection

  function openSeatSelection(category: {
    id: string
    name: string
    sectorId?: string | null
  }) {
    const tier = listTiers.find((item) => item.id === category.id)
    if (tier) {
      const soldOut = resolveCategoryAvailability({
        requiresMap: tierRequiresMap(tier),
        stock: tier.available,
        categoryId: tier.id,
        seatingSectorId: tier.seatingSectorId ?? category.sectorId,
        categoryName: tier.name,
        seats: seatSelection?.map
          ? flattenSeatsForAvailability(seatSelection.map)
          : [],
        occupancyBySeatId: seatSelection?.occupancyBySeatId,
        summaryAvailable: seatSelection?.sectorSummaries?.find(
          (row) =>
            row.tierId === tier.id ||
            row.sectorId === (tier.seatingSectorId ?? category.sectorId) ||
            row.sectorName.trim().toLowerCase() === tier.name.trim().toLowerCase(),
        )?.available,
        mapReady: Boolean(seatSelection?.map) && !mapLoading,
      }).isSoldOut
      if (soldOut) return
    }
    if (hasInteractiveMap && seatSelection) {
      setActiveSeatCategory({
        id: category.id,
        name: category.name,
        sectorId: category.sectorId ?? null,
      })
      setIsSeatSelectionOpen(true)
      return
    }
    onOpenSeatFlow()
  }

  return (
    <section
      className="flex h-full w-full flex-col space-y-5"
      aria-label="Elegí tu entrada"
    >
      {showReservedSeat ? (
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Lugar reservado
              </p>
              {includesGeneralAccess ? <InclusionBadge /> : null}
            </div>
            <p className="mt-1 break-words text-base font-extrabold text-foreground">
              {placeLabel}
            </p>
            {selectedSeat ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatCurrency(selectedSeat.price)} · se confirma al
                continuar. El reloj de 10 minutos corre en el proceso de compra.
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={onClearSeat}
            className={cn(tapFeedbackClass, "mt-3")}
          >
            Cambiar
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        <TicketSelectionList
            listTiers={listTiers}
            quantities={quantities}
            isPending={isPending}
            focusedTierId={focusedTierId}
            maxTicketsPerUser={maxTicketsPerUser}
            selectedCount={selectedCount}
            mapLoading={mapLoading}
            includesGeneralAccess={includesGeneralAccess}
            selectedItems={selectedItems}
            scheduleDays={scheduleDays}
            selectedDateId={selectedDateId}
            onSelectedDateIdChange={onSelectedDateIdChange}
            showSyntheticMapRow={showSyntheticMapRow}
            seatSelection={seatSelection}
            onQuantityChange={onQuantityChange}
            onOpenSeatSelection={openSeatSelection}
          />
        </div>

      {seatSelection ? (
        <SeatSelectionSheet
          open={isSeatSelectionOpen}
          onOpenChange={setIsSeatSelectionOpen}
          title={activeSeatCategory?.name ?? "Seleccionar lugares"}
          sectorId={activeSeatCategory?.sectorId}
          pending={isPending}
          maxTicketsPerUser={maxTicketsPerUser}
          context={seatSelection}
        />
      ) : null}

      <InclusionWarning visible={showInclusionWarning} />

      {grouped.bundle.length > 0 ? (
        <BundleCardSelector
          bundles={grouped.bundle}
          quantities={quantities}
          isPending={isPending}
          onBuy={(tierId) => {
            const bundle = grouped.bundle.find((row) => row.id === tierId)
            onQuantityChange(tierId, 1, Math.max(0, bundle?.available ?? 1))
            onPurchaseIntent?.()
          }}
        />
      ) : null}
    </section>
  )
}

function TicketSelectionList({
  listTiers,
  quantities,
  isPending,
  focusedTierId,
  maxTicketsPerUser,
  selectedCount,
  mapLoading,
  includesGeneralAccess,
  selectedItems,
  scheduleDays,
  selectedDateId,
  onSelectedDateIdChange,
  showSyntheticMapRow,
  seatSelection,
  onQuantityChange,
  onOpenSeatSelection,
}: {
  listTiers: TicketSelectorTier[]
  quantities: Record<string, number>
  isPending: boolean
  focusedTierId: string | null
  maxTicketsPerUser: number | null
  selectedCount: number
  mapLoading: boolean
  includesGeneralAccess: boolean
  selectedItems: StorefrontSelectedItem[]
  scheduleDays: ScheduleDay[]
  selectedDateId: string | null
  onSelectedDateIdChange?: (dateId: string) => void
  showSyntheticMapRow: boolean
  seatSelection: SeatSelectionContext | null
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  onOpenSeatSelection: (category: {
    id: string
    name: string
    sectorId?: string | null
  }) => void
}) {
  const dateCards = useMemo(
    () => listCheckoutDateCards(scheduleDays, listTiers),
    [listTiers, scheduleDays],
  )
  const showKindTabs = shouldShowCheckoutKindTabs(listTiers, scheduleDays)
  const samePriceAnyDay = useMemo(
    () => isSamePriceAnyDay(listTiers, scheduleDays),
    [listTiers, scheduleDays],
  )
  const initialKind = defaultCheckoutKindTab(listTiers)
  const initialDateId = defaultCheckoutDateId(dateCards, listTiers)
  const [kindTab, setKindTab] = useState<CheckoutKindTab>(initialKind)
  const [uncontrolledDateId, setUncontrolledDateId] = useState<string | null>(
    initialDateId,
  )
  const reduceMotion = useReducedMotion()
  const defaultKind = defaultCheckoutKindTab(listTiers)
  if (!showKindTabs && kindTab !== defaultKind) {
    setKindTab(defaultKind)
  }
  const nextDate = defaultCheckoutDateId(dateCards, listTiers)
  const dateIsControlled = typeof onSelectedDateIdChange === "function"
  const activeDateId = dateIsControlled
    ? (selectedDateId ?? nextDate)
    : uncontrolledDateId
  const dateStillValid =
    Boolean(activeDateId) &&
    dateCards.some((card) => card.dateId === activeDateId)
  if (!dateIsControlled && !dateStillValid && uncontrolledDateId !== nextDate) {
    setUncontrolledDateId(nextDate)
  }

  function selectDate(dateId: string) {
    if (dateIsControlled) {
      onSelectedDateIdChange?.(dateId)
      return
    }
    setUncontrolledDateId(dateId)
  }

  const showDateCards = kindTab === "days" && dateCards.length > 1

  const displayedTickets = useMemo(() => {
    if (!showKindTabs && !showDateCards) return listTiers
    if (kindTab === "passes") {
      return listTiers.filter((tier) => ticketMatchesTab(tier, FULL_PASS_TAB_ID))
    }
    if (!activeDateId) return listTiers
    return listTiers.filter((tier) =>
      ticketMatchesTab(tier, activeDateId, {
        treatFullPassAsAnyDay: !showKindTabs,
      }),
    )
  }, [activeDateId, kindTab, listTiers, showDateCards, showKindTabs])

  const listKey =
    kindTab === "passes" ? "passes" : (activeDateId ?? "days")

  const seatMap = seatSelection?.map ?? null
  const mapSeats = useMemo(
    () => (seatMap ? flattenSeatsForAvailability(seatMap) : []),
    [seatMap],
  )
  const occupancyBySeatId = seatSelection?.occupancyBySeatId ?? {}

  function renderTierCard(tier: TicketSelectorTier) {
    const requiresMap = tierRequiresMap(tier)
    const selectedPlaces = requiresMap
      ? selectedPlacesForCategory(selectedItems, tier.seatingSectorId)
      : []
    return (
      <UnifiedTicketCard
        key={tier.id}
        tier={tier}
        siblingTiers={listTiers}
        quantity={quantities[tier.id] ?? 0}
        isPending={isPending}
        focused={focusedTierId === tier.id}
        maxTicketsPerUser={maxTicketsPerUser}
        selectedCount={selectedCount}
        requiresMap={requiresMap}
        mapLoading={mapLoading}
        includesGeneralAccess={includesGeneralAccess && requiresMap}
        selectedPlaces={selectedPlaces}
        mapSeats={mapSeats}
        occupancyBySeatId={occupancyBySeatId}
        mapReady={Boolean(seatSelection?.map) && !mapLoading}
        venueMap={seatSelection?.map ?? null}
        sectorSummaries={seatSelection?.sectorSummaries}
        onQuantityChange={onQuantityChange}
        onOpenSeatSelection={() =>
          onOpenSeatSelection({
            id: tier.id,
            name: tier.name,
            sectorId: tier.seatingSectorId,
          })
        }
      />
    )
  }

  const syntheticRow = showSyntheticMapRow ? (
    <div className="relative rounded-2xl border border-border/50 bg-card/50 p-5 backdrop-blur-sm transition-all hover:border-primary/50 hover:bg-card/80">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-black text-foreground">
              Asientos numerados
            </h4>
            {includesGeneralAccess ? <InclusionBadge /> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Elegí mesas o butacas exactas en el plano.
          </p>
        </div>
        {selectedPlacesForCategory(selectedItems).length === 0 ? (
          <div className="flex-shrink-0">
            <button
              type="button"
              disabled={isPending || mapLoading}
              onClick={() =>
                onOpenSeatSelection({
                  id: SYNTHETIC_MAP_TIER_ID,
                  name: "Asientos numerados",
                })
              }
              className={cn(
                tapFeedbackClass,
                "whitespace-nowrap rounded-full bg-primary/20 px-4 py-2 text-sm font-bold text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50",
              )}
            >
              {mapLoading ? "Cargando mapa…" : "Seleccionar lugares"}
            </button>
          </div>
        ) : null}
      </div>
      <SelectedPlacesSummary
        labels={selectedPlacesForCategory(selectedItems)}
        onModify={() =>
          onOpenSeatSelection({
            id: SYNTHETIC_MAP_TIER_ID,
            name: "Asientos numerados",
          })
        }
      />
    </div>
  ) : null

  return (
    <div className="relative flex w-full flex-col">
      <h2 className="mb-3 pt-2 text-lg font-black text-foreground md:mb-4 md:text-xl">
        Elegí tu entrada
      </h2>
      {showKindTabs ? (
        <div
          className="grid grid-cols-2 gap-1 rounded-full bg-secondary p-1"
          role="tablist"
          aria-label="Tipo de entrada"
        >
          <button
            type="button"
            role="tab"
            aria-selected={kindTab === "days"}
            onClick={() => setKindTab("days")}
            className={cn(
              "rounded-full px-3 py-2.5 text-center text-sm font-bold transition-colors",
              kindTab === "days"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground",
            )}
          >
            Entradas por Día
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kindTab === "passes"}
            onClick={() => setKindTab("passes")}
            className={cn(
              "rounded-full px-3 py-2.5 text-center text-sm font-bold transition-colors",
              kindTab === "passes"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground",
            )}
          >
            Pases / Abonos
          </button>
        </div>
      ) : null}
      {showDateCards ? (
        <div
          className="hide-scrollbar flex gap-3 overflow-x-auto snap-x snap-mandatory pb-4 lg:flex-wrap lg:gap-4 lg:overflow-visible lg:snap-none lg:pb-6"
          role="tablist"
          aria-label="Elegí el día"
        >
          {dateCards.map((card) => {
            const selected = activeDateId === card.dateId
            return (
              <button
                key={card.dateId}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectDate(card.dateId)}
                className={cn(
                  "flex min-w-[120px] snap-start cursor-pointer flex-col items-center justify-center rounded-xl border-2 px-6 py-3 transition-all",
                  selected
                    ? "border-primary bg-primary/10 font-bold text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40",
                )}
              >
                <span className="text-xs font-bold uppercase tracking-wider">
                  {card.weekday}
                </span>
                <span className="mt-0.5 text-lg font-black tracking-tight">
                  {card.dayNumber} {card.month}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
      {showDateCards && samePriceAnyDay ? (
        <p className="text-xs font-medium text-muted-foreground">
          Mismo valor para cualquier día seleccionado
        </p>
      ) : null}

      <h3 className="mb-4 mt-6 text-sm font-bold text-foreground">
        Seleccioná tus entradas
      </h3>
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={listKey}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="relative z-0 flex flex-col gap-4 pb-8"
        >
          {displayedTickets.length > 0 ? (
            displayedTickets.map(renderTierCard)
          ) : (
            <p className="text-sm text-muted-foreground">
              No hay entradas para esta selección.
            </p>
          )}
          {kindTab === "days" || !showKindTabs ? syntheticRow : null}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function SelectedPlacesSummary({
  labels,
  onModify,
}: {
  labels: string[]
  onModify: () => void
}) {
  if (labels.length === 0) return null
  return (
    <div className="mt-2 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 p-3">
      <div className="min-w-0">
        <span className="text-xs font-bold text-primary">
          LUGARES SELECCIONADOS
        </span>
        <p className="text-sm font-medium text-foreground">{labels.join(", ")}</p>
      </div>
      <button
        type="button"
        onClick={onModify}
        className="shrink-0 text-xs text-muted-foreground underline"
      >
        Modificar
      </button>
    </div>
  )
}

function UnifiedTicketCard({
  tier,
  siblingTiers,
  quantity,
  isPending,
  focused,
  maxTicketsPerUser,
  selectedCount,
  requiresMap,
  mapLoading,
  includesGeneralAccess,
  selectedPlaces,
  mapSeats,
  occupancyBySeatId,
  mapReady,
  venueMap,
  sectorSummaries,
  onQuantityChange,
  onOpenSeatSelection,
}: {
  tier: TicketSelectorTier
  siblingTiers: TicketSelectorTier[]
  quantity: number
  isPending: boolean
  focused: boolean
  maxTicketsPerUser: number | null
  selectedCount: number
  requiresMap: boolean
  mapLoading: boolean
  includesGeneralAccess: boolean
  selectedPlaces: string[]
  mapSeats: ReturnType<typeof flattenSeatsForAvailability>
  occupancyBySeatId: SeatSelectionContext["occupancyBySeatId"]
  mapReady: boolean
  venueMap: SeatSelectionContext["map"]
  sectorSummaries?: SeatSelectionContext["sectorSummaries"]
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  onOpenSeatSelection: () => void
}) {
  const sale = resolveSalePhases(tier.phases)
  const current = sale.current
  const limit = resolvePurchaseLimit(maxTicketsPerUser)
  const otherSelected = Math.max(0, selectedCount - quantity)
  const remaining =
    limit == null ? Number.POSITIVE_INFINITY : Math.max(0, limit - otherSelected)
  const max = Math.min(Math.max(0, tier.available), remaining)
  const description = tier.description?.trim() || ""
  const highlight = resolveTicketHighlightBadge(tier, siblingTiers)
  const unitPrice = current?.price ?? tier.price
  const phaseName = current?.name
  const sectorMeta =
    requiresMap && venueMap && tier.seatingSectorId
      ? resolveSectorAssignMeta(
          venueMap,
          tier.seatingSectorId,
          mapSeats,
          tier.name,
        )
      : null
  const charge = resolveChargeUnit({
    layoutType: tier.layoutType,
    capacityPerUnit: sectorMeta?.capacityPerUnit ?? tier.capacityPerUnit,
    sellMode: sectorMeta?.sellMode,
    isTableSector: sectorMeta?.isTableSector || tier.layoutType === "table_combo",
    name: tier.name,
  })
  const shownPrice = displayChargePrice(charge, unitPrice)

  const summary = sectorSummaries?.find(
    (row) =>
      row.tierId === tier.id ||
      row.sectorId === tier.seatingSectorId ||
      row.sectorName.trim().toLowerCase() === tier.name.trim().toLowerCase(),
  )
  const availability = resolveCategoryAvailability({
    requiresMap,
    stock: tier.available,
    categoryId: tier.id,
    seatingSectorId: tier.seatingSectorId,
    categoryName: tier.name,
    seats: mapSeats,
    occupancyBySeatId,
    summaryAvailable: summary?.available,
    mapReady,
  })
  const isSoldOut = availability.isSoldOut

  return (
    <div
      className={cn(
        "relative rounded-2xl border border-border bg-card p-5 backdrop-blur-sm transition-all",
        isSoldOut
          ? "cursor-not-allowed border-border bg-muted/50 opacity-70"
          : "hover:border-primary/50 hover:bg-card",
        focused && !isSoldOut && "ring-1 ring-primary/30",
        highlight === "bestseller" && !isSoldOut && "border-amber-400/35",
        selectedPlaces.length > 0 && !isSoldOut && "border-primary/30",
      )}
    >
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-black text-foreground">{tier.name}</h4>
            {includesGeneralAccess ? <InclusionBadge /> : null}
            {highlight === "bestseller" && !isSoldOut ? (
              <Badge
                variant="secondary"
                className="h-5 gap-1 border border-amber-500/20 bg-amber-500/10 text-[10px] font-bold uppercase tracking-wide text-amber-400"
              >
                <Sparkles className="size-3" aria-hidden="true" />
                Más vendida
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-2 lg:hidden">
            <span className="text-xl font-black tabular-nums text-foreground">
              {formatCurrency(shownPrice)}
            </span>
            {charge.badge ? (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  charge.unitType === "full_table"
                    ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "border-sky-500/35 bg-sky-500/15 text-sky-700 dark:text-sky-300",
                )}
              >
                {charge.badge}
              </span>
            ) : null}
          </div>
          {isSoldOut ? (
            <span className="mt-1 flex items-center gap-1 text-xs font-bold text-destructive">
              <AlertCircle className="size-3" aria-hidden="true" />
              Agotado
            </span>
          ) : availability.available > 0 ? (
            <StockHint
              available={availability.available}
              capacity={tier.capacity}
              sold={tier.sold}
            />
          ) : (
            <span className="mt-1 text-xs font-semibold text-emerald-500">
              Disponible
            </span>
          )}
          {phaseName ? (
            <p className="text-xs text-muted-foreground">{phaseName}</p>
          ) : null}
          {description ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-4 lg:flex-col lg:items-end">
          <div className="hidden flex-wrap items-baseline justify-end gap-2 lg:flex">
            <span className="text-xl font-black tabular-nums text-foreground">
              {formatCurrency(shownPrice)}
            </span>
            {charge.badge ? (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  charge.unitType === "full_table"
                    ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "border-sky-500/35 bg-sky-500/15 text-sky-700 dark:text-sky-300",
                )}
              >
                {charge.badge}
              </span>
            ) : null}
          </div>
          <div className="flex-shrink-0">
          {isSoldOut ? (
            <button
              type="button"
              disabled
              className="pointer-events-none h-12 cursor-not-allowed rounded-xl bg-secondary px-6 text-sm font-bold text-muted-foreground"
            >
              Agotado
            </button>
          ) : requiresMap ? (
            selectedPlaces.length === 0 ? (
              <button
                type="button"
                disabled={isPending || mapLoading}
                onClick={(event) => {
                  if (isSoldOut) {
                    event.preventDefault()
                    return
                  }
                  onOpenSeatSelection()
                }}
                className={cn(
                  tapFeedbackClass,
                  "h-12 whitespace-nowrap rounded-xl bg-primary/20 px-6 text-sm font-bold text-primary transition-all hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none disabled:opacity-50",
                )}
              >
                {mapLoading ? "Cargando mapa…" : "Seleccionar lugares"}
              </button>
            ) : null
          ) : (
            <Stepper
              value={quantity}
              max={max}
              disabled={isPending || isSoldOut || max === 0}
              onChange={(next) => {
                if (isSoldOut || availability.available <= 0) return
                onQuantityChange(tier.id, next, max)
              }}
            />
          )}
          </div>
        </div>
      </div>
      {sale.upcoming.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-border/70 pt-2">
          {sale.upcoming.map((phase) => (
            <li
              key={phase.id}
              className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Clock className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {phase.name} - {formatCurrency(phase.price)}
                </span>
              </span>
              <span className="shrink-0 font-medium uppercase tracking-wide">
                Próximamente
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {requiresMap && !isSoldOut ? (
        <SelectedPlacesSummary
          labels={selectedPlaces}
          onModify={onOpenSeatSelection}
        />
      ) : null}
    </div>
  )
}

export function groupCheckoutTiers(tiers: TicketSelectorTier[]) {
  const buckets: Record<InventoryTierType, TicketSelectorTier[]> = {
    seated: [],
    general: [],
    addon: [],
    bundle: [],
  }
  for (const tier of tiers) {
    const type = inferInventoryTierType({
      tierType: tier.tierType,
      layoutType: tier.layoutType,
      category: tier.category,
      bundleItems: (tier.comboItems ?? []).map((item, index) => ({
        tierId: `${tier.id}-${index}`,
        quantity: item.quantity,
      })),
    })
    buckets[type].push(tier)
  }
  return buckets
}

function InclusionBadge() {
  return (
    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
      Incluye Acceso
    </span>
  )
}

function InclusionWarning({ visible }: { visible: boolean }) {
  const reduceMotion = useReducedMotion()
  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          key="inclusion-warning"
          initial={reduceMotion ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-2xl border border-amber-500/25 bg-background/70 px-4 py-3 text-sm text-foreground shadow-sm backdrop-blur-md"
          >
            <Info
              className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300"
              aria-hidden="true"
            />
            <p>
              Tus lugares reservados ya incluyen acceso. Solo sumá entradas si
              vienen invitados extra.
            </p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export function QuantityList({
  tiers,
  quantities,
  isPending,
  focusedTierId = null,
  onQuantityChange,
  action = "stepper",
  maxTicketsPerUser = null,
  selectedCount = 0,
}: {
  tiers: TicketSelectorTier[]
  quantities: Record<string, number>
  isPending: boolean
  focusedTierId?: string | null
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  action?: "stepper" | "add"
  maxTicketsPerUser?: number | null
  selectedCount?: number
}) {
  return (
    <ul className="space-y-3">
      {tiers.map((tier) => {
        const sale = resolveSalePhases(tier.phases)
        const current = sale.current
        const quantity = quantities[tier.id] ?? 0
        const limit = resolvePurchaseLimit(maxTicketsPerUser)
        const otherSelected = Math.max(0, selectedCount - quantity)
        const remaining =
          limit == null ? Number.POSITIVE_INFINITY : Math.max(0, limit - otherSelected)
        const max = Math.min(Math.max(0, tier.available), remaining)
        const description = tier.description?.trim() || ""
        const highlight = resolveTicketHighlightBadge(tier, tiers)
        const unitPrice = current?.price ?? tier.price
        const phaseName = current?.name
        return (
          <li
            key={tier.id}
            className={cn(
              "rounded-2xl border border-border bg-card px-4 py-4 transition-all duration-300 ease-in-out",
              focusedTierId === tier.id && "ring-1 ring-primary/30",
              highlight === "bestseller" && "border-amber-400/35",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-muted-foreground">{tier.name}</p>
                  {highlight === "bestseller" ? (
                    <Badge
                      variant="secondary"
                      className="h-5 gap-1 border border-amber-400/30 bg-amber-400/15 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200"
                    >
                      <Sparkles className="size-3" aria-hidden="true" />
                      Más vendida
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-2xl font-black tracking-tight text-foreground">
                  {formatCurrency(unitPrice)}
                </p>
                {phaseName ? (
                  <p className="text-xs text-muted-foreground">{phaseName}</p>
                ) : null}
                {description ? (
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {description}
                  </p>
                ) : null}
                <StockHint
                  available={tier.available}
                  capacity={tier.capacity}
                  sold={tier.sold}
                />
              </div>
              {action === "add" ? (
                <Button
                  type="button"
                  disabled={isPending || max === 0}
                  onClick={() =>
                    onQuantityChange(tier.id, Math.min(max, quantity + 1), max)
                  }
                  className={cn(tapFeedbackClass, "shrink-0 rounded-xl")}
                >
                  {quantity > 0 ? `Agregado · ${quantity}` : "Agregar"}
                </Button>
              ) : (
                <Stepper
                  value={quantity}
                  max={max}
                  disabled={isPending || max === 0}
                  onChange={(next) => onQuantityChange(tier.id, next, max)}
                />
              )}
            </div>
            {sale.upcoming.length > 0 ? (
              <ul className="mt-2 space-y-1 border-t border-border/70 pt-2">
                {sale.upcoming.map((phase) => (
                  <li
                    key={phase.id}
                    className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Clock className="size-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {phase.name} - {formatCurrency(phase.price)}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium uppercase tracking-wide">
                      Próximamente
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function StockHint({
  available,
  capacity,
  sold,
}: {
  available: number
  capacity?: number
  sold?: number
}) {
  const scarcity = resolveStockScarcity(available, capacity, sold)
  if (scarcity.kind === "sold_out") {
    return (
      <p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-destructive">
        <AlertCircle className="size-3.5" aria-hidden="true" />
        Agotado
      </p>
    )
  }
  if (scarcity.kind === "available") {
    return (
      <p className="mt-0.5 text-xs font-semibold text-emerald-500">
        Disponible
      </p>
    )
  }
  return (
    <p className="mt-0.5 text-xs font-semibold text-destructive motion-safe:animate-pulse">
      Últimos lugares disponibles
    </p>
  )
}

function Stepper({
  value,
  max,
  disabled,
  onChange,
}: {
  value: number
  max: number
  disabled: boolean
  onChange: (next: number) => void
}) {
  return (
    <div className="flex items-center rounded-xl bg-secondary/60 p-1">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={disabled || value <= 0}
        onClick={() => onChange(value - 1)}
        aria-label="Quitar"
        className={cn(
          tapFeedbackClass,
          "flex size-8 items-center justify-center rounded-full hover:bg-background",
        )}
      >
        <Minus className="size-3.5" />
      </Button>
      <span className="w-4 text-center text-sm font-bold tabular-nums text-foreground">
        {value}
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        aria-label="Agregar"
        className={cn(
          tapFeedbackClass,
          "flex size-8 items-center justify-center rounded-full hover:bg-background",
        )}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  )
}

export function isQuantityTier(tier: TicketSelectorTier): boolean {
  return isQuantityInventoryType(
    inferInventoryTierType({
      tierType: tier.tierType,
      layoutType: tier.layoutType,
      category: tier.category,
    }),
  )
}
