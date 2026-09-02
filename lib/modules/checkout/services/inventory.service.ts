import {
  checkoutItemElementId,
  checkoutItemEventDateId,
  checkoutItemSeatId,
  checkoutItemTierId,
  isMappedCheckoutItem,
} from "@/lib/checkout/hybrid-cart"
import { CHECKOUT_PRICES_CHANGED_ERROR } from "@/lib/checkout/price-guard"
import {
  SEAT_SELECTION_REQUIRED,
  SEAT_UNAVAILABLE,
} from "@/lib/checkout/revalidate-seat-holds"
import {
  MISSING_EVENT_DATE_ID,
  asHoldEventDateId,
  pickSeatingUnitRowForRequestedDay,
  requireHoldEventDateId,
  seatingUnitMatchesEventDate,
} from "@/lib/checkout/seat-hold-day"
import {
  applyActivePhaseToTier,
  decidePhaseCart,
  isMissingPhasesSchema,
  mapPublicPhaseRow,
  PHASE_ROLLOVER_MESSAGE,
  PHASE_STOCK_CLAMP_MESSAGE,
  type PublicTicketPhase,
} from "@/lib/inventory/active-phase"
import {
  isMissingSaleWindowSchema,
  resolveTicketSaleState,
  ticketSaleWindowError,
} from "@/lib/inventory/ticket-sale-window"
import { logger } from "@/lib/logger"
import { EVENT_SOLD_OUT_ERROR } from "@/lib/modules/checkout/constants/checkout-errors"
import type {
  CheckoutResult,
  CheckoutSupabase,
  CheckoutTierCommerceRow,
  LayoutHoldDbRow,
} from "@/lib/modules/checkout/types/checkout.types"
import { createAdminClient } from "@/lib/supabase/admin"
import { serverUtcMs } from "@/lib/time/server-now"
import type { CheckoutCartItem } from "@/lib/validations/checkout"

export async function loadCheckoutTierPhases(
  supabase: CheckoutSupabase,
  tierIds: string[],
): Promise<Map<string, PublicTicketPhase[]>> {
  const byTier = new Map<string, PublicTicketPhase[]>()
  if (tierIds.length === 0) return byTier

  const { data, error } = await supabase
    .from("ticket_tier_phases")
    .select(
      "id, tier_id, name, price, capacity_limit, sold, start_time, end_time, status",
    )
    .in("tier_id", tierIds)
    .order("start_time", { ascending: true, nullsFirst: false })

  if (error) {
    if (!isMissingPhasesSchema(error.message)) {
      logger.error({
        context: "checkout/phases",
        message: "ticket_phases_load_failed",
        error: error.message,
      })
    }
    return byTier
  }

  for (const row of data ?? []) {
    const list = byTier.get(row.tier_id) ?? []
    list.push(mapPublicPhaseRow(row))
    byTier.set(row.tier_id, list)
  }
  return byTier
}

function phaseRolloverResult(
  tierId: string,
  phase: PublicTicketPhase,
  available: number,
  message: string,
): CheckoutResult {
  return {
    success: false,
    error: "phase_rollover",
    phaseRollover: {
      tierId,
      phaseId: phase.id,
      phaseName: phase.name,
      price: phase.price,
      available: Math.max(0, available),
      message,
    },
  }
}

/**
 * Detecta si alguna línea del carrito cae en una fase agotada o clampeada y
 * devuelve el resultado de rollover para que el cliente re-cotice.
 */
export async function evaluateCartPhaseRollover(
  supabase: CheckoutSupabase,
  eventId: string,
  items: CheckoutCartItem[],
): Promise<CheckoutResult | null> {
  const quantityItems = items.filter((item) => !isMappedCheckoutItem(item))
  if (quantityItems.length === 0) return null

  const tierIds = [...new Set(quantityItems.map((item) => checkoutItemTierId(item)))]
  const [{ data: tierRows }, phasesByTier] = await Promise.all([
    supabase
      .from("ticket_tiers")
      .select("id, price, capacity, sold")
      .eq("event_id", eventId)
      .in("id", tierIds),
    loadCheckoutTierPhases(supabase, tierIds),
  ])

  const tierById = new Map((tierRows ?? []).map((row) => [row.id, row]))

  for (const item of quantityItems) {
    const tierId = checkoutItemTierId(item)
    const phases = phasesByTier.get(tierId) ?? []
    if (phases.length === 0) continue

    const tier = tierById.get(tierId)
    const tierAvailable = Math.max(
      0,
      Number(tier?.capacity ?? 0) - Number(tier?.sold ?? 0),
    )
    const decision = decidePhaseCart(phases, item.quantity)

    if (decision.kind === "ok") continue

    if (decision.kind === "sold_out") {
      return { success: false, error: EVENT_SOLD_OUT_ERROR }
    }

    if (decision.kind === "clamp") {
      const priced = applyActivePhaseToTier(
        { price: decision.phase.price, available: tierAvailable },
        [decision.phase],
      )
      return phaseRolloverResult(
        tierId,
        decision.phase,
        priced.available,
        PHASE_STOCK_CLAMP_MESSAGE,
      )
    }

    const priced = applyActivePhaseToTier(
      { price: decision.phase.price, available: tierAvailable },
      phases.map((phase) =>
        phase.id === decision.phase.id
          ? { ...phase, status: "active" as const }
          : phase.status === "active"
            ? { ...phase, status: "sold_out" as const }
            : phase,
      ),
    )
    return phaseRolloverResult(
      tierId,
      decision.phase,
      priced.available,
      PHASE_ROLLOVER_MESSAGE,
    )
  }

  return null
}

/**
 * Lee columnas de comercio de los tiers degradando el `select` cuando la
 * columna no existe en el schema desplegado.
 */
export async function loadCheckoutTierCommerce(
  supabase: CheckoutSupabase,
  eventId: string,
  tierIds: string[],
): Promise<
  | { ok: true; rows: CheckoutTierCommerceRow[] }
  | { ok: false; error: string }
> {
  if (tierIds.length === 0) return { ok: true, rows: [] }
  const selects = [
    "id, name, min_purchase_limit, max_purchase_limit, seating_sector_id, layout_type, tier_type, category, ticket_type",
    "id, name, min_purchase_limit, max_purchase_limit, seating_sector_id, layout_type, tier_type, category",
    "id, name, min_purchase_limit, max_purchase_limit, seating_sector_id, layout_type, category",
    "id, name, min_purchase_limit, max_purchase_limit, seating_sector_id, layout_type",
  ]
  for (const columns of selects) {
    const res = await supabase
      .from("ticket_tiers")
      .select(columns as never)
      .eq("event_id", eventId)
      .in("id", tierIds)
    if (!res.error) {
      return {
        ok: true,
        // El `select(columns as never)` dinámico anula la inferencia de
        // Supabase, así que el doble cast es inevitable acá.
        rows: (res.data ?? []) as unknown as CheckoutTierCommerceRow[],
      }
    }
    if (
      !/ticket_type|tier_type|category|schema cache|PGRST204|42703/i.test(
        res.error.message,
      )
    ) {
      break
    }
  }
  return {
    ok: false,
    error: "No se pudieron leer las entradas. Probá de nuevo.",
  }
}

/** Valida que todos los tiers del carrito estén dentro de su ventana de venta. */
export async function evaluateCartSaleWindows(
  supabase: CheckoutSupabase,
  eventId: string,
  items: CheckoutCartItem[],
): Promise<CheckoutResult | null> {
  const tierIds = [
    ...new Set(
      items
        .map((item) => checkoutItemTierId(item))
        .filter((id) => id.length > 0),
    ),
  ]
  if (tierIds.length === 0) return null

  const { data, error } = await supabase
    .from("ticket_tiers")
    .select("id, capacity, sold, sale_starts_at, sale_ends_at")
    .eq("event_id", eventId)
    .in("id", tierIds)

  if (error) {
    if (isMissingSaleWindowSchema(error.message)) return null
    logger.error({
      context: "checkout/sale-window",
      message: "ticket_sale_window_load_failed",
      error: error.message,
    })
    return {
      success: false,
      error: "No se pudo validar la ventana de venta.",
    }
  }

  const now = serverUtcMs()
  for (const item of items) {
    const tierId = checkoutItemTierId(item)
    const row = (data ?? []).find((tier) => tier.id === tierId)
    if (!row) {
      return { success: false, error: CHECKOUT_PRICES_CHANGED_ERROR }
    }
    const state = resolveTicketSaleState({
      capacity: row.capacity,
      sold: row.sold,
      saleStartsAt: (row as { sale_starts_at?: string | null }).sale_starts_at,
      saleEndsAt: (row as { sale_ends_at?: string | null }).sale_ends_at,
      now,
    })
    const message = ticketSaleWindowError(state)
    if (message) {
      return { success: false, error: message }
    }
  }

  return null
}

export async function resolvePhaseRolloverAfterError(
  supabase: CheckoutSupabase,
  eventId: string,
  items: CheckoutCartItem[],
): Promise<CheckoutResult> {
  const rollover = await evaluateCartPhaseRollover(supabase, eventId, items)
  if (rollover) return rollover
  return { success: false, error: EVENT_SOLD_OUT_ERROR }
}

/**
 * Reserva atómica de general admission vía `reserve_tickets_atomic`.
 * Devuelve `missing: true` cuando el schema de fases no está desplegado, para
 * que el caller pueda caer al camino legacy.
 */
export async function reserveGeneralAdmissionAtomic(
  supabase: CheckoutSupabase,
  input: {
    eventId: string
    ownerId: string
    tierId: string
    quantity: number
    phaseId?: string | null
    promoterId?: string | null
  },
) {
  const reservation = await supabase.rpc("reserve_tickets_atomic", {
    p_event_id: input.eventId,
    p_owner_id: input.ownerId,
    p_tier_id: input.tierId,
    p_quantity: input.quantity,
    p_phase_id: input.phaseId ?? null,
  })

  if (reservation.error && isMissingPhasesSchema(reservation.error.message)) {
    return { missing: true as const, reservation: null }
  }

  if (reservation.error || !reservation.data) {
    return { missing: false as const, reservation }
  }

  if (input.promoterId) {
    const orderId = reservation.data[0]?.order_id
    if (orderId) {
      const admin = createAdminClient()
      const { error: promoterError } = await admin
        .from("orders")
        .update({ promoter_id: input.promoterId })
        .eq("id", orderId)
        .eq("buyer_id", input.ownerId)
        .eq("status", "pending")
      if (promoterError) {
        logger.error({
          context: "checkout/reservation",
          message: "atomic_promoter_attach_failed",
          orderId,
          error: promoterError.message,
        })
      }
    }
  }

  return { missing: false as const, reservation }
}

/**
 * Materializa `seatingUnitId` para cada ítem mapeado del carrito, validando
 * que la unidad pertenezca al evento y al día pedido.
 */
export async function resolveMappedSeatingUnits(
  supabase: CheckoutSupabase,
  eventId: string,
  items: CheckoutCartItem[],
): Promise<
  | { ok: true; items: CheckoutCartItem[] }
  | {
      ok: false
      error:
        | typeof SEAT_UNAVAILABLE
        | typeof SEAT_SELECTION_REQUIRED
        | typeof MISSING_EVENT_DATE_ID
    }
> {
  const scheduleDayIds = await loadEventScheduleDayIds(supabase, eventId)
  const next = items.map((item) => ({ ...item }))

  async function lookupUnit(
    elementId: string,
    eventDateId: string | null,
  ): Promise<{ id: string } | null> {
    const scheduleDayCount = scheduleDayIds.length
    if (scheduleDayCount >= 2 && !eventDateId) return null
    let unitQuery = supabase
      .from("event_seating_units")
      .select("id, event_date_id")
      .eq("event_id", eventId)
      .eq("layout_item_id", elementId)
    if (scheduleDayCount >= 2 && eventDateId) {
      unitQuery = unitQuery.eq("event_date_id", eventDateId)
    }
    const { data, error } = await unitQuery.limit(8)
    if (
      error &&
      /event_date_id|schema cache|PGRST204|42703/i.test(error.message)
    ) {
      if (scheduleDayCount >= 2) return null
      const fallback = await supabase
        .from("event_seating_units")
        .select("id")
        .eq("event_id", eventId)
        .eq("layout_item_id", elementId)
        .limit(1)
        .maybeSingle()
      return fallback.data?.id ? { id: fallback.data.id } : null
    }
    const rows = Array.isArray(data) ? data : data ? [data] : []
    const picked = pickSeatingUnitRowForRequestedDay(
      rows,
      eventDateId,
      scheduleDayCount,
    )
    return picked?.id ? { id: picked.id } : null
  }

  async function seatMatchesCart(
    seatId: string,
    elementId: string | null,
    eventDateId: string | null,
  ): Promise<boolean> {
    const { data, error } = await supabase
      .from("event_seating_units")
      .select("id, event_date_id, layout_item_id")
      .eq("event_id", eventId)
      .eq("id", seatId)
      .maybeSingle()
    if (
      error &&
      /event_date_id|schema cache|PGRST204|42703/i.test(error.message)
    ) {
      if (scheduleDayIds.length >= 2) return false
      const fallback = await supabase
        .from("event_seating_units")
        .select("id, layout_item_id")
        .eq("event_id", eventId)
        .eq("id", seatId)
        .maybeSingle()
      if (!fallback.data?.id) return false
      if (
        elementId &&
        fallback.data.layout_item_id &&
        fallback.data.layout_item_id !== elementId
      ) {
        return false
      }
      return true
    }
    if (!data?.id) return false
    if (
      !seatingUnitMatchesEventDate(data, eventDateId, {
        scheduleDayCount: scheduleDayIds.length,
      })
    ) {
      return false
    }
    if (elementId && data.layout_item_id && data.layout_item_id !== elementId) {
      return false
    }
    return true
  }

  for (const item of next) {
    if (!isMappedCheckoutItem(item)) continue
    const eventDateId = checkoutItemEventDateId(item)
    const dayGate = requireHoldEventDateId({
      eventDateId,
      scheduleDayIds,
    })
    if (!dayGate.ok) return { ok: false, error: dayGate.error }
    const resolvedDate = dayGate.eventDateId
    const elementId = checkoutItemElementId(item)
    const existingSeat = checkoutItemSeatId(item)
    if (
      existingSeat &&
      (await seatMatchesCart(existingSeat, elementId, resolvedDate))
    ) {
      item.seatingUnitId = existingSeat
      item.seatId = existingSeat
      item.seat_id = existingSeat
      continue
    }
    if (!elementId) return { ok: false, error: SEAT_SELECTION_REQUIRED }
    const found = await lookupUnit(elementId, resolvedDate)
    if (!found) return { ok: false, error: SEAT_UNAVAILABLE }
    item.seatingUnitId = found.id
    item.seatId = found.id
    item.seat_id = found.id
    item.elementId = elementId
    item.element_id = elementId
  }
  return { ok: true, items: next }
}

export async function loadEventSeatingSectorIds(
  db: CheckoutSupabase,
  eventId: string,
  eventDateId: string | null = null,
): Promise<string[]> {
  const { data, error } = await db
    .from("ticket_tiers")
    .select("seating_sector_id, day_id")
    .eq("event_id", eventId)
  if (error) {
    logger.error({
      context: "checkout/cart-hold",
      message: "hold_layout_tier_sectors_failed",
      eventId,
      error: error.message,
    })
    return []
  }
  const seen = new Set<string>()
  const next: string[] = []
  for (const row of data ?? []) {
    const dayId = asHoldEventDateId(
      (row as { day_id?: string | null }).day_id,
    )
    if (eventDateId && dayId && dayId !== eventDateId) continue
    const id = (
      row as { seating_sector_id?: string | null }
    ).seating_sector_id?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    next.push(id)
  }
  return next
}

export async function loadEventScheduleDayIds(
  db: CheckoutSupabase,
  eventId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from("event_schedules")
    .select("id")
    .eq("event_id", eventId)
  if (error) {
    if (/event_schedules|schema cache|PGRST205|42P01/i.test(error.message)) {
      return []
    }
    logger.error({
      context: "checkout/cart-hold",
      message: "hold_schedule_days_failed",
      eventId,
      error: error.message,
    })
    return []
  }
  return (data ?? [])
    .map((row) => asHoldEventDateId(row.id))
    .filter((id): id is string => Boolean(id))
}

function layoutHoldRowsFromDb(rows: LayoutHoldDbRow[]) {
  return rows.map((row) => {
    const tier = Array.isArray(row.ticket_tiers)
      ? row.ticket_tiers[0]
      : row.ticket_tiers
    return {
      id: row.id,
      status: row.status,
      sector_id: row.sector_id,
      event_date_id: row.event_date_id ?? null,
      day_id: tier?.day_id ?? null,
    }
  })
}

/** Candidatas de unidad para un layout item, tolerando schemas sin `event_date_id`. */
export async function loadLayoutHoldUnits(
  db: CheckoutSupabase,
  input: {
    eventId: string
    layoutItemId: string
    eventDateId?: string | null
    scheduleDayCount?: number
  },
) {
  const eventDateId = asHoldEventDateId(input.eventDateId)
  const multiDay = (input.scheduleDayCount ?? 0) >= 2
  let withDay = db
    .from("event_seating_units")
    .select("id, status, sector_id, event_date_id, ticket_tiers(day_id)")
    .eq("event_id", input.eventId)
    .eq("layout_item_id", input.layoutItemId)
  if (multiDay) {
    if (!eventDateId) return []
    withDay = withDay.eq("event_date_id", eventDateId)
  } else if (eventDateId) {
    withDay = withDay.or(
      `event_date_id.eq.${eventDateId},event_date_id.is.null`,
    )
  }
  withDay = withDay.limit(24)
  const withDayResult = await withDay
  if (!withDayResult.error) {
    return layoutHoldRowsFromDb((withDayResult.data ?? []) as LayoutHoldDbRow[])
  }
  if (
    !/event_date_id|ticket_tiers|schema cache|PGRST204|42703/i.test(
      withDayResult.error.message,
    )
  ) {
    logger.error({
      context: "checkout/cart-hold",
      message: "hold_layout_unit_lookup_failed",
      eventId: input.eventId,
      layoutItemId: input.layoutItemId,
      eventDateId,
      error: withDayResult.error.message,
    })
    return []
  }
  if (multiDay) return []
  const fallback = await db
    .from("event_seating_units")
    .select("id, status, sector_id")
    .eq("event_id", input.eventId)
    .eq("layout_item_id", input.layoutItemId)
    .limit(24)
  if (fallback.error) {
    logger.error({
      context: "checkout/cart-hold",
      message: "hold_layout_unit_lookup_failed",
      eventId: input.eventId,
      layoutItemId: input.layoutItemId,
      error: fallback.error.message,
    })
    return []
  }
  return layoutHoldRowsFromDb((fallback.data ?? []) as LayoutHoldDbRow[])
}
