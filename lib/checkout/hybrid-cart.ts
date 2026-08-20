import { decidePhaseCart, type PublicTicketPhase } from "@/lib/inventory/active-phase"
import { centsToMoney, moneyAmountsEqual, moneyToCents } from "@/lib/money/cents"
import type { CheckoutCartItem } from "@/lib/validations/checkout"

export function isMappedCheckoutItem(item: CheckoutCartItem): boolean {
  if (item.type === "mapped") return true
  return Boolean(
    item.seatingUnitId ||
      item.seatId ||
      item.seat_id ||
      item.elementId ||
      item.element_id ||
      (item.seatingIds?.length ?? 0) > 0,
  )
}

export function checkoutItemTierId(item: CheckoutCartItem): string {
  return item.ticketTierId || item.ticket_tier_id || item.tierId
}

export function checkoutItemSeatId(item: CheckoutCartItem): string | null {
  return (
    item.seatingUnitId ||
    item.seatId ||
    item.seat_id ||
    item.seatingIds?.[0] ||
    null
  )
}

export function checkoutItemElementId(item: CheckoutCartItem): string | null {
  return item.elementId || item.element_id || null
}

export function toReserveRpcItem(
  item: CheckoutCartItem,
  input: {
    sectorKey?: string | null
    phaseId?: string | null
  } = {},
) {
  const mapped = isMappedCheckoutItem(item)
  return {
    type: mapped ? "mapped" : "general",
    ticket_tier_id: checkoutItemTierId(item),
    tier_id: checkoutItemTierId(item),
    quantity: mapped ? 1 : item.quantity,
    sector_key: item.sectorKey ?? input.sectorKey ?? null,
    table_number: item.tableNumber ?? null,
    zone_id: item.zoneId ?? null,
    seating_unit_id: checkoutItemSeatId(item),
    seat_id: checkoutItemSeatId(item),
    element_id: checkoutItemElementId(item),
    phase_id: input.phaseId ?? null,
  }
}

export function quoteHybridCartTotal(input: {
  items: CheckoutCartItem[]
  unitPriceByTier: Map<string, number>
  phasesByTier?: Map<string, PublicTicketPhase[]>
}): { ok: true; total: number } | { ok: false; error: string } {
  let totalCents = 0
  for (const item of input.items) {
    const tierId = checkoutItemTierId(item)
    const phases = input.phasesByTier?.get(tierId) ?? []
    const decision = decidePhaseCart(phases, item.quantity)
    const phasePrice =
      decision.kind === "ok" ? Number(decision.phase.price) : null
    const unit = phasePrice ?? input.unitPriceByTier.get(tierId)
    if (unit == null || !Number.isFinite(unit) || unit < 0) {
      return { ok: false, error: "No se pudo cotizar el precio vigente." }
    }
    const quantity = isMappedCheckoutItem(item) ? 1 : item.quantity
    totalCents += moneyToCents(unit) * quantity
  }
  return { ok: true, total: centsToMoney(totalCents) }
}

export function amountsMatch(left: number, right: number): boolean {
  return moneyAmountsEqual(left, right)
}
