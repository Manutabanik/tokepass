import {
  orderLedgerFromQuote,
  quoteCheckoutMoney,
  resolvePersistedFeeLedger,
  type CheckoutMoneyQuote,
} from "@/lib/checkout/checkout-money"
import {
  amountsMatch,
  checkoutItemSeatId,
  checkoutItemTierId,
  quoteHybridCartTotal,
  trustedReserveZoneHints,
} from "@/lib/checkout/hybrid-cart"
import {
  CHECKOUT_PRICES_CHANGED_ERROR,
  liveCheckoutTiersCoverCart,
} from "@/lib/checkout/price-guard"
import type { PublicTicketPhase } from "@/lib/inventory/active-phase"
import { logger } from "@/lib/logger"
import type { CheckoutSupabase } from "@/lib/modules/checkout/types/checkout.types"
import { resolvePublicEventFeeRule } from "@/lib/pricing/event-fees"
import { tryCreateAdminClient } from "@/lib/supabase/admin"
import type { CheckoutCartItem } from "@/lib/validations/checkout"

/**
 * Resuelve la regla de fees del evento combinando columnas y RPCs, con
 * fallback si `absorb_fees` no existe todavía en el schema.
 */
async function loadEventServiceFeeRule(
  supabase: CheckoutSupabase,
  eventId: string,
): Promise<{ rate: number; fixedFee: number; absorbFees: boolean }> {
  let feeRow = await supabase
    .from("events")
    .select(
      "platform_fee_percentage, platform_fixed_fee, is_sponsored_by_tokepass, absorb_fees",
    )
    .eq("id", eventId)
    .maybeSingle()
  if (
    feeRow.error &&
    /absorb_fees|schema cache|PGRST204|42703/i.test(feeRow.error.message)
  ) {
    feeRow = await supabase
      .from("events")
      .select(
        "platform_fee_percentage, platform_fixed_fee, is_sponsored_by_tokepass",
      )
      .eq("id", eventId)
      .maybeSingle()
  }
  const event = feeRow.data
  const { data: rateRpc } = await supabase.rpc("get_event_service_charge_rate", {
    p_event_id: eventId,
  })
  const { data: fixedRpc } = await supabase.rpc("get_event_platform_fixed_fee", {
    p_event_id: eventId,
  })
  const rule = resolvePublicEventFeeRule({
    platformFeePercentage: event?.platform_fee_percentage,
    rpcRate: rateRpc,
    platformFixedFee: event?.platform_fixed_fee,
    rpcFixedFee: fixedRpc,
    isSponsored: Boolean(event?.is_sponsored_by_tokepass),
  })
  return {
    rate: rule.rate,
    fixedFee: rule.fixedFee,
    absorbFees: event?.absorb_fees === true,
  }
}

/** Escribe el ledger de fees en la orden si difiere del ya persistido. */
export async function persistOrderFeeLedger(
  orderId: string,
  quote: CheckoutMoneyQuote,
): Promise<boolean> {
  const admin = tryCreateAdminClient()
  if (!admin) return false
  const { data: order } = await admin
    .from("orders")
    .select("service_charge, subtotal, total_amount")
    .eq("id", orderId)
    .maybeSingle()
  if (!order) return false
  const ledger = resolvePersistedFeeLedger(
    {
      subtotal: Number(order.subtotal ?? 0),
      service_charge: Number(order.service_charge ?? 0),
      total_amount: Number(order.total_amount ?? 0),
    },
    orderLedgerFromQuote(quote),
  )
  const sameLedger =
    amountsMatch(Number(order.service_charge ?? 0), ledger.service_charge) &&
    amountsMatch(Number(order.subtotal ?? 0), ledger.subtotal) &&
    amountsMatch(Number(order.total_amount ?? 0), ledger.total_amount)
  if (sameLedger) return true
  const { error } = await admin
    .from("orders")
    .update({
      subtotal: ledger.subtotal,
      service_charge: ledger.service_charge,
      total_amount: ledger.total_amount,
    })
    .eq("id", orderId)
  if (error) {
    logger.error({
      context: "checkout/reservation",
      message: "fee_ledger_persist_failed",
      orderId,
      error: error.message,
    })
    return false
  }
  return true
}

/**
 * Cotiza el carrito contra precios vivos de la DB (nunca contra el cliente):
 * lee tiers, resuelve precio por zona vía RPC y aplica la regla de fees.
 */
export async function quoteCheckoutFromDatabase(
  supabase: CheckoutSupabase,
  eventId: string,
  items: CheckoutCartItem[],
  phasesByTier: Map<string, PublicTicketPhase[]>,
): Promise<
  { ok: true; total: number; quote: CheckoutMoneyQuote } | { ok: false; error: string }
> {
  const tierIds = [...new Set(items.map((item) => checkoutItemTierId(item)))]
  const { data: tierRows } = await supabase
    .from("ticket_tiers")
    .select("id, price, visibility")
    .eq("event_id", eventId)
    .in("id", tierIds)

  const liveTiers = liveCheckoutTiersCoverCart(tierIds, tierRows ?? [])
  if (!liveTiers.ok) return liveTiers

  const unitPriceByTier = new Map<string, number>()
  for (const row of tierRows ?? []) {
    const price = Number(row.price)
    if (Number.isFinite(price) && price >= 0) {
      unitPriceByTier.set(row.id, price)
    }
  }

  const seatedIds = [
    ...new Set(
      items
        .map((item) => checkoutItemSeatId(item))
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const unitSectorById = new Map<string, string>()
  if (seatedIds.length > 0) {
    const { data: units } = await supabase
      .from("event_seating_units")
      .select("id, sector_id")
      .eq("event_id", eventId)
      .in("id", seatedIds)
    for (const unit of units ?? []) {
      if (unit.sector_id) unitSectorById.set(unit.id, unit.sector_id)
    }
  }

  const unitPriceByIndex: Array<number | undefined> = items.map(() => undefined)
  for (const [index, item] of items.entries()) {
    const tierId = checkoutItemTierId(item)
    const seatId = checkoutItemSeatId(item)
    const hints = trustedReserveZoneHints({
      seatingUnitId: seatId,
      unitSectorId: seatId ? (unitSectorById.get(seatId) ?? null) : null,
      clientSectorKey: item.sectorKey ?? null,
      clientTableNumber: item.tableNumber ?? null,
      clientZoneId: item.zoneId ?? null,
    })
    const { data, error } = await supabase.rpc("resolve_zone_tier_unit_price", {
      p_event_id: eventId,
      p_ticket_tier_id: tierId,
      p_sector_key: hints.sectorKey,
      p_table_number: hints.tableNumber,
      p_zone_id: hints.zoneId,
    })
    if (error || data == null || !Number.isFinite(Number(data))) {
      continue
    }
    unitPriceByIndex[index] = Number(data)
  }

  if (unitPriceByTier.size < tierIds.length) {
    return { ok: false, error: CHECKOUT_PRICES_CHANGED_ERROR }
  }

  const hybrid = quoteHybridCartTotal({
    items,
    unitPriceByTier,
    unitPriceByIndex,
    phasesByTier,
  })
  if (!hybrid.ok) return hybrid
  const rule = await loadEventServiceFeeRule(supabase, eventId)
  const quote = quoteCheckoutMoney(hybrid.lines, rule)
  return { ok: true, total: quote.grandTotal, quote }
}
