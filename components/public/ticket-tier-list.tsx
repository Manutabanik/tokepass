"use client"

import { Minus, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import { generalTicketMaxQuantity } from "@/lib/checkout/general-ticket-quantity"
import { resolveStockScarcity } from "@/lib/checkout/stock-scarcity"
import { resolveTicketHighlightBadge } from "@/lib/checkout/ticket-picker"
import { formatTicketPrice } from "@/lib/format"
import { isLogicalGeneralSectorId } from "@/lib/seating/venue-map-pricing"
import { cn, tapFeedbackClass } from "@/lib/utils"

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

            return (
              <div
                key={tier.id}
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-border dark:bg-card",
                  soldOut && "cursor-not-allowed opacity-60",
                  (quantity > 0 || Boolean(selectedSeatName)) &&
                    !soldOut &&
                    "border-emerald-300 dark:border-emerald-500/40",
                )}
              >
                <div className="flex min-w-0 flex-col gap-1.5">
                  <h4 className="truncate text-lg font-bold text-gray-900 dark:text-foreground">
                    {tier.name}
                  </h4>
                  {selectedSeatName ? (
                    <span className="w-fit rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100">
                      {selectedSeatName}
                    </span>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {highlight === "bestseller" ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold uppercase text-amber-900 dark:bg-amber-500/20 dark:text-amber-100">
                        Más vendida
                      </span>
                    ) : null}
                    {custom ? (
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold uppercase text-gray-800 dark:bg-muted dark:text-foreground">
                        {custom}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-extrabold tabular-nums text-gray-900 dark:text-foreground">
                      {formatTicketPrice(tier.price)}
                    </p>
                    {soldOut ? (
                      <span className="text-xs font-semibold text-destructive">
                        Agotado
                      </span>
                    ) : showStock && scarcity.kind === "low" ? (
                      <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
                        Pocas disponibles
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  {isMappedTier ? (
                    <Button
                      type="button"
                      variant={selectedSeatName ? "outline" : "default"}
                      disabled={soldOut || isPending}
                      onClick={() => onSelectSeat?.(tier.id)}
                      className={cn(
                        tapFeedbackClass,
                        "ml-auto h-9 px-4 font-semibold",
                        selectedSeatName
                          ? "border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                          : "bg-emerald-600 text-white hover:bg-emerald-700",
                      )}
                    >
                      {selectedSeatName ? "Modificar lugares" : "Elegir lugar"}
                    </Button>
                  ) : (
                    <div className="ml-auto flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-border/50 dark:bg-secondary/80">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={minusDisabled}
                        onClick={() =>
                          onQuantityChange(tier.id, quantity - 1, max)
                        }
                        aria-label={`Quitar ${tier.name}`}
                        className={cn(
                          tapFeedbackClass,
                          "flex size-7 items-center justify-center rounded-md hover:bg-background",
                        )}
                      >
                        <Minus className="size-3" aria-hidden="true" />
                      </Button>
                      <span className="w-6 text-center text-xs font-bold tabular-nums text-gray-900 dark:text-foreground">
                        {quantity}
                      </span>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={plusDisabled}
                        onClick={() =>
                          onQuantityChange(tier.id, quantity + 1, max)
                        }
                        aria-label={`Agregar ${tier.name}`}
                        className={cn(
                          tapFeedbackClass,
                          "flex size-7 items-center justify-center rounded-md hover:bg-background",
                        )}
                      >
                        <Plus className="size-3" aria-hidden="true" />
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