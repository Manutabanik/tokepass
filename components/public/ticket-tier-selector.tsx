"use client"

import {
  Accessibility,
  CalendarDays,
  Flame,
  Map,
  Ticket,
} from "lucide-react"
import { useMemo, useState } from "react"

import { QuantityCounter } from "@/components/public/quantity-counter"
import { quantityForPublicTier } from "@/lib/checkout/ticket-day-groups"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isFullPassDayId } from "@/lib/event-schedule"
import { formatCurrency, formatEventDay, formatTicketPrice } from "@/lib/format"
import { generalTicketMaxQuantity } from "@/lib/checkout/general-ticket-quantity"
import { ticketHasSeatingSector } from "@/lib/checkout/public-ticket-view"
import { resolveStockScarcity } from "@/lib/checkout/stock-scarcity"
import {
  SOLD_OUT_BADGE_CLASS,
  SOLD_OUT_TICKET_CARD_CLASS,
  isTicketCardBlocked,
} from "@/lib/checkout/ticket-stock"
import {
  resolveTicketSaleState,
  ticketSaleWindowLabel,
} from "@/lib/inventory/ticket-sale-window"
import type { TicketHighlightBadge } from "@/lib/checkout/ticket-picker"
import type { PublicTicketPhase } from "@/lib/inventory/active-phase"
import type { TicketCommerceType } from "@/lib/events/ticket-commerce-type"
import type { InventoryTierType } from "@/lib/inventory/unified-inventory"
import {
  discountPercent,
  inferTicketTierCategory,
  type TicketTierCategory,
} from "@/lib/ticket-tier-category"
import { cartMapUnitIdsForSchedule } from "@/lib/checkout/cart-item-identity"
import { useCheckoutStore } from "@/lib/stores/checkout-store"
import { cn, tapFeedbackClass } from "@/lib/utils"
import type { ScheduleDay } from "@/types/events"

export type TicketSelectorTier = {
  id: string
  name: string
  price: number
  available: number
  isActive?: boolean
  hasMap?: boolean
  isMapped?: boolean
  status?: string
  stockAvailable?: number
  capacity?: number
  bonusReward?: string | null
  dayId?: string | null
  dateId?: string | null
  validDayIds?: string[]
  isFullPass?: boolean
  layoutType: "general" | "table_combo" | "numbered_seat"
  seatingSectorId?: string | null
  capacityPerUnit: number
  minPurchaseLimit?: number | null
  maxPurchaseLimit?: number | null
  category?: TicketTierCategory | string | null
  ticketType?: TicketCommerceType | string | null
  listPrice?: number | null
  comboItems?: Array<{ name: string; quantity: number }>
  tierType?: InventoryTierType | string | null
  bundleType?: string | null
  description?: string | null
  highlightBadge?: TicketHighlightBadge | null
  sold?: number
  saleStartsAt?: string | null
  saleEndsAt?: string | null
  phases?: PublicTicketPhase[]
  showRemainingStock?: boolean | null
  showAccessCount?: boolean | null
  badgeText?: string | null
  includesAccess?: boolean | null
}

type DayFilter = "all" | string

type Props = {
  tiers: TicketSelectorTier[]
  quantities: Record<string, number>
  scheduleDays: ScheduleDay[]
  isPending: boolean
  hasSeatingFlow: boolean
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  onOpenSeatFlow: () => void
  maxTicketsPerUser?: number | null
}

export function TicketTierSelector({
  tiers,
  quantities,
  scheduleDays = [],
  isPending,
  hasSeatingFlow,
  onQuantityChange,
  onOpenSeatFlow,
  maxTicketsPerUser = null,
}: Props) {
  const days = scheduleDays ?? []
  const multiDayEvent = days.length > 1
  const grouped = useMemo(() => {
    const buckets: Record<TicketTierCategory, TicketSelectorTier[]> = {
      standard: [],
      bundle: [],
      special: [],
    }
    for (const tier of tiers) {
      const category = inferTicketTierCategory({
        category: tier.category,
        name: tier.name,
        dayId: tier.dayId,
        layoutType: tier.layoutType,
        hasComboItems: (tier.comboItems?.length ?? 0) > 0,
        isMultiDay: multiDayEvent,
        tierType: tier.tierType,
        bundleType: tier.bundleType,
        isFullPass: tier.isFullPass,
      })
      buckets[category].push(tier)
    }
    return buckets
  }, [multiDayEvent, tiers])

  const availableTabs = (
    [
      grouped.standard.length > 0 ? "standard" : null,
      grouped.bundle.length > 0 ? "bundle" : null,
      grouped.special.length > 0 ? "special" : null,
    ] as Array<TicketTierCategory | null>
  ).filter((tab): tab is TicketTierCategory => Boolean(tab))

  const [tab, setTab] = useState<TicketTierCategory>(
    availableTabs[0] ?? "standard",
  )
  const [dayFilter, setDayFilter] = useState<DayFilter>("all")

  if (availableTabs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No hay entradas para mostrar.
      </div>
    )
  }

  const activeTab = availableTabs.includes(tab) ? tab : availableTabs[0]!
  const showCategoryTabs = availableTabs.length > 1

  const standardList = (
    <>
      {multiDayEvent ? (
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/30 p-1">
          <DayChip
            active={dayFilter === "all"}
            label="Todas"
            onClick={() => setDayFilter("all")}
          />
          {days
            .filter((day) =>
              grouped.standard.some((tier) => tier.dayId === day.id),
            )
            .map((day) => (
            <DayChip
              key={day.id}
              active={dayFilter === day.id}
              label={day.title || formatEventDay(day.start_time)}
              onClick={() => setDayFilter(day.id)}
            />
          ))}
        </div>
      ) : null}
      <TierList
        tiers={grouped.standard.filter((tier) => {
          if (!multiDayEvent || dayFilter === "all") return true
          return tier.dayId === dayFilter
        })}
        quantities={quantities}
        scheduleId={dayFilter === "all" ? null : dayFilter}
        scheduleDays={days}
        isPending={isPending}
        hasSeatingFlow={hasSeatingFlow}
        variant="standard"
        onQuantityChange={onQuantityChange}
        onOpenSeatFlow={onOpenSeatFlow}
        maxTicketsPerUser={maxTicketsPerUser}
      />
    </>
  )

  const bundleList = (
    <TierList
      tiers={grouped.bundle}
      quantities={quantities}
      scheduleDays={days}
      isPending={isPending}
      hasSeatingFlow={hasSeatingFlow}
      variant="bundle"
      onQuantityChange={onQuantityChange}
      onOpenSeatFlow={onOpenSeatFlow}
      maxTicketsPerUser={maxTicketsPerUser}
    />
  )

  const specialList = (
    <>
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        En puerta hay que presentar carnet, CUD u otro comprobante válido.
        TokePass no valida el beneficio online.
      </p>
      <TierList
        tiers={grouped.special}
        quantities={quantities}
        scheduleDays={days}
        isPending={isPending}
        hasSeatingFlow={hasSeatingFlow}
        variant="special"
        onQuantityChange={onQuantityChange}
        onOpenSeatFlow={onOpenSeatFlow}
        maxTicketsPerUser={maxTicketsPerUser}
      />
    </>
  )

  if (!showCategoryTabs) {
    return (
      <div className="mt-5 space-y-3">
        {activeTab === "standard" ? standardList : null}
        {activeTab === "bundle" ? bundleList : null}
        {activeTab === "special" ? specialList : null}
      </div>
    )
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setTab(value as TicketTierCategory)}
      className="mt-5 gap-3"
    >
      <TabsList className="flex h-auto w-full rounded-lg bg-muted p-1">
        {availableTabs.includes("standard") ? (
          <TabsTrigger
            value="standard"
            className="min-h-10 flex-1 gap-1.5 rounded-md data-active:bg-background data-active:text-foreground"
          >
            <Ticket className="size-3.5" aria-hidden />
            Individuales
          </TabsTrigger>
        ) : null}
        {availableTabs.includes("bundle") ? (
          <TabsTrigger
            value="bundle"
            className="min-h-10 flex-1 gap-1.5 rounded-md data-active:bg-background data-active:text-foreground"
          >
            <Flame className="size-3.5" aria-hidden />
            Combos
          </TabsTrigger>
        ) : null}
        {availableTabs.includes("special") ? (
          <TabsTrigger
            value="special"
            className="min-h-10 flex-1 gap-1.5 rounded-md data-active:bg-background data-active:text-foreground"
          >
            <Accessibility className="size-3.5" aria-hidden />
            Especiales
          </TabsTrigger>
        ) : null}
      </TabsList>

      <TabsContent value="standard" className="space-y-3">
        {standardList}
      </TabsContent>
      <TabsContent value="bundle" className="space-y-3">
        {bundleList}
      </TabsContent>
      <TabsContent value="special" className="space-y-3">
        {specialList}
      </TabsContent>
    </Tabs>
  )
}

function DayChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm",
        active
          ? "bg-card font-medium text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <CalendarDays className="size-3.5" aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  )
}

function TierList({
  tiers,
  quantities,
  scheduleId = null,
  scheduleDays,
  isPending,
  hasSeatingFlow,
  onQuantityChange,
  onOpenSeatFlow,
  maxTicketsPerUser = null,
}: {
  tiers: TicketSelectorTier[]
  quantities: Record<string, number>
  scheduleId?: string | null
  scheduleDays: ScheduleDay[]
  isPending: boolean
  hasSeatingFlow: boolean
  variant: TicketTierCategory
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  onOpenSeatFlow: () => void
  maxTicketsPerUser?: number | null
}) {
  const listableTiers = tiers.filter((tier) => !ticketHasSeatingSector(tier))
  const cartLines = useCheckoutStore((state) => state.lines)
  const hasMapPlaces = cartMapUnitIdsForSchedule(cartLines, scheduleId).length > 0

  if (listableTiers.length === 0 && !hasSeatingFlow) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No hay entradas en esta categoría.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {hasSeatingFlow ? (
        <Button
          type="button"
          disabled={isPending}
          onClick={onOpenSeatFlow}
          className={cn(
            tapFeedbackClass,
            "h-14 w-full gap-3 rounded-2xl text-lg font-bold",
          )}
        >
          <Map className="size-5 shrink-0" aria-hidden="true" />
          {hasMapPlaces
            ? "Modificar lugares en el mapa"
            : "Elegir lugares en el mapa"}
        </Button>
      ) : null}
      {listableTiers.map((tier) => {
        const quantity = quantityForPublicTier(quantities, tier, {
          selectedDateId: scheduleId,
          scheduleDays,
        })
        const dayQuantities = Object.fromEntries(
          tiers.map((item) => [
            item.id,
            quantityForPublicTier(quantities, item, {
              selectedDateId: scheduleId,
              scheduleDays,
            }),
          ]),
        )
        const maxSelectable = generalTicketMaxQuantity({
          tier,
          siblings: tiers,
          quantities: dayQuantities,
          selectedCount: Object.values(quantities).reduce(
            (sum, value) => sum + Math.max(0, value),
            0,
          ),
          maxTicketsPerUser,
        })
        const saleState = resolveTicketSaleState({
          available: tier.available,
          capacity: tier.capacity,
          sold: tier.sold,
          saleStartsAt: tier.saleStartsAt,
          saleEndsAt: tier.saleEndsAt,
        })
        const saleLabel = ticketSaleWindowLabel(saleState)
        const soldOut =
          saleState.kind === "sold_out" ||
          maxSelectable <= 0 ||
          isTicketCardBlocked(tier)
        const inactive = soldOut || saleState.kind !== "active"
        const scarcity = resolveStockScarcity(
          tier.stockAvailable ?? tier.available,
          tier.capacity,
          tier.sold,
        )
        const lowStock = !inactive && scarcity.kind === "low"
        const day = scheduleDays.find((item) => item.id === tier.dayId)
        const dayLabel = isFullPassDayId(tier.dayId)
          ? scheduleDays.length > 1
            ? "Abono completo"
            : null
          : day
            ? day.title || formatEventDay(day.start_time)
            : null
        const listPrice = tier.listPrice ?? 0
        const saveAmt = listPrice > tier.price ? listPrice - tier.price : 0
        const savePct = discountPercent(listPrice, tier.price)

        const comboLine = tier.comboItems?.length
          ? tier.comboItems
              .map((item) => `${item.quantity}× ${item.name}`)
              .join(" · ")
          : null

        return (
          <div
            key={tier.id}
            className={cn(
              "flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-card/60 px-5 py-3.5 transition-all hover:border-white/20",
              quantity > 0 && !inactive && "border-emerald-500/40",
              soldOut && SOLD_OUT_TICKET_CARD_CLASS,
              inactive && !soldOut && "opacity-70",
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p
                className={cn(
                  "truncate text-base font-bold text-foreground",
                  soldOut && "text-muted-foreground line-through",
                  inactive && !soldOut && "text-muted-foreground",
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
                  {formatTicketPrice(tier.price)}
                </span>
                {saveAmt > 0 ? (
                  <span className="text-xs font-medium text-muted-foreground line-through">
                    {formatCurrency(listPrice)}
                  </span>
                ) : null}
                {saveAmt > 0 ? (
                  <span className="text-xs font-semibold text-emerald-400">
                    Ahorrás {formatCurrency(saveAmt)}
                    {savePct > 0 ? ` (${savePct}%)` : ""}
                  </span>
                ) : null}
                {dayLabel ? (
                  <span className="text-xs font-semibold text-emerald-400">
                    {dayLabel}
                  </span>
                ) : null}
                {comboLine ? (
                  <span className="truncate text-xs font-medium text-muted-foreground">
                    {comboLine}
                  </span>
                ) : soldOut ? (
                  <span className={SOLD_OUT_BADGE_CLASS}>Agotado</span>
                ) : inactive && saleLabel ? (
                  <span className="text-xs font-semibold text-muted-foreground">
                    {saleLabel}
                  </span>
                ) : lowStock ? (
                  <span className="text-xs font-semibold text-amber-500">
                    Pocas disponibles
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center">
              {inactive ? (
                <Button
                  type="button"
                  disabled
                  className="h-9 rounded-xl px-3 text-sm font-semibold text-muted-foreground"
                >
                  {saleState.kind === "upcoming"
                    ? "Próximamente"
                    : saleState.kind === "ended"
                      ? "Finalizado"
                      : "Agotado"}
                </Button>
              ) : (
                <QuantityCounter
                  quantity={quantity}
                  max={maxSelectable}
                  disabled={isPending}
                  onDecrease={() =>
                    onQuantityChange(tier.id, quantity - 1, maxSelectable)
                  }
                  onIncrease={() =>
                    onQuantityChange(tier.id, quantity + 1, maxSelectable)
                  }
                  decreaseLabel={`Quitar ${tier.name}`}
                  increaseLabel={`Agregar ${tier.name}`}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
