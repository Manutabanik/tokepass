"use client"

import {
  AlertCircle,
  CalendarDays,
  Clock,
  Info,
  Minus,
  Plus,
  Sparkles,
} from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useState } from "react"

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
import { groupTicketsByDate } from "@/lib/checkout/ticket-day-groups"
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
      className="mx-auto flex h-full w-full max-w-3xl flex-col space-y-5 px-4 md:px-0"
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
        showSyntheticMapRow={showSyntheticMapRow}
        onQuantityChange={onQuantityChange}
        onOpenSeatSelection={openSeatSelection}
      />

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
  showSyntheticMapRow,
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
  showSyntheticMapRow: boolean
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  onOpenSeatSelection: (category: {
    id: string
    name: string
    sectorId?: string | null
  }) => void
}) {
  const groupedDays = useMemo(
    () => groupTicketsByDate(listTiers, scheduleDays),
    [listTiers, scheduleDays],
  )
  const hasFullPass = groupedDays.fullPassTickets.length > 0
  const dayGroups = groupedDays.ticketsByDate
  const showDayTabs = hasFullPass || dayGroups.length > 1
  const defaultTab = hasFullPass
    ? "full_pass"
    : (dayGroups[0]?.dateId ?? "full_pass")
  const [selectedTab, setSelectedTab] = useState(defaultTab)

  useEffect(() => {
    const validIds = new Set<string>([
      ...(hasFullPass ? ["full_pass"] : []),
      ...dayGroups.map((group) => group.dateId),
    ])
    if (!validIds.has(selectedTab)) {
      setSelectedTab(defaultTab)
    }
  }, [defaultTab, dayGroups, hasFullPass, selectedTab])

  const visibleTiers = useMemo(() => {
    if (!showDayTabs) return listTiers
    if (selectedTab === "full_pass") return groupedDays.fullPassTickets
    return dayGroups.find((group) => group.dateId === selectedTab)?.tickets ?? []
  }, [
    dayGroups,
    groupedDays.fullPassTickets,
    listTiers,
    selectedTab,
    showDayTabs,
  ])

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
    <div className="group rounded-2xl border border-border/60 bg-card p-4 transition-all hover:border-border hover:bg-card/80 md:p-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
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
    <div className="flex h-full w-full flex-col">
      {showDayTabs ? (
        <div className="sticky top-0 z-30 -mx-4 mb-6 border-b border-border/50 bg-background px-4 pb-4 pt-4 backdrop-blur-xl md:mx-0 md:px-0">
          <div
            className="no-scrollbar flex items-center gap-3 overflow-x-auto pb-1"
            role="tablist"
            aria-label="Filtrar entradas por día"
          >
            {hasFullPass ? (
              <button
                type="button"
                role="tab"
                aria-selected={selectedTab === "full_pass"}
                onClick={() => setSelectedTab("full_pass")}
                className={cn(
                  "inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-bold transition-all",
                  selectedTab === "full_pass"
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80",
                )}
              >
                <Sparkles className="size-3.5" aria-hidden="true" />
                Pase Completo
              </button>
            ) : null}
            {dayGroups.map((day) => (
              <button
                key={day.dateId}
                type="button"
                role="tab"
                aria-selected={selectedTab === day.dateId}
                onClick={() => setSelectedTab(day.dateId)}
                className={cn(
                  "inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-bold transition-all",
                  selectedTab === day.dateId
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80",
                )}
              >
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {day.dateLabel}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 pb-[140px]">
        {visibleTiers.map(renderTierCard)}
        {syntheticRow}
      </div>
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

  const isSoldOut = max === 0 && quantity === 0

  return (
    <div
      className={cn(
        "group rounded-2xl border border-border/60 bg-card p-4 transition-all hover:border-border hover:bg-card/80 md:p-5",
        focused && "ring-1 ring-primary/30",
        highlight === "bestseller" && "border-amber-400/35",
        selectedPlaces.length > 0 && "border-primary/30",
      )}
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-black text-foreground">{tier.name}</h4>
            {includesGeneralAccess ? <InclusionBadge /> : null}
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
          <span className="text-xl font-black text-foreground">
            {formatCurrency(unitPrice)}
          </span>
          {isSoldOut ? (
            <span className="flex items-center gap-1 text-xs font-bold text-destructive">
              <AlertCircle className="size-3" aria-hidden="true" />
              Agotado
            </span>
          ) : (
            <StockHint
              available={tier.available}
              capacity={tier.capacity}
              sold={tier.sold}
            />
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
        <div className="flex-shrink-0">
          {requiresMap ? (
            selectedPlaces.length === 0 ? (
              <button
                type="button"
                disabled={isPending || mapLoading || isSoldOut}
                onClick={onOpenSeatSelection}
                className={cn(
                  tapFeedbackClass,
                  "whitespace-nowrap rounded-full bg-primary/20 px-4 py-2 text-sm font-bold text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50",
                )}
              >
                {mapLoading ? "Cargando mapa…" : "Seleccionar lugares"}
              </button>
            ) : null
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
      {requiresMap ? (
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
    <Badge className="border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/70 dark:text-amber-200">
      <Sparkles className="size-3" aria-hidden="true" />
      Incluye acceso general
    </Badge>
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
    <div className="flex items-center gap-3 rounded-full bg-secondary/50 px-1 py-1">
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
      <span className="w-4 text-center text-sm font-bold tabular-nums">
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
