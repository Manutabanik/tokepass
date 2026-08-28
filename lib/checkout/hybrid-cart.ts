import { CHECKOUT_PRICES_CHANGED_ERROR } from "@/lib/checkout/price-guard"
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

export function checkoutItemEventDateId(item: {
  eventDateId?: string | null
  event_date_id?: string | null
  dateId?: string | null
  scheduleId?: string | null
}): string | null {
  const dateId =
    item.eventDateId ||
    item.event_date_id ||
    item.dateId ||
    item.scheduleId ||
    null
  return dateId?.trim() || null
}

/** Zone hints that can change the charge. Numbered seats always price from the DB unit. */
export function trustedReserveZoneHints(input: {
  seatingUnitId?: string | null
  unitSectorId?: string | null
  clientSectorKey?: string | null
  clientTableNumber?: number | null
  clientZoneId?: string | null
  allowedSectorKeys?: ReadonlySet<string> | null
}): {
  sectorKey: string | null
  tableNumber: number | null
  zoneId: string | null
} {
  if (input.seatingUnitId?.trim()) {
    const sector = input.unitSectorId?.trim() || null
    return { sectorKey: sector, tableNumber: null, zoneId: null }
  }
  const sector = input.clientSectorKey?.trim() || null
  const allowed = input.allowedSectorKeys
  if (
    sector &&
    allowed &&
    allowed.size > 0 &&
    !allowed.has(sector)
  ) {
    return { sectorKey: null, tableNumber: null, zoneId: null }
  }
  return {
    sectorKey: sector,
    tableNumber: sector ? (input.clientTableNumber ?? null) : null,
    zoneId: sector ? (input.clientZoneId?.trim() || null) : null,
  }
}

export function toReserveRpcItem(
  item: CheckoutCartItem,
  input: {
    sectorKey?: string | null
    unitSectorId?: string | null
    allowedSectorKeys?: ReadonlySet<string> | null
    phaseId?: string | null
  } = {},
) {
  const mapped = isMappedCheckoutItem(item)
  const isNumbered = item.isNumbered ?? item.is_numbered
  const seatId = mapped ? checkoutItemSeatId(item) : null
  const hints = trustedReserveZoneHints({
    seatingUnitId: seatId,
    unitSectorId: input.unitSectorId ?? null,
    clientSectorKey: item.sectorKey ?? input.sectorKey ?? null,
    clientTableNumber: item.tableNumber ?? null,
    clientZoneId: item.zoneId ?? null,
    allowedSectorKeys: input.allowedSectorKeys ?? null,
  })
  return {
    type: mapped ? "mapped" : "general",
    ticket_tier_id: checkoutItemTierId(item),
    tier_id: checkoutItemTierId(item),
    quantity: mapped ? 1 : item.quantity,
    sector_key: hints.sectorKey,
    table_number: hints.tableNumber,
    zone_id: hints.zoneId,
    seating_unit_id: seatId,
    seat_id: seatId,
    element_id: mapped ? checkoutItemElementId(item) : null,
    event_date_id: checkoutItemEventDateId(item),
    eventDateId: checkoutItemEventDateId(item),
    dateId: checkoutItemEventDateId(item),
    has_map: item.hasMap ?? item.has_map ?? null,
    is_numbered: isNumbered ?? mapped,
    hasMap: item.hasMap ?? item.has_map ?? null,
    isNumbered: isNumbered ?? mapped,
    phase_id: input.phaseId ?? null,
  }
}

export function quoteHybridCartTotal(input: {
  items: CheckoutCartItem[]
  unitPriceByTier: Map<string, number>
  unitPriceByIndex?: Array<number | undefined>
  phasesByTier?: Map<string, PublicTicketPhase[]>
}): { ok: true; total: number } | { ok: false; error: string } {
  let totalCents = 0
  for (const [index, item] of input.items.entries()) {
    const tierId = checkoutItemTierId(item)
    const phases = input.phasesByTier?.get(tierId) ?? []
    const decision = decidePhaseCart(phases, item.quantity)
    const phasePrice =
      decision.kind === "ok" ? Number(decision.phase.price) : null
    const unit =
      input.unitPriceByIndex?.[index] ??
      phasePrice ??
      input.unitPriceByTier.get(tierId)
    if (unit == null || !Number.isFinite(unit) || unit < 0) {
      return { ok: false, error: CHECKOUT_PRICES_CHANGED_ERROR }
    }
    const quantity = isMappedCheckoutItem(item) ? 1 : item.quantity
    totalCents += moneyToCents(unit) * quantity
  }
  return { ok: true, total: centsToMoney(totalCents) }
}

export function amountsMatch(left: number, right: number): boolean {
  return moneyAmountsEqual(left, right)
}
