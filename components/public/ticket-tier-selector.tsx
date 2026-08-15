"use client"

import {
  Accessibility,
  Armchair,
  CalendarDays,
  Flame,
  Minus,
  Plus,
  Ticket,
} from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isFullPassDayId } from "@/lib/event-schedule"
import { formatCurrency, formatEventDay } from "@/lib/format"
import { MAX_TICKETS_PER_PURCHASE } from "@/lib/checkout-limits"
import type { TicketHighlightBadge } from "@/lib/checkout/ticket-picker"
import type { PublicTicketPhase } from "@/lib/inventory/active-phase"
import type { InventoryTierType } from "@/lib/inventory/unified-inventory"
import {
  discountPercent,
  inferTicketTierCategory,
  type TicketTierCategory,
} from "@/lib/ticket-tier-category"
import { cn } from "@/lib/utils"
import type { ScheduleDay } from "@/types/events"

export type TicketSelectorTier = {
  id: string
  name: string
  price: number
  available: number
  capacity?: number
  bonusReward?: string | null
  dayId?: string | null
  layoutType: "general" | "table_combo" | "numbered_seat"
  seatingSectorId?: string | null
  capacityPerUnit: number
  category?: TicketTierCategory | string | null
  listPrice?: number | null
  comboItems?: Array<{ name: string; quantity: number }>
  tierType?: InventoryTierType | string | null
  bundleType?: string | null
  description?: string | null
  highlightBadge?: TicketHighlightBadge | null
  sold?: number
  phases?: PublicTicketPhase[]
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
}

export function TicketTierSelector({
  tiers,
  quantities,
  scheduleDays = [],
  isPending,
  hasSeatingFlow,
  onQuantityChange,
  onOpenSeatFlow,
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
          {days.map((day) => (
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
        scheduleDays={days}
        isPending={isPending}
        hasSeatingFlow={hasSeatingFlow}
        variant="standard"
        onQuantityChange={onQuantityChange}
        onOpenSeatFlow={onOpenSeatFlow}
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
    />
  )

  const specialList = (
    <>
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        En puerta hay que presentar carnet, CUD u otro comprobante válido.
        Tokepass no valida el beneficio online.
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
  scheduleDays,
  isPending,
  hasSeatingFlow,
  variant,
  onQuantityChange,
  onOpenSeatFlow,
}: {
  tiers: TicketSelectorTier[]
  quantities: Record<string, number>
  scheduleDays: ScheduleDay[]
  isPending: boolean
  hasSeatingFlow: boolean
  variant: TicketTierCategory
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  onOpenSeatFlow: () => void
}) {
  if (tiers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No hay entradas en esta categoría.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {tiers.map((tier) => {
        const quantity = quantities[tier.id] ?? 0
        const maxSelectable = Math.min(MAX_TICKETS_PER_PURCHASE, tier.available)
        const soldOut = tier.available <= 0
        const lowStock = !soldOut && tier.available <= 8
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

        return (
          <div
            key={tier.id}
            className={cn(
              "rounded-2xl border bg-card p-4 shadow-sm",
              quantity > 0
                ? "border-emerald-300 dark:border-emerald-700"
                : "border-border",
              soldOut && "opacity-70",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={cn(
                    "font-semibold text-foreground",
                    soldOut && "text-muted-foreground line-through",
                  )}
                >
                  {tier.name}
                </p>
                {dayLabel ? (
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    {dayLabel}
                  </p>
                ) : null}
                {tier.comboItems && tier.comboItems.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {tier.comboItems.map((item) => (
                      <li key={item.name}>
                        {item.quantity}× {item.name}
                      </li>
                    ))}
                  </ul>
                ) : variant === "standard" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Acceso digital con Living QR Tokepass
                  </p>
                ) : null}
                {saveAmt > 0 ? (
                  <p className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    Ahorrás {formatCurrency(saveAmt)}
                    {savePct > 0 ? ` (${savePct}%)` : ""}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {soldOut ? "Sin stock" : `${tier.available} disponibles`}
                  {lowStock && !soldOut ? " · últimas" : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {saveAmt > 0 ? (
                  <p className="text-xs text-muted-foreground line-through">
                    {formatCurrency(listPrice)}
                  </p>
                ) : null}
                <p className="text-2xl font-black tabular-nums text-foreground">
                  {tier.price === 0 ? "Gratis" : formatCurrency(tier.price)}
                </p>
              </div>
            </div>

            {tier.layoutType === "general" ? (
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-muted-foreground">
                  Cantidad
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={soldOut || quantity === 0 || isPending}
                    onClick={() =>
                      onQuantityChange(tier.id, quantity - 1, maxSelectable)
                    }
                    aria-label={`Quitar ${tier.name}`}
                    className="inline-flex size-12 items-center justify-center rounded-2xl border border-border bg-muted text-foreground hover:bg-muted/80 disabled:opacity-40"
                  >
                    <Minus className="size-5" aria-hidden />
                  </button>
                  <span className="min-w-10 text-center text-2xl font-black tabular-nums">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    disabled={soldOut || quantity >= maxSelectable || isPending}
                    onClick={() =>
                      onQuantityChange(tier.id, quantity + 1, maxSelectable)
                    }
                    aria-label={`Agregar ${tier.name}`}
                    className="inline-flex size-12 items-center justify-center rounded-2xl border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 dark:border-emerald-400 dark:bg-emerald-400 dark:text-zinc-950"
                  >
                    <Plus className="size-5" aria-hidden />
                  </button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                disabled={soldOut || !hasSeatingFlow || isPending}
                onClick={onOpenSeatFlow}
                className="mt-4 min-h-12 h-12 w-full rounded-xl"
              >
                <Armchair className="size-4" aria-hidden />
                Elegir {tier.layoutType === "table_combo" ? "mesa" : "asiento"}
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
