"use client"

import { Button } from "@/components/ui/button"
import { QuantityCounter } from "@/components/public/quantity-counter"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import { quantityForPublicTier } from "@/lib/checkout/ticket-day-groups"
import { generalTicketMaxQuantity } from "@/lib/checkout/general-ticket-quantity"
import { resolveStockScarcity } from "@/lib/checkout/stock-scarcity"
import {
  ticketHasSeatingSector,
  ticketUsesMapSelector,
} from "@/lib/checkout/public-ticket-view"
import {
  SOLD_OUT_BADGE_CLASS,
  SOLD_OUT_TICKET_CARD_CLASS,
  isTicketCardBlocked,
} from "@/lib/checkout/ticket-stock"
import { publicOfferPrice } from "@/lib/checkout/public-price"
import { formatTicketPrice } from "@/lib/format"
import { resolveTicketSaleState } from "@/lib/inventory/ticket-sale-window"
import { isLogicalGeneralSectorId } from "@/lib/seating/venue-map-pricing"
import { resolveTicketSectorName } from "@/lib/seating/storefront-selection"
import type { InteractiveVenueMap } from "@/types/venue-map"
import { cn, tapFeedbackClass } from "@/lib/utils"
import type { ScheduleDay } from "@/types/events"

function groupGeneralTiers(
  tiers: TicketSelectorTier[],
  venueMap?: InteractiveVenueMap | null,
) {
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
      label:
        key === "__ungrouped__"
          ? ""
          : resolveTicketSectorName({ seatingSectorId: key }, venueMap) ?? "",
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
  scheduleId = null,
  scheduleDays = [],
  onQuantityChange,
  onSelectSeat,
  selectedSeatMap = {},
  venueMap = null,
  hasInteractiveMap = false,
  sectorSummaries = [],
}: {
  tiers: TicketSelectorTier[]
  siblingTiers?: TicketSelectorTier[]
  quantities: Record<string, number>
  selectedCount: number
  maxTicketsPerUser?: number | null
  isPending: boolean
  scheduleDays?: ScheduleDay[]
  scheduleId?: string | null
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  onSelectSeat?: (tierId: string) => void
  selectedSeatMap?: Record<string, string>
  venueMap?: InteractiveVenueMap | null
  hasInteractiveMap?: boolean
  sectorSummaries?: Array<{
    sectorId: string
    sectorName: string
    tierId?: string | null
    available: number
    total?: number
  }>
}) {
  const listableTiers = tiers.filter((tier) => !ticketHasSeatingSector(tier))
  const pool = siblingTiers ?? listableTiers
  const groups = groupGeneralTiers(
    listableTiers,
    hasInteractiveMap ? venueMap : null,
  )
  const showGroupLabels =
    hasInteractiveMap &&
    groups.filter((group) => group.label.length > 0).length > 1

  if (listableTiers.length === 0) return null

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
            const quantity = quantityForPublicTier(quantities, tier, {
              selectedDateId: scheduleId,
              scheduleDays,
            })
            const dayQuantities = Object.fromEntries(
              pool.map((item) => [
                item.id,
                quantityForPublicTier(quantities, item, {
                  selectedDateId: scheduleId,
                  scheduleDays,
                }),
              ]),
            )
            const max = generalTicketMaxQuantity({
              tier,
              siblings: pool,
              quantities: dayQuantities,
              selectedCount,
              maxTicketsPerUser,
            })
            const saleState = resolveTicketSaleState({
              available: tier.available,
              capacity: tier.capacity,
              sold: tier.sold,
              saleStartsAt: tier.saleStartsAt,
              saleEndsAt: tier.saleEndsAt,
            })
            const windowClosed = saleState.kind !== "active"
            const summary = sectorSummaries.find(
              (row) =>
                row.tierId === tier.id ||
                row.sectorId === (tier.seatingSectorId ?? "") ||
                row.sectorName.trim().toLowerCase() ===
                  tier.name.trim().toLowerCase(),
            )
            const sectorUnconfigured =
              hasInteractiveMap &&
              (tier.layoutType === "numbered_seat" ||
                tier.layoutType === "table_combo") &&
              Boolean(tier.seatingSectorId) &&
              summary != null &&
              (summary.total ?? 0) <= 0
            const soldOut =
              saleState.kind === "sold_out" ||
              max <= 0 ||
              isTicketCardBlocked(tier) ||
              sectorUnconfigured
            const inactive = soldOut || windowClosed
            const showStock = tier.showRemainingStock !== false
            const scarcity = resolveStockScarcity(
              summary?.available ?? tier.stockAvailable ?? tier.available,
              summary?.total ?? tier.capacity,
              tier.sold,
            )
            const needsPlacePicker =
              hasInteractiveMap && ticketUsesMapSelector(tier)
            const selectedSeatName = selectedSeatMap[tier.id]
            const offerPrice = publicOfferPrice(tier)

            return (
              <div
                key={tier.id}
                className={cn(
                  "flex min-h-[80px] w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-card p-4",
                  soldOut && SOLD_OUT_TICKET_CARD_CLASS,
                  inactive && !soldOut && "cursor-not-allowed opacity-60",
                  (quantity > 0 || Boolean(selectedSeatName)) &&
                    !inactive &&
                    "border-emerald-500/40",
                )}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h4
                    className={cn(
                      "truncate text-base leading-tight font-extrabold text-foreground",
                      soldOut && "text-muted-foreground line-through",
                    )}
                  >
                    {tier.name}
                    {selectedSeatName ? (
                      <span className="ml-2 text-xs font-semibold text-emerald-400">
                        {selectedSeatName}
                      </span>
                    ) : null}
                  </h4>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "shrink-0 whitespace-nowrap text-base font-black tabular-nums text-foreground",
                        soldOut && "text-muted-foreground line-through",
                      )}
                    >
                      {offerPrice === 0
                        ? "Gratis"
                        : formatTicketPrice(offerPrice)}
                    </span>
                    {soldOut ? (
                      <span className={SOLD_OUT_BADGE_CLASS}>Agotado</span>
                    ) : showStock && scarcity.kind === "low" ? (
                      <span className="shrink-0 text-[10px] font-bold text-amber-400">
                        Pocas disponibles
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-end pl-2">
                  {inactive ? (
                    <Button
                      type="button"
                      disabled
                      className="h-9 px-3 text-sm font-semibold text-muted-foreground"
                    >
                      {saleState.kind === "upcoming"
                        ? "Próximamente"
                        : saleState.kind === "ended"
                          ? "Finalizado"
                          : "Agotado"}
                    </Button>
                  ) : needsPlacePicker ? (
                    <Button
                      type="button"
                      variant={selectedSeatName ? "outline" : "default"}
                      disabled={isPending}
                      onClick={() => onSelectSeat?.(tier.id)}
                      className={cn(
                        tapFeedbackClass,
                        "h-10 whitespace-nowrap px-4 text-xs font-extrabold",
                        selectedSeatName
                          ? "border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                          : "bg-emerald-600 text-white hover:bg-emerald-700",
                      )}
                    >
                      {selectedSeatName ? "Modificar lugares" : "Elegir en plano"}
                    </Button>
                  ) : (
                    <QuantityCounter
                      quantity={quantity}
                      max={max}
                      disabled={isPending || inactive}
                      onDecrease={() =>
                        onQuantityChange(tier.id, quantity - 1, max)
                      }
                      onIncrease={() =>
                        onQuantityChange(tier.id, quantity + 1, max)
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
      ))}
    </div>
  )
}