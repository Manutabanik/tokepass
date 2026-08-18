"use client"

import { Minus, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import { generalTicketMaxQuantity } from "@/lib/checkout/general-ticket-quantity"
import { resolveStockScarcity } from "@/lib/checkout/stock-scarcity"
import { resolveTicketHighlightBadge } from "@/lib/checkout/ticket-picker"
import { formatCurrency } from "@/lib/format"
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
    <div className="flex w-full flex-col gap-2">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-2">
          {showGroupLabels && group.label ? (
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
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
                  "flex items-center justify-between gap-3 rounded-xl border border-border bg-card/80 px-3.5 py-3 transition-all",
                  soldOut
                    ? "cursor-not-allowed border-border bg-muted/40 opacity-60"
                    : "hover:border-primary/40 hover:bg-card",
                  (quantity > 0 || Boolean(selectedSeatName)) && !soldOut && "border-primary/40 bg-card",
                )}
              >
                {/* Lado Izquierdo: Información del ticket */}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="truncate text-sm font-bold text-foreground md:text-base">
                      {tier.name}
                    </h4>

                    {/* Indicador de asiento seleccionado en mapa */}
                    {selectedSeatName ? (
                      <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                        Seleccionado: {selectedSeatName}
                      </span>
                    ) : null}

                    {highlight === "bestseller" ? (
                      <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                        Más vendida
                      </span>
                    ) : null}

                    {custom ? (
                      <span className="rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {custom}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <p className="text-base font-extrabold tabular-nums text-foreground md:text-lg">
                      {formatCurrency(tier.price)}
                    </p>
                    {soldOut ? (
                      <span className="text-xs font-semibold text-destructive">
                        • Agotado
                      </span>
                    ) : showStock && scarcity.kind === "low" ? (
                      <span className="text-xs font-medium text-amber-500">
                        • Pocas disponibles
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Lado Derecho: Controles + / - o Botón de Selección de Mapa */}
                <div className="flex shrink-0 items-center">
                  {isMappedTier ? (
                    <Button
                      type="button"
                      disabled={soldOut || isPending}
                      onClick={() => onSelectSeat?.(tier.id)}
                      className={cn(
                        tapFeedbackClass,
                        "h-8 px-3.5 text-xs font-semibold rounded-lg transition-colors",
                        selectedSeatName
                          ? "bg-secondary text-foreground border border-border hover:bg-secondary/80"
                          : "bg-emerald-500 text-neutral-950 hover:bg-emerald-400",
                      )}
                    >
                      {selectedSeatName ? "Cambiar lugar" : "Elegir lugar"}
                    </Button>
                  ) : (
                    <div className="flex items-center rounded-lg bg-secondary/80 p-0.5 border border-border/50">
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
                      <span className="w-6 text-center text-xs font-bold tabular-nums text-foreground">
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