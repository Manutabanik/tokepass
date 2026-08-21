"use client"

import {
  AlertCircle,
  CalendarDays,
  Clock,
  Info,
  Minus,
  Plus,
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
import { formatTicketPrice } from "@/lib/format"
import { resolveSalePhases } from "@/lib/inventory/active-phase"
import {
  inferInventoryTierType,
  isQuantityInventoryType,
  type InventoryTierType,
} from "@/lib/inventory/unified-inventory"
import { purchaseCapForTier } from "@/lib/checkout-limits"
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
  groupTicketsByDate,
  isSamePriceAnyDay,
  listCheckoutDateCards,
  shouldShowCheckoutKindTabs,
  ticketDateSectionLabel,
  ticketDayBadgeLabel,
  ticketMatchesTab,
  type CheckoutKindTab,
  type TicketDayGroup,
} from "@/lib/checkout/ticket-day-groups"
import { flattenSeatsForAvailability } from "@/lib/seating/venue-map-geometry"
import { classifyZoneClick } from "@/lib/seating/map-click-target"
import {
  sectorUsesNumberedMap,
  ticketRequiresInteractiveMap,
} from "@/lib/seating/venue-map-pricing"
import { InteractiveMapViewer } from "@/components/public/interactive-map-viewer"
import { TicketTierList } from "@/components/public/ticket-tier-list"
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

function tierRequiresMap(
  tier: TicketSelectorTier,
  map?: SeatSelectionContext["map"],
  sectors?: SeatSelectionContext["sectors"],
): boolean {
  return ticketRequiresInteractiveMap({
    seatingSectorId: tier.seatingSectorId,
    layoutType: tier.layoutType,
    tierType: tier.tierType,
    category: tier.category,
    bundleItems: (tier.comboItems ?? []).map((item, index) => ({
      tierId: `${tier.id}-${index}`,
      quantity: item.quantity,
    })),
    map,
    sectors,
  })
}

export function EventCheckoutSelector({
  tiers,
  quantities,
  isPending,
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
  const [seatSheetMode, setSeatSheetMode] = useState<"map" | "counter">("map")
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
  const hasSeatedRow = listTiers.some((tier) =>
    tierRequiresMap(tier, seatSelection?.map, seatSelection?.sectors),
  )
  const showSyntheticMapRow = hasInteractiveMap && !hasSeatedRow
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
        requiresMap: tierRequiresMap(
          tier,
          seatSelection?.map,
          seatSelection?.sectors,
        ),
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
      const sectorId = category.sectorId ?? tier?.seatingSectorId ?? null
      const zone = sectorId
        ? (seatSelection.map?.zones ?? []).find((item) => item.id === sectorId)
        : undefined
      const numbered =
        category.id === SYNTHETIC_MAP_TIER_ID ||
        (zone
          ? classifyZoneClick(zone, seatSelection.map) === "SECTOR_NUMERADO"
          : sectorUsesNumberedMap({
              seatingSectorId: sectorId,
              layoutType: tier?.layoutType,
              map: seatSelection.map,
              sectors: seatSelection.sectors,
            }))
      if (!numbered) {
        if (zone) {
          seatSelection.onSelectZone(zone)
          return
        }
        if (tier) {
          const cap = purchaseCapForTier({
            layoutType: tier.layoutType,
            maxPurchaseLimit: tier.maxPurchaseLimit,
            fallbackMax: maxTicketsPerUser,
          })
          onQuantityChange(
            tier.id,
            Math.min(cap, (quantities[tier.id] ?? 0) + 1),
            Math.min(cap, Math.max(0, tier.available)),
          )
        }
        return
      }
      setSeatSheetMode("map")
      setActiveSeatCategory({
        id: category.id,
        name: category.name,
        sectorId,
      })
      if (zone) seatSelection.onSelectZone(zone)
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
        <div className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-card/60 px-5 py-3.5">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="truncate text-base font-bold text-foreground">
              {placeLabel}
              {includesGeneralAccess ? (
                <span className="ml-2 text-xs font-semibold text-emerald-400">
                  Incluye acceso
                </span>
              ) : null}
            </p>
            {selectedSeat ? (
              <p className="text-sm font-black text-foreground/90">
                {formatTicketPrice(selectedSeat.price)}
                <span className="ml-2 text-xs font-medium text-muted-foreground">
                  Lugar reservado
                </span>
              </p>
            ) : (
              <p className="text-xs font-semibold text-muted-foreground">
                Lugar reservado
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={onClearSeat}
            className={cn(
              tapFeedbackClass,
              "h-9 shrink-0 border-emerald-600 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-emerald-500/10",
            )}
          >
            Modificar
          </Button>
        </div>
      ) : null}

      {hasInteractiveMap && seatSelection?.map ? (
        <InteractiveMapViewer
          map={seatSelection.map}
          eventId={seatSelection.eventId}
          occupancyBySeatId={seatSelection.occupancyBySeatId}
          priceBySectorId={seatSelection.priceBySectorId}
          pending={isPending}
          selectedZoneId={seatSelection.selectedZoneId}
          unavailableZoneIds={seatSelection.unavailableZoneIds}
          heldSeatIds={seatSelection.heldSeatIds}
          maxSelectable={maxTicketsPerUser ?? undefined}
          onSelectZone={seatSelection.onSelectZone}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <TicketSelectionList
            listTiers={listTiers}
            allTiers={tiers}
            bundleTiers={grouped.bundle}
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
            onPurchaseIntent={onPurchaseIntent}
            onOpenSeatSelection={openSeatSelection}
          />
        </div>

      {seatSelection ? (
        <SeatSelectionSheet
          open={isSeatSelectionOpen}
          onOpenChange={setIsSeatSelectionOpen}
          title={
            (seatSelection.selectedZoneId
              ? seatSelection.map?.zones.find(
                  (zone) => zone.id === seatSelection.selectedZoneId,
                )?.name
              : null) ??
            activeSeatCategory?.name ??
            "Seleccionar lugares"
          }
          sectorId={
            seatSelection.selectedZoneId ?? activeSeatCategory?.sectorId
          }
          pending={isPending}
          maxTicketsPerUser={maxTicketsPerUser}
          context={seatSelection}
          selectionMode={seatSheetMode}
        />
      ) : null}

      <InclusionWarning visible={showInclusionWarning} />

    </section>
  )
}

function TicketSelectionList({
  listTiers,
  allTiers,
  bundleTiers,
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
  onPurchaseIntent,
  onOpenSeatSelection,
}: {
  listTiers: TicketSelectorTier[]
  allTiers: TicketSelectorTier[]
  bundleTiers: TicketSelectorTier[]
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
  onPurchaseIntent?: () => void
  onOpenSeatSelection: (category: {
    id: string
    name: string
    sectorId?: string | null
  }) => void
}) {
  const dateCards = useMemo(
    () => listCheckoutDateCards(scheduleDays, allTiers),
    [allTiers, scheduleDays],
  )
  const showKindTabs = shouldShowCheckoutKindTabs(allTiers, scheduleDays)
  const samePriceAnyDay = useMemo(
    () => isSamePriceAnyDay(listTiers, scheduleDays),
    [listTiers, scheduleDays],
  )
  const initialKind = defaultCheckoutKindTab(allTiers)
  const initialDateId = defaultCheckoutDateId(dateCards, allTiers)
  const [kindTab, setKindTab] = useState<CheckoutKindTab>(initialKind)
  const [uncontrolledDateId, setUncontrolledDateId] = useState<string | null>(
    initialDateId,
  )
  const reduceMotion = useReducedMotion()
  const defaultKind = defaultCheckoutKindTab(allTiers)
  if (!showKindTabs && kindTab !== defaultKind) {
    setKindTab(defaultKind)
  }
  const nextDate = defaultCheckoutDateId(dateCards, allTiers)
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
    if (kindTab === "passes") {
      return listTiers.filter((tier) => ticketMatchesTab(tier, FULL_PASS_TAB_ID))
    }
    if (!showKindTabs && !showDateCards) {
      return listTiers.filter((tier) => !ticketMatchesTab(tier, FULL_PASS_TAB_ID))
    }
    if (!activeDateId) {
      return listTiers.filter((tier) => !ticketMatchesTab(tier, FULL_PASS_TAB_ID))
    }
    return listTiers.filter((tier) => ticketMatchesTab(tier, activeDateId))
  }, [activeDateId, kindTab, listTiers, showDateCards, showKindTabs])
  const showBundles =
    bundleTiers.length > 0 && (kindTab === "passes" || !showKindTabs)
  const noDayFunctions = kindTab === "days" && dateCards.length === 0
  const ticketGroups = useMemo<TicketDayGroup[]>(() => {
    if (kindTab === "passes") {
      return displayedTickets.length > 0
        ? [
            {
              dateId: FULL_PASS_TAB_ID,
              dateLabel: "Combos y Promos",
              tickets: displayedTickets,
            },
          ]
        : []
    }
    const grouped = groupTicketsByDate(displayedTickets, scheduleDays)
    return grouped.ticketsByDate.map((group) => ({
      ...group,
      dateLabel:
        ticketDateSectionLabel(group.dateId, scheduleDays) || group.dateLabel,
    }))
  }, [displayedTickets, kindTab, scheduleDays])
  const showDateHeaders =
    kindTab === "days" &&
    (ticketGroups.length > 1 || dateCards.length > 1 || scheduleDays.length > 1)

  const listKey =
    kindTab === "passes" ? "passes" : (activeDateId ?? "days")

  const seatMap = seatSelection?.map ?? null
  const mapSeats = useMemo(
    () => (seatMap ? flattenSeatsForAvailability(seatMap) : []),
    [seatMap],
  )
  const occupancyBySeatId = seatSelection?.occupancyBySeatId ?? {}

  const ticketNeedsSeatModal = (tier: TicketSelectorTier) =>
    tierRequiresMap(tier, seatSelection?.map, seatSelection?.sectors)

  function renderTierCard(tier: TicketSelectorTier) {
    const requiresMap = ticketNeedsSeatModal(tier)
    const selectedPlaces = requiresMap
      ? selectedPlacesForCategory(selectedItems, tier.seatingSectorId)
      : []
    return (
      <UnifiedTicketCard
        key={tier.id}
        tier={tier}
        dateLabel={ticketDayBadgeLabel(tier, scheduleDays)}
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

  const syntheticSelected = selectedPlacesForCategory(selectedItems)
  const syntheticRow = showSyntheticMapRow ? (
    <div className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-card/60 px-5 py-3.5 transition-all hover:border-white/20">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h4 className="truncate text-base font-bold text-foreground">
          Asientos numerados
          {includesGeneralAccess ? (
            <span className="ml-2 text-xs font-semibold text-emerald-400">
              Incluye acceso
            </span>
          ) : null}
        </h4>
        <div className="flex min-w-0 items-center gap-2 text-sm font-black text-foreground/90">
          <span className="truncate text-xs font-medium text-muted-foreground">
            Elegí mesas o butacas en el plano
          </span>
          <SelectedPlacesSummary labels={syntheticSelected} />
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        <PlaceActionButton
          selected={syntheticSelected.length > 0}
          loading={mapLoading}
          disabled={isPending || mapLoading}
          onClick={() =>
            onOpenSeatSelection({
              id: SYNTHETIC_MAP_TIER_ID,
              name: "Asientos numerados",
            })
          }
        />
      </div>
    </div>
  ) : null

  return (
    <div className="relative flex w-full flex-col">
      <h2 className="mb-3 pt-2 text-lg font-black text-foreground md:mb-4 md:text-xl">
        Elegí tu entrada
      </h2>
      {showKindTabs ? (
        <div
          className="mb-6 grid grid-cols-2 gap-1 rounded-full bg-secondary p-1"
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
                : "bg-secondary text-gray-700 dark:text-zinc-300",
            )}
          >
            Tickets por Día
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
                : "bg-secondary text-gray-700 dark:text-zinc-300",
            )}
          >
            Combos y Promos
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
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-400 dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:border-muted-foreground/40",
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

      <h3 className="mb-3 mt-4 text-sm font-bold text-foreground">
        Seleccioná tus entradas
      </h3>
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={listKey}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="z-0 flex flex-col gap-3 pb-32"
        >
          {noDayFunctions ? (
            <p className="text-sm text-muted-foreground">
              No hay funciones individuales disponibles para este evento.
            </p>
          ) : ticketGroups.length > 0 || showBundles ? (
            <div className="flex flex-col gap-3">
              {ticketGroups.map((group) => {
                const mapTickets = group.tickets.filter(ticketNeedsSeatModal)
                const generalTickets = group.tickets.filter(
                  (tier) => !ticketNeedsSeatModal(tier),
                )
                return (
                  <div key={group.dateId} className="mb-3 last:mb-0">
                    {showDateHeaders && group.dateLabel ? (
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
                        <CalendarDays
                          className="size-5 text-emerald-500"
                          aria-hidden="true"
                        />
                        {group.dateLabel}
                      </h3>
                    ) : null}
                    <div className="flex flex-col gap-3">
                      {mapTickets.map(renderTierCard)}
                      {generalTickets.length > 0 ? (
                        <TicketTierList
                          tiers={generalTickets}
                          siblingTiers={listTiers}
                          quantities={quantities}
                          selectedCount={selectedCount}
                          maxTicketsPerUser={maxTicketsPerUser}
                          isPending={isPending}
                          scheduleDays={scheduleDays}
                          onQuantityChange={onQuantityChange}
                        />
                      ) : null}
                    </div>
                  </div>
                )
              })}
              {kindTab === "days" || !showKindTabs ? syntheticRow : null}
              {showBundles ? (
                <BundleCardSelector
                  bundles={bundleTiers}
                  quantities={quantities}
                  isPending={isPending}
                  onBuy={(tierId) => {
                    const bundle = bundleTiers.find((row) => row.id === tierId)
                    onQuantityChange(
                      tierId,
                      1,
                      Math.max(0, bundle?.available ?? 1),
                    )
                    onPurchaseIntent?.()
                  }}
                />
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No hay entradas para esta selección.
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function SelectedPlacesSummary({
  labels,
}: {
  labels: string[]
}) {
  if (labels.length === 0) return null
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {labels.map((label) => (
        <span
          key={label}
          className="max-w-full truncate rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100"
        >
          {label}
        </span>
      ))}
    </div>
  )
}

function PlaceActionButton({
  selected,
  loading = false,
  disabled = false,
  onClick,
}: {
  selected: boolean
  loading?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  if (loading) {
    return (
      <Button
        type="button"
        disabled
        className="ml-auto h-9 px-4 font-semibold"
      >
        Cargando mapa…
      </Button>
    )
  }
  if (selected) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={onClick}
        className="ml-auto h-9 border-emerald-600 px-4 font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
      >
        Modificar lugares
      </Button>
    )
  }
  return (
    <Button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="ml-auto h-9 bg-emerald-600 px-4 font-semibold text-white hover:bg-emerald-700"
    >
      Elegir lugar
    </Button>
  )
}

function ticketCardBadges({
  chargeBadge,
  includesGeneralAccess,
  highlight,
  tier,
}: {
  chargeBadge: string | null
  includesGeneralAccess: boolean
  highlight: ReturnType<typeof resolveTicketHighlightBadge>
  tier: TicketSelectorTier
}) {
  const badges: Array<{ key: string; label: string; tone: "charge" | "access" | "highlight" | "custom" }> =
    []
  const showAccessCount = tier.showAccessCount !== false
  if (showAccessCount && chargeBadge) {
    badges.push({ key: "charge", label: chargeBadge, tone: "charge" })
  }
  const chargeImpliesAccess = /incluye/i.test(chargeBadge ?? "")
  const organizerWantsAccess =
    tier.includesAccess === true ||
    (tier.includesAccess !== false && includesGeneralAccess)
  if (organizerWantsAccess && !chargeImpliesAccess) {
    badges.push({ key: "access", label: "Incluye acceso", tone: "access" })
  }
  if (highlight === "bestseller") {
    badges.push({ key: "highlight", label: "Más vendida", tone: "highlight" })
  }
  const custom = tier.badgeText?.trim() || tier.bonusReward?.trim() || ""
  if (custom) {
    badges.push({ key: "custom", label: custom, tone: "custom" })
  }
  return badges
}

function UnifiedTicketCard({
  tier,
  dateLabel = null,
  siblingTiers,
  quantity,
  isPending,
  focused,
  maxTicketsPerUser,
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
  dateLabel?: string | null
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
  const remaining = purchaseCapForTier({
    layoutType: tier.layoutType,
    maxPurchaseLimit: tier.maxPurchaseLimit,
    fallbackMax: maxTicketsPerUser,
  })
  const max = Math.min(Math.max(0, tier.available), remaining)
  const highlight = resolveTicketHighlightBadge(tier, siblingTiers)
  const unitPrice = current?.price ?? tier.price
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
  const badges = ticketCardBadges({
    chargeBadge: charge.badge,
    includesGeneralAccess,
    highlight,
    tier,
  })
  const showStock = tier.showRemainingStock !== false

  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-card/60 px-5 py-3.5 transition-all hover:border-white/20",
        isSoldOut && "cursor-not-allowed opacity-70",
        focused && !isSoldOut && "ring-1 ring-primary/30",
        highlight === "bestseller" && !isSoldOut && "border-amber-500/35",
        selectedPlaces.length > 0 && !isSoldOut && "border-emerald-500/40",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h4 className="truncate text-base font-bold text-foreground">
          {tier.name}
        </h4>
        <div className="flex min-w-0 items-center gap-2 text-sm font-black text-foreground/90">
          <span className="tabular-nums">{formatTicketPrice(shownPrice)}</span>
          {dateLabel ? (
            <Badge
              variant="outline"
              className="h-5 border-emerald-500/50 px-1.5 text-[10px] font-semibold text-emerald-400"
            >
              {dateLabel}
            </Badge>
          ) : null}
          {badges.map((badge) => (
            <span
              key={badge.key}
              className={cn(
                "truncate text-xs font-semibold",
                badge.tone === "highlight"
                  ? "text-amber-500"
                  : badge.tone === "access" || badge.tone === "charge"
                    ? "text-emerald-400"
                    : "text-muted-foreground",
              )}
            >
              {badge.label}
            </span>
          ))}
          {isSoldOut ? (
            <span className="text-xs font-semibold text-destructive">
              Agotado
            </span>
          ) : showStock ? (
            <StockHint
              available={availability.available}
              capacity={tier.capacity}
              sold={tier.sold}
            />
          ) : null}
          {requiresMap && !isSoldOut ? (
            <SelectedPlacesSummary labels={selectedPlaces} />
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        {isSoldOut ? (
          <Button type="button" disabled className="h-9 px-3 text-sm font-semibold">
            Agotado
          </Button>
        ) : requiresMap ? (
          <PlaceActionButton
            selected={selectedPlaces.length > 0}
            loading={mapLoading}
            disabled={isPending || mapLoading}
            onClick={onOpenSeatSelection}
          />
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
            Las entradas seleccionadas se reservan de forma temporal durante el proceso de pago.
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
        const remaining = purchaseCapForTier({
          layoutType: tier.layoutType,
          maxPurchaseLimit: tier.maxPurchaseLimit,
          fallbackMax: maxTicketsPerUser,
        })
        const max = Math.min(Math.max(0, tier.available), remaining)
        const description = tier.description?.trim() || ""
        const highlight = resolveTicketHighlightBadge(tier, tiers)
        const unitPrice = current?.price ?? tier.price
        const phaseName = current?.name
        return (
          <li
            key={tier.id}
            className={cn(
              "w-full rounded-2xl border border-white/10 bg-card/60 px-5 py-3.5 transition-all hover:border-white/20",
              focusedTierId === tier.id && "ring-1 ring-primary/30",
              highlight === "bestseller" && "border-amber-500/35",
              quantity > 0 && "border-emerald-500/40",
            )}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-base font-bold text-foreground">
                  {tier.name}
                </p>
                <div className="flex min-w-0 items-center gap-2 text-sm font-black text-foreground/90">
                  <span className="tabular-nums">
                    {formatTicketPrice(unitPrice)}
                  </span>
                  {highlight === "bestseller" ? (
                    <span className="text-xs font-semibold text-amber-500">
                      Más vendida
                    </span>
                  ) : null}
                  {phaseName ? (
                    <span className="truncate text-xs font-medium text-muted-foreground">
                      {phaseName}
                    </span>
                  ) : description ? (
                    <span className="truncate text-xs font-medium text-muted-foreground">
                      {description}
                    </span>
                  ) : null}
                  <StockHint
                    available={tier.available}
                    capacity={tier.capacity}
                    sold={tier.sold}
                  />
                </div>
              </div>
              <div className="flex shrink-0 items-center">
                {action === "add" ? (
                  <Button
                    type="button"
                    disabled={isPending || max === 0}
                    onClick={() =>
                      onQuantityChange(tier.id, Math.min(max, quantity + 1), max)
                    }
                    className={cn(tapFeedbackClass, "h-9 shrink-0 rounded-xl px-3")}
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
            </div>
            {sale.upcoming.length > 0 ? (
              <ul className="mt-2 space-y-1 border-t border-white/10 pt-2">
                {sale.upcoming.map((phase) => (
                  <li
                    key={phase.id}
                    className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Clock className="size-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {phase.name} - {formatTicketPrice(phase.price)}
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
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
        <AlertCircle className="size-3" aria-hidden="true" />
        Agotado
      </span>
    )
  }
  if (scarcity.kind === "available") {
    return null
  }
  return (
    <span className="text-xs font-semibold text-amber-500">
      Pocas disponibles
    </span>
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
    <div className="flex h-9 items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-2">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled || value <= 0}
        onClick={() => onChange(value - 1)}
        aria-label="Quitar"
        className={cn(tapFeedbackClass, "size-7 rounded-md hover:bg-white/5")}
      >
        <Minus className="size-3.5" />
      </Button>
      <span className="min-w-5 text-center text-sm font-bold tabular-nums text-foreground">
        {value}
      </span>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        aria-label="Agregar"
        className={cn(tapFeedbackClass, "size-7 rounded-md hover:bg-white/5")}
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
