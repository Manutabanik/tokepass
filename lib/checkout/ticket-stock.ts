export type TicketStockInput = {
  available?: number | null
  stock_available?: number | null
  stockAvailable?: number | null
  capacity?: number | null
  sold?: number | null
}

function asUnits(value: unknown): number | null {
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed)) return null
  return parsed
}

/** Cupo seleccionable: nunca anuncia más que `available` ni que `capacity - sold`. */
export function selectableTicketStock(tier: TicketStockInput): number {
  const available = asUnits(
    tier.available ?? tier.stock_available ?? tier.stockAvailable,
  )
  const fromLive = available == null ? 0 : Math.max(0, available)
  const capacity = asUnits(tier.capacity)
  const sold = asUnits(tier.sold)
  if (capacity != null && capacity >= 0 && sold != null && sold >= 0) {
    return Math.min(fromLive, Math.max(0, capacity - sold))
  }
  return fromLive
}

export function isTicketSoldOut(tier: TicketStockInput): boolean {
  return selectableTicketStock(tier) <= 0
}

export function isTicketCardBlocked(
  tier: TicketStockInput & { isActive?: boolean | null },
): boolean {
  if (tier.isActive === false) return true
  return isTicketSoldOut(tier)
}

export const SOLD_OUT_TICKET_CARD_CLASS =
  "cursor-not-allowed opacity-50 pointer-events-none grayscale"

export const SOLD_OUT_BADGE_CLASS =
  "shrink-0 rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
