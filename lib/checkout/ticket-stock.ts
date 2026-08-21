export type TicketStockInput = {
  available?: number | null
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
  const available = asUnits(tier.available)
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
