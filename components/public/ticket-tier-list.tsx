"use client"

import { Minus, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import { generalTicketMaxQuantity } from "@/lib/checkout/general-ticket-quantity"
import { resolveStockScarcity } from "@/lib/checkout/stock-scarcity"
import { resolveTicketHighlightBadge } from "@/lib/checkout/ticket-picker"
import { ticketDayBadgeLabel } from "@/lib/checkout/ticket-day-groups"
import { formatTicketPrice } from "@/lib/format"
import { isLogicalGeneralSectorId } from "@/lib/seating/venue-map-pricing"
import { Badge } from "@/components/ui/badge"
import { cn, tapFeedbackClass } from "@/lib/utils"
import type { ScheduleDay } from "@/types/events"

function logicalSectorLabel(sectorId: string) {
  const slug = sectorId.replace(/^general:/, "").replace(/-/g, " ").trim()
  if (!slug) return "Entrada general"
  return slug.replace(/(^|\s)\S/g, (char) => char.toUpperCase())
}

function groupGeneralTiers(tiers: TicketSelectorTier[]) {
  const groups: Array<{
    key: string
    label: string
    tiers: TicketSelectorTier[]
  }> = []
  const index = new Map<string, number>()
  for (const tier of tiers) {
    const sectorId = tier.seatingSectorId?.trim() || ""
    const key = isLogicalGeneralSectorId(sectorId) ? sectorId : "__ungrouped__"
    const existing = index.get(key)
    if (existing != null) {
      groups[existing]!.tiers.push(tier)
      continue
    }
    index.set(key, groups.length)
    groups.push({
      key,
      label: key === "__ungrouped__" ? "" : logicalSectorLabel(key),
      tiers: [tier],
    })
  }
  return groups
}

export function TicketTierList({
  tiers,
  siblingTiers,
  quantities,
  selectedCount,
  maxTicketsPerUser = null,
  isPending,
  scheduleDays = [],
  onQuantityChange,
  onSelectSeat,
  selectedSeatMap = {},
}: {
  tiers: TicketSelectorTier[]
  siblingTiers?: TicketSelectorTier[]
  quantities: Record<string, number>
  selectedCount: number
  maxTicketsPerUser?: number | null
  isPending: boolean
  scheduleDays?: ScheduleDay[]
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  onSelectSeat?: (tierId: string) => void
  selectedSeatMap?: Record<string, string>
}) {
  const pool = siblingTiers ?? tiers
  const groups = groupGeneralTiers(tiers)
  const showGroupLabels =
    groups.filter((group) => group.label.length > 0).length > 1

  if (tiers.length === 0) return null

  return (
    <div className="flex w-full flex-col gap-3">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-3">
          {showGroupLabels && group.label ? (
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-muted-foreground">
              {group.label}
            </h4>
          ) : null}
          {group.tiers.map((tier) => {
            const quantity = quantities[tier.id] ?? 0
            const max = generalTicketMaxQuantity({
              tier,
              siblings: pool,
              quantities,
              selectedCount,
              maxTicketsPerUser,
            })
            const soldOut = tier.available <= 0 || max <= 0
            const plusDisabled = isPending || soldOut || quantity >= max
            const minusDisabled = isPending || soldOut || quantity <= 0
            const highlight = resolveTicketHighlightBadge(tier, pool)
            const custom = tier.badgeText?.trim() || ""
            const showStock = tier.showRemainingStock !== false
            const scarcity = resolveStockScarcity(
              tier.available,
              tier.capacity,
              tier.sold,
            )
            const isMappedTier = Boolean(tier.seatingSectorId && !isLogicalGeneralSectorId(tier.seatingSectorId))
            const selectedSeatName = selectedSeatMap[tier.id]
            const dateLabel = ticketDayBadgeLabel(tier, scheduleDays)

            return (
              <div
                key={tier.id}
                className={cn(
                  "flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-card/60 px-5 py-3.5 transition-all hover:border-white/20",
                  soldOut && "cursor-not-allowed opacity-60",
                  (quantity > 0 || Boolean(selectedSeatName)) &&
                    !soldOut &&
                    "border-emerald-500/40",
                )}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <h4 className="truncate text-base font-bold text-foreground">
                    {tier.name}
                    {selectedSeatName ? (
                      <span className="ml-2 text-xs font-semibold text-emerald-400">
                        {selectedSeatName}
                      </span>
                    ) : null}
                  </h4>
                  <div className="flex min-w-0 items-center gap-2 text-sm font-black text-foreground/90">
                    <span className="tabular-nums">
                      {formatTicketPrice(tier.price)}
                    </span>
                    {dateLabel ? (
                      <Badge
                        variant="outline"
                        className="h-5 border-emerald-500/50 px-1.5 text-[10px] font-semibold text-emerald-400"
                      >
                        {dateLabel}
                      </Badge>
                    ) : null}
                    {highlight === "bestseller" ? (
                      <span className="text-xs font-semibold text-amber-500">
                        Más vendida
                      </span>
                    ) : null}
                    {custom ? (
                      <span className="truncate text-xs font-semibold text-muted-foreground">
                        {custom}
                      </span>
                    ) : null}
                    {soldOut ? (
                      <span className="text-xs font-semibold text-destructive">
                        Agotado
                      </span>
                    ) : showStock && scarcity.kind === "low" ? (
                      <span className="text-xs font-semibold text-amber-500">
                        Pocas disponibles
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center">
                  {isMappedTier ? (
                    <Button
                      type="button"
                      variant={selectedSeatName ? "outline" : "default"}
                      disabled={soldOut || isPending}
                      onClick={() => onSelectSeat?.(tier.id)}
                      className={cn(
                        tapFeedbackClass,
                        "h-9 px-3 text-sm font-semibold",
                        selectedSeatName
                          ? "border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                          : "bg-emerald-600 text-white hover:bg-emerald-700",
                      )}
                    >
                      {selectedSeatName ? "Modificar" : "Elegir lugar"}
                    </Button>
                  ) : (
                    <div className="flex h-9 items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={minusDisabled}
                        onClick={() =>
                          onQuantityChange(tier.id, quantity - 1, max)
                        }
                        aria-label={`Quitar ${tier.name}`}
                        className={cn(
                          tapFeedbackClass,
                          "size-7 rounded-md hover:bg-white/5",
                        )}
                      >
                        <Minus className="size-3.5" aria-hidden="true" />
                      </Button>
                      <span className="min-w-5 text-center text-sm font-bold tabular-nums text-foreground">
                        {quantity}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={plusDisabled}
                        onClick={() =>
                          onQuantityChange(tier.id, quantity + 1, max)
                        }
                        aria-label={`Agregar ${tier.name}`}
                        className={cn(
                          tapFeedbackClass,
                          "size-7 rounded-md hover:bg-white/5",
                        )}
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}