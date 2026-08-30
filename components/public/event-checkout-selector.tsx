"use client"

import {
  AlertCircle,
  CalendarDays,
  Clock,
  Info,
  Map,
  Package,
} from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useMemo, useState } from "react"

import { QuantityCounter } from "@/components/public/quantity-counter"
import { BundleCardSelector } from "@/components/public/bundle-card-selector"
import {
  SeatSelectionSheet,
  type SeatSelectionContext,
} from "@/components/public/seat-selection-sheet"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import { useCheckoutStore } from "@/lib/stores/checkout-store"
import {
  useStorefrontSeatStore,
  type StorefrontSelectedItem,
} from "@/lib/stores/storefront-seat-store"
import { Button } from "@/components/ui/button"
import { resolveTicketHighlightBadge } from "@/lib/checkout/ticket-picker"
import { resolveStockScarcity } from "@/lib/checkout/stock-scarcity"
import { CustomerFacingTicketPrice } from "@/components/public/customer-facing-price"
import { publicOfferPrice } from "@/lib/checkout/public-price"
import { formatTicketPrice } from "@/lib/format"
import { resolveSalePhases } from "@/lib/inventory/active-phase"
import { resolveTicketSaleState } from "@/lib/inventory/ticket-sale-window"
import {
  inferInventoryTierType,
  isQuantityInventoryType,
  type InventoryTierType,
} from "@/lib/inventory/unified-inventory"
import { purchaseCapForTier } from "@/lib/checkout-limits"
import {
  resolveCategoryAvailability,
  sectorStockFromSummary,
} from "@/lib/checkout/category-stock"
import { pickSectorSummaryForDay } from "@/lib/seating/seating-sector-summary"
import {
  SOLD_OUT_BADGE_CLASS,
  SOLD_OUT_TICKET_CARD_CLASS,
  isTicketCardBlocked,
  selectableTicketStock,
} from "@/lib/checkout/ticket-stock"
import {
  displayChargePrice,
  resolveChargeUnit,
} from "@/lib/checkout/charge-unit"
import { resolveSectorAssignMeta } from "@/lib/seating/assign-best-seats"
import {
  COMBO_PACKS_TAB_ID,
  FULL_PASS_TAB_ID,
  defaultCheckoutDateId,
  checkoutTicketsForSelectedDay,
  isSamePriceAnyDay,
  listCheckoutDateCards,
  quantityForPublicTier,
  ticketDateSectionLabel,
  ticketMatchesTab,
  ticketVisibleOnCheckoutDay,
  type TicketDayGroup,
} from "@/lib/checkout/ticket-day-groups"
import {
  COMBO_PACKS_SUBTITLE,
  isComboPackOffer,
} from "@/lib/checkout/combo-schedule"
import {
  partitionCheckoutTickets,
  resolveTicketCommerceType,
} from "@/lib/events/ticket-commerce-type"
import { storefrontItemMatchesSchedule } from "@/lib/checkout/seat-hold-day"
import {
  ticketHasSeatingSector,
  ticketUsesMapSelector,
} from "@/lib/checkout/public-ticket-view"
import {
  cartMapUnitIdsForSchedule,
  isMapCartLine,
} from "@/lib/checkout/cart-item-identity"
import { flattenSeatsForAvailability } from "@/lib/seating/venue-map-geometry"
import { classifyZoneClick } from "@/lib/seating/map-click-target"
import type { VenueMapZone } from "@/types/venue-map"
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
  onFocusedTierIdChange?: (tierId: string | null) => void
  seatSheetOpen?: boolean
  onSeatSheetOpenChange?: (open: boolean) => void
}

function tierRequiresMap(tier: TicketSelectorTier): boolean {
  return ticketUsesMapSelector(tier)
}

export function EventCheckoutSelector({
  tiers,
  quantities,
  isPending,
  hasInteractiveMap = false,
  mapLoading = false,
  selectedSeat,
  selectedPlaceCount = 0,
  includesGeneralAccess = false,
  onQuantityChange,
  onOpenSeatFlow,
  onPurchaseIntent,
  maxTicketsPerUser = null,
  selectedCount = 0,
  seatSelection = null,
  scheduleDays = [],
  selectedDateId = null,
  onSelectedDateIdChange,
  onFocusedTierIdChange,
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
  const { standardTickets, comboTickets } = useMemo(
    () => partitionCheckoutTickets(tiers),
    [tiers],
  )
  const listTiers = tiers.filter((tier) => {
    if (resolveTicketCommerceType(tier) === "extra") return false
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
  const mapSeatSelection = useMemo(() => {
    if (!seatSelection) return null
    return {
      ...seatSelection,
      onSelectZone: (zone: VenueMapZone) => {
        seatSelection.onSelectZone(zone)
        const numbered =
          classifyZoneClick(zone, seatSelection.map) === "SECTOR_NUMERADO"
        setSeatSheetMode(numbered ? "map" : "counter")
        setActiveSeatCategory({
          id: zone.id,
          name: zone.name,
          sectorId: zone.id,
        })
        setIsSeatSelectionOpen(true)
      },
    }
  }, [seatSelection, setIsSeatSelectionOpen])
  const showGlobalMapCta = hasInteractiveMap
  const hasInventory =
    listTiers.length > 0 ||
    grouped.bundle.length > 0 ||
    showGlobalMapCta
  const admissionTiersForDates = useMemo(
    () => tiers.filter((tier) => resolveTicketCommerceType(tier) !== "extra"),
    [tiers],
  )
  const dateCards = useMemo(
    () => listCheckoutDateCards(scheduleDays, admissionTiersForDates),
    [admissionTiersForDates, scheduleDays],
  )
  const defaultDateId = defaultCheckoutDateId(dateCards, standardTickets)
  const [uncontrolledDateId, setUncontrolledDateId] = useState(defaultDateId)
  const dateIsControlled = typeof onSelectedDateIdChange === "function"
  const activeDateId = dateIsControlled
    ? (selectedDateId ?? defaultDateId)
    : uncontrolledDateId
  const dateStillValid =
    Boolean(activeDateId) &&
    dateCards.some((card) => card.dateId === activeDateId)
  if (!dateIsControlled && !dateStillValid && uncontrolledDateId !== defaultDateId) {
    setUncontrolledDateId(defaultDateId)
  }

  function selectCheckoutDate(dateId: string) {
    if (dateIsControlled) {
      onSelectedDateIdChange?.(dateId)
      return
    }
    setUncontrolledDateId(dateId)
  }

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
    (sum, tier) =>
      sum +
      quantityForPublicTier(quantities, tier, {
        selectedDateId: activeDateId,
        scheduleDays,
      }),
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
    const requiresMap = !tier
      ? true
      : tierRequiresMap(tier)
    if (tier) {
      const summary = pickSectorSummaryForDay(
        seatSelection?.sectorSummaries ?? [],
        {
          sectorId: tier.seatingSectorId ?? category.sectorId,
          sectorName: tier.name,
          tierId: tier.id,
          eventDateId: activeDateId,
          scheduleDayCount: scheduleDays.length,
        },
      )
      const stock = sectorStockFromSummary(summary, scheduleDays.length)
      const availability = resolveCategoryAvailability({
        requiresMap,
        stock: selectableTicketStock(tier),
        categoryId: tier.id,
        seatingSectorId: tier.seatingSectorId ?? category.sectorId,
        categoryName: tier.name,
        seats: seatSelection?.map
          ? flattenSeatsForAvailability(seatSelection.map)
          : [],
        occupancyBySeatId: seatSelection?.occupancyBySeatId,
        summaryAvailable: stock.available,
        summaryTotal: stock.total,
        mapSectorIds: seatSelection?.map?.zones?.map((zone) => zone.id) ?? [],
        mapReady: Boolean(seatSelection?.map) && !mapLoading,
      })
      if (
        availability.isSoldOut ||
        availability.isUnconfigured ||
        isTicketCardBlocked(tier)
      ) {
        return
      }
      if (!requiresMap && selectableTicketStock(tier) <= 0) return
    }
    if (hasInteractiveMap && seatSelection) {
      onFocusedTierIdChange?.(tier?.id ?? category.id)
      setSeatSheetMode("map")
      setActiveSeatCategory({
        id: category.id,
        name: category.name,
        sectorId: tier?.seatingSectorId ?? category.sectorId ?? null,
      })
      setIsSeatSelectionOpen(true)
      return
    }
    onFocusedTierIdChange?.(tier?.id ?? category.id)
    onOpenSeatFlow()
  }

  function openGlobalMap() {
    onFocusedTierIdChange?.(null)
    setActiveSeatCategory(null)
    setSeatSheetMode("map")
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
              <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-black text-foreground/90">
                <CustomerFacingTicketPrice price={selectedSeat.price} />
                <span className="text-xs font-medium text-muted-foreground">
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
            onClick={() => onOpenSeatFlow()}
            className={cn(
              tapFeedbackClass,
              "h-9 shrink-0 border-emerald-600 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-emerald-500/10",
            )}
          >
            Modificar
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <TicketSelectionList
            listTiers={listTiers}
            allTiers={tiers}
            standardTickets={standardTickets}
            comboTickets={comboTickets}
            bundleTiers={grouped.bundle}
            quantities={quantities}
            isPending={isPending}
            maxTicketsPerUser={maxTicketsPerUser}
            selectedCount={selectedCount}
            mapLoading={mapLoading}
            selectedItems={selectedItems}
            scheduleDays={scheduleDays}
            selectedDateId={activeDateId}
            onSelectedDateIdChange={selectCheckoutDate}
            showGlobalMapCta={showGlobalMapCta}
            hasInteractiveMap={hasInteractiveMap}
            seatSelection={seatSelection}
            onQuantityChange={onQuantityChange}
            onPurchaseIntent={onPurchaseIntent}
            onOpenSeatSelection={openSeatSelection}
            onOpenGlobalMap={openGlobalMap}
            onFocusedTierIdChange={onFocusedTierIdChange}
          />
        </div>

      {hasInteractiveMap && mapSeatSelection ? (
        <SeatSelectionSheet
          open={isSeatSelectionOpen}
          onOpenChange={(open) => {
            setIsSeatSelectionOpen(open)
            if (!open) {
              setSeatSheetMode("map")
              setActiveSeatCategory(null)
            }
          }}
          title={
            activeSeatCategory?.name ??
            (mapSeatSelection.selectedZoneId
              ? mapSeatSelection.map?.zones.find(
                  (zone) => zone.id === mapSeatSelection.selectedZoneId,
                )?.name
              : null) ??
            "Seleccionar lugares"
          }
          sectorId={activeSeatCategory?.sectorId ?? null}
          pending={isPending}
          loading={mapLoading}
          maxTicketsPerUser={maxTicketsPerUser}
          context={mapSeatSelection}
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
  standardTickets,
  comboTickets,
  bundleTiers,
  quantities,
  isPending,
  maxTicketsPerUser,
  selectedCount,
  mapLoading,
  selectedItems,
  scheduleDays,
  selectedDateId,
  onSelectedDateIdChange,
  showGlobalMapCta,
  hasInteractiveMap,
  seatSelection,
  onQuantityChange,
  onPurchaseIntent,
  onOpenSeatSelection,
  onOpenGlobalMap,
  onFocusedTierIdChange,
}: {
  listTiers: TicketSelectorTier[]
  allTiers: TicketSelectorTier[]
  standardTickets: TicketSelectorTier[]
  comboTickets: TicketSelectorTier[]
  bundleTiers: TicketSelectorTier[]
  quantities: Record<string, number>
  isPending: boolean
  maxTicketsPerUser: number | null
  selectedCount: number
  mapLoading: boolean
  selectedItems: StorefrontSelectedItem[]
  scheduleDays: ScheduleDay[]
  selectedDateId: string | null
  onSelectedDateIdChange?: (dateId: string) => void
  showGlobalMapCta: boolean
  hasInteractiveMap: boolean
  seatSelection: SeatSelectionContext | null
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  onPurchaseIntent?: () => void
  onOpenSeatSelection: (category: {
    id: string
    name: string
    sectorId?: string | null
  }) => void
  onOpenGlobalMap: () => void
  onFocusedTierIdChange?: (tierId: string | null) => void
}) {
  const admissionTiers = useMemo(
    () =>
      allTiers.filter((tier) => resolveTicketCommerceType(tier) !== "extra"),
    [allTiers],
  )
  const dateCards = useMemo(
    () => listCheckoutDateCards(scheduleDays, admissionTiers),
    [admissionTiers, scheduleDays],
  )
  const showAccessTabs = comboTickets.length > 0
  const samePriceAnyDay = useMemo(
    () => isSamePriceAnyDay(standardTickets, scheduleDays),
    [scheduleDays, standardTickets],
  )
  const [accessTab, setAccessTab] = useState<"entradas" | "combos">("entradas")
  const reduceMotion = useReducedMotion()
  const activeDateId = selectedDateId

  function selectDate(dateId: string) {
    setAccessTab("entradas")
    onFocusedTierIdChange?.(null)
    onSelectedDateIdChange?.(dateId)
  }

  const showDateCards =
    dateCards.length > 1 || (showAccessTabs && dateCards.length >= 1)
  const daySelectedItems = useMemo(
    () =>
      selectedItems.filter((item) =>
        storefrontItemMatchesSchedule(item, activeDateId, {
          scheduleDayCount: scheduleDays.length,
        }),
      ),
    [activeDateId, scheduleDays.length, selectedItems],
  )

  const displayedTickets = useMemo(() => {
    if (accessTab === "combos") {
      return listTiers.filter((tier) => isComboPackOffer(tier))
    }
    const withoutSectors = listTiers.filter(
      (tier) => !ticketHasSeatingSector(tier),
    )
    const entradas = withoutSectors.filter(
      (tier) => resolveTicketCommerceType(tier) === "standard",
    )
    if (activeDateId) {
      return entradas.filter((tier) =>
        ticketVisibleOnCheckoutDay(tier, activeDateId, scheduleDays),
      )
    }
    return entradas.filter((tier) => !ticketMatchesTab(tier, FULL_PASS_TAB_ID))
  }, [accessTab, activeDateId, listTiers, scheduleDays])
  const showBundles =
    bundleTiers.length > 0 && (accessTab === "combos" || !showAccessTabs)
  const ticketGroups = useMemo<TicketDayGroup[]>(() => {
    if (accessTab === "combos") {
      return displayedTickets.length > 0
        ? [
            {
              dateId: COMBO_PACKS_TAB_ID,
              dateLabel: "Combos / Packs",
              tickets: displayedTickets,
            },
          ]
        : []
    }
    if (activeDateId) {
      return checkoutTicketsForSelectedDay(
        displayedTickets,
        activeDateId,
        scheduleDays,
      )
    }
    return checkoutTicketsForSelectedDay(displayedTickets, null, scheduleDays)
  }, [accessTab, activeDateId, displayedTickets, scheduleDays])
  const showDateHeaders = accessTab === "entradas" && ticketGroups.length > 1

  const selectorTitle =
    accessTab === "combos"
      ? "Combos / Packs"
      : ticketDateSectionLabel(activeDateId, scheduleDays) || "Elegí tu entrada"
  const listKey =
    accessTab === "combos" ? "combos" : (activeDateId ?? "entradas")

  const seatMap = seatSelection?.map ?? null
  const cartLines = useCheckoutStore((state) => state.lines)
  const hasMapPlacesOnDay =
    cartMapUnitIdsForSchedule(cartLines, activeDateId).length > 0 ||
    daySelectedItems.some(
      (item) =>
        item.type === "seat" ||
        item.type === "table" ||
        item.type === "zone" ||
        item.type === "standing" ||
        isMapCartLine(item),
    )

  return (
    <div className="relative flex w-full flex-col">
      <h2 className="mb-3 pt-2 text-lg font-black text-foreground first-letter:uppercase md:mb-4 md:text-xl">
        {selectorTitle}
      </h2>
      {showDateCards || showAccessTabs ? (
        <div
          className="hide-scrollbar flex gap-3 overflow-x-auto snap-x snap-mandatory pb-4 lg:flex-wrap lg:gap-4 lg:overflow-visible lg:snap-none lg:pb-6"
          role="tablist"
          aria-label="Elegí el día"
        >
          {dateCards.map((card) => {
            const selected =
              accessTab === "entradas" && activeDateId === card.dateId
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
          {showAccessTabs ? (
            <button
              type="button"
              role="tab"
              aria-selected={accessTab === "combos"}
              onClick={() => setAccessTab("combos")}
              className={cn(
                "flex min-w-[148px] snap-start cursor-pointer flex-col items-center justify-center rounded-xl border-2 px-6 py-3 transition-all",
                accessTab === "combos"
                  ? "border-primary bg-primary/10 font-bold text-primary"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-400 dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:border-muted-foreground/40",
              )}
            >
              <Package className="size-4" aria-hidden="true" />
              <span className="mt-0.5 text-sm font-black tracking-tight">
                Combos / Packs
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
      {accessTab === "entradas" && showDateCards && samePriceAnyDay ? (
        <p className="text-xs font-medium text-muted-foreground">
          Mismo valor para cualquier día seleccionado
        </p>
      ) : null}

      {accessTab === "combos" ? (
        <p className="mb-3 mt-1 text-sm text-muted-foreground">
          {COMBO_PACKS_SUBTITLE}
        </p>
      ) : !ticketDateSectionLabel(activeDateId, scheduleDays) ? (
        <h3 className="mb-3 mt-4 text-sm font-bold text-foreground">
          Seleccioná tus entradas
        </h3>
      ) : null}
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={listKey}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="z-0 flex flex-col gap-3 pb-32"
        >
          {showGlobalMapCta && accessTab === "entradas" ? (
            <GlobalMapCta
              hasMapPlaces={hasMapPlacesOnDay}
              loading={mapLoading}
              disabled={isPending || mapLoading}
              onClick={onOpenGlobalMap}
            />
          ) : null}
          {ticketGroups.length > 0 || showBundles ? (
            <div className="flex flex-col gap-3">
              {ticketGroups.map((group) => {
                const visibleTickets =
                  accessTab === "combos"
                    ? group.tickets
                    : group.tickets.filter((tier) => !ticketHasSeatingSector(tier))
                if (visibleTickets.length === 0) return null
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
                      <TicketTierList
                        tiers={visibleTickets}
                        includeMappedTiers={accessTab === "combos"}
                        siblingTiers={listTiers}
                        quantities={quantities}
                        scheduleId={activeDateId ?? group.dateId}
                        selectedCount={selectedCount}
                        maxTicketsPerUser={maxTicketsPerUser}
                        isPending={isPending}
                        scheduleDays={scheduleDays}
                        venueMap={seatMap}
                        hasInteractiveMap={hasInteractiveMap}
                        sectorSummaries={seatSelection?.sectorSummaries}
                        onQuantityChange={onQuantityChange}
                        onSelectSeat={(tierId) => {
                          const tier = listTiers.find((item) => item.id === tierId)
                          if (!tier) return
                          onOpenSeatSelection({
                            id: tier.id,
                            name: tier.name,
                            sectorId: tier.seatingSectorId,
                          })
                        }}
                      />
                    </div>
                  </div>
                )
              })}
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
          ) : showGlobalMapCta && accessTab === "entradas" ? null : (
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

function GlobalMapCta({
  hasMapPlaces,
  loading = false,
  disabled = false,
  onClick,
}: {
  hasMapPlaces: boolean
  loading?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        tapFeedbackClass,
        "h-14 w-full gap-3 rounded-2xl text-lg font-bold",
      )}
    >
      <Map className="size-5 shrink-0" aria-hidden="true" />
      {loading
        ? "Cargando mapa..."
        : hasMapPlaces
          ? "Modificar lugares en el mapa"
          : "Elegir lugares en el mapa"}
    </Button>
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
        className="ml-auto h-10 whitespace-nowrap border-emerald-600 px-4 text-xs font-extrabold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
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
      className="ml-auto h-10 whitespace-nowrap bg-emerald-500 px-4 text-xs font-extrabold text-black hover:bg-emerald-400"
    >
      Elegir en plano
    </Button>
  )
}

function ticketCardBadges({
  chargeBadge,
  tier,
}: {
  chargeBadge: string | null
  includesGeneralAccess: boolean
  highlight: ReturnType<typeof resolveTicketHighlightBadge>
  tier: TicketSelectorTier
}) {
  const badges: Array<{ key: string; label: string }> = []
  const showAccessCount = tier.showAccessCount !== false
  if (showAccessCount && /incluye/i.test(chargeBadge ?? "")) {
    badges.push({ key: "charge", label: chargeBadge!.trim() })
  }
  return badges
}

export function UnifiedTicketCard({
  tier,
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
  scheduleDayCount = 0,
  selectedDateId = null,
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
  scheduleDayCount?: number
  selectedDateId?: string | null
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  onOpenSeatSelection: () => void
}) {
  const saleState = resolveTicketSaleState({
    available: tier.available,
    capacity: tier.capacity,
    sold: tier.sold,
    saleStartsAt: tier.saleStartsAt,
    saleEndsAt: tier.saleEndsAt,
  })
  const windowClosed = saleState.kind !== "active"
  const remaining = purchaseCapForTier({
    layoutType: tier.layoutType,
    maxPurchaseLimit: tier.maxPurchaseLimit,
    fallbackMax: maxTicketsPerUser,
  })
  const skuLeft = selectableTicketStock(tier)
  const max = Math.min(skuLeft, remaining)
  const highlight = resolveTicketHighlightBadge(tier, siblingTiers)
  const unitPrice = publicOfferPrice(tier)
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

  const summary = pickSectorSummaryForDay(sectorSummaries ?? [], {
    sectorId: tier.seatingSectorId,
    sectorName: tier.name,
    tierId: tier.id,
    eventDateId: selectedDateId,
    scheduleDayCount,
  })
  const stock = sectorStockFromSummary(summary, scheduleDayCount)
  const availability = resolveCategoryAvailability({
    requiresMap,
    stock: skuLeft,
    categoryId: tier.id,
    seatingSectorId: tier.seatingSectorId,
    categoryName: tier.name,
    seats: mapSeats,
    occupancyBySeatId,
    summaryAvailable: stock.available,
    summaryTotal: stock.total,
    mapSectorIds: venueMap?.zones?.map((zone) => zone.id) ?? [],
    mapReady,
  })
  const isSoldOut =
    saleState.kind === "sold_out" ||
    isTicketCardBlocked(tier) ||
    availability.isUnconfigured ||
    (requiresMap ? availability.isSoldOut : skuLeft <= 0)
  const inactive = isSoldOut || windowClosed
  const badges = ticketCardBadges({
    chargeBadge: charge.badge,
    includesGeneralAccess,
    highlight,
    tier,
  })
  const showStock = tier.showRemainingStock !== false
  const ticketErrorId = useCheckoutStore((state) => state.ticketErrorId)
  const ticketErrorMessage = useCheckoutStore((state) => state.ticketErrorMessage)
  const isError =
    ticketErrorId === tier.id ||
    (Boolean(ticketErrorId) && ticketErrorId === tier.seatingSectorId)

  return (
    <div
      className={cn(
        "flex w-full flex-col rounded-2xl border p-4 transition-all",
        isError
          ? "border-red-500/50 bg-red-500/5"
          : "border-white/10 bg-card",
        "min-h-[80px]",
        isSoldOut && SOLD_OUT_TICKET_CARD_CLASS,
        inactive && !isSoldOut && "cursor-not-allowed opacity-70",
        focused && !inactive && !isError && "ring-1 ring-primary/30",
        selectedPlaces.length > 0 && !inactive && !isError && "border-emerald-500/40",
      )}
    >
      <div className="flex w-full items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h4
          className={cn(
            "truncate text-base leading-tight font-extrabold text-foreground",
            isSoldOut && "text-muted-foreground line-through",
          )}
        >
          {tier.name}
        </h4>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex shrink-0 items-center whitespace-nowrap text-base font-black tabular-nums text-foreground",
              isSoldOut && "text-muted-foreground line-through",
            )}
          >
            {shownPrice === 0 ? (
              "Gratis"
            ) : (
              <CustomerFacingTicketPrice price={shownPrice} />
            )}
          </span>
          {badges.map((badge) => (
            <span
              key={badge.key}
              className="shrink-0 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-extrabold text-emerald-400 uppercase"
            >
              {badge.label}
            </span>
          ))}
          {isSoldOut ? (
            <span className={SOLD_OUT_BADGE_CLASS}>Agotado</span>
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
      <div className="flex shrink-0 items-center justify-end pl-2">
        {inactive ? (
          <Button type="button" disabled className="h-9 px-3 text-sm font-semibold text-muted-foreground">
            {saleState.kind === "upcoming"
              ? "Próximamente"
              : saleState.kind === "ended"
                ? "Finalizado"
                : "Agotado"}
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
              if (isError) useCheckoutStore.getState().clearTicketError()
              onQuantityChange(tier.id, next, max)
            }}
          />
        )}
      </div>
      </div>
      {isError ? (
        <span className="mt-2 flex items-center gap-1 text-xs font-medium text-red-400">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {ticketErrorMessage ||
            "Stock insuficiente para la cantidad seleccionada."}
        </span>
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
      {tiers.filter((tier) => !ticketHasSeatingSector(tier)).map((tier) => {
        const sale = resolveSalePhases(tier.phases)
        const current = sale.current
        const quantity = quantityForPublicTier(quantities, tier, {
          undated: true,
        })
        const remaining = purchaseCapForTier({
          layoutType: tier.layoutType,
          maxPurchaseLimit: tier.maxPurchaseLimit,
          fallbackMax: maxTicketsPerUser,
        })
        const max = Math.min(selectableTicketStock(tier), remaining)
        const soldOut =
          max <= 0 ||
          selectableTicketStock(tier) <= 0 ||
          isTicketCardBlocked(tier)
        const description = tier.description?.trim() || ""
        const highlight = resolveTicketHighlightBadge(tier, tiers)
        const unitPrice = publicOfferPrice(tier)
        const phaseName = current?.name
        return (
          <li
            key={tier.id}
            className={cn(
              "w-full rounded-2xl border border-white/10 bg-card/60 px-5 py-3.5 transition-all hover:border-white/20",
              focusedTierId === tier.id && "ring-1 ring-primary/30",
              highlight === "bestseller" && "border-amber-500/35",
              quantity > 0 && !soldOut && "border-emerald-500/40",
              soldOut && SOLD_OUT_TICKET_CARD_CLASS,
            )}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p
                  className={cn(
                    "truncate text-base font-bold text-foreground",
                    soldOut && "text-muted-foreground line-through",
                  )}
                >
                  {tier.name}
                </p>
                <div className="flex min-w-0 items-center gap-2 text-sm font-black text-foreground/90">
                  <span
                    className={cn(
                      "tabular-nums",
                      soldOut && "text-muted-foreground line-through",
                    )}
                  >
                    <CustomerFacingTicketPrice price={unitPrice} />
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
                  {soldOut ? (
                    <span className={SOLD_OUT_BADGE_CLASS}>Agotado</span>
                  ) : (
                    <StockHint
                      available={max}
                      capacity={tier.capacity}
                      sold={tier.sold}
                    />
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center">
                {soldOut ? (
                  <Button
                    type="button"
                    disabled
                    className="h-9 px-3 text-sm font-semibold"
                  >
                    Agotado
                  </Button>
                ) : action === "add" ? (
                  <Button
                    type="button"
                    disabled={isPending}
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
                    disabled={isPending}
                    onChange={(next) => {
                      if (max <= 0) return
                      onQuantityChange(tier.id, next, max)
                    }}
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
      <span className={cn(SOLD_OUT_BADGE_CLASS, "inline-flex items-center gap-1")}>
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
    <QuantityCounter
      quantity={value}
      max={max}
      disabled={disabled}
      onDecrease={() => onChange(value - 1)}
      onIncrease={() => {
        if (max <= 0) return
        onChange(value + 1)
      }}
    />
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
