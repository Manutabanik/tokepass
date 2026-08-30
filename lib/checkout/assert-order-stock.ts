import { isCheckoutHoldExpired } from "@/lib/seating/venue-map-occupancy"

export type PendingOrderStockTicket = {
  id: string
  status: string
  seatingUnitId?: string | null
  seatingUnit?: {
    status?: string | null
    reservedUntil?: string | null
    reservedOrderId?: string | null
  } | null
  tier?: {
    id?: string | null
    name?: string | null
    capacity?: number | null
    sold?: number | null
  } | null
}

export function seatingHoldStillLive(input: {
  seatingUnitId?: string | null
  seatingUnit?: {
    status?: string | null
    reservedUntil?: string | null
    reservedOrderId?: string | null
  } | null
  orderId: string
  nowMs?: number
}): { ok: true } | { ok: false; error: string } {
  if (!input.seatingUnitId) return { ok: true }
  const unit = input.seatingUnit
  if (!unit) {
    return {
      ok: false,
      error: "La reserva de ubicación ya no está disponible.",
    }
  }
  const status = String(unit.status ?? "")
  if (status === "sold") return { ok: true }
  if (status !== "reserved") {
    return {
      ok: false,
      error: "La reserva de ubicación ya no está disponible.",
    }
  }
  if (isCheckoutHoldExpired(unit.reservedUntil, input.nowMs)) {
    return {
      ok: false,
      error: "La reserva de ubicación venció. Elegí tu ubicación nuevamente.",
    }
  }
  if (
    unit.reservedOrderId &&
    unit.reservedOrderId !== input.orderId
  ) {
    return {
      ok: false,
      error: "Esa ubicación fue reservada por otra compra.",
    }
  }
  return { ok: true }
}

export function assertPersistedTierStock(input: {
  name?: string | null
  capacity?: number | null
  sold?: number | null
}): { ok: true } | { ok: false; error: string } {
  const name = input.name?.trim() || "esta tarifa"
  if (input.capacity == null || !Number.isFinite(Number(input.capacity))) {
    return { ok: false, error: `${name} no tiene stock configurado.` }
  }
  const capacity = Math.floor(Number(input.capacity))
  const sold = Math.max(0, Math.floor(Number(input.sold) || 0))
  if (capacity < 1) {
    return { ok: false, error: `${name} no tiene stock configurado.` }
  }
  if (sold > capacity) {
    return { ok: false, error: `${name} se agotó.` }
  }
  return { ok: true }
}

export function assertPendingOrderTicketsReservable(input: {
  orderId: string
  tickets: readonly PendingOrderStockTicket[]
  nowMs?: number
}): { ok: true } | { ok: false; error: string } {
  const pending = input.tickets.filter(
    (ticket) => ticket.status === "pending_payment",
  )
  if (input.tickets.length > 0 && pending.length === 0) {
    return {
      ok: false,
      error: "Esta orden ya no admite un nuevo checkout.",
    }
  }

  const seenTiers = new Set<string>()
  for (const ticket of pending) {
    const hold = seatingHoldStillLive({
      seatingUnitId: ticket.seatingUnitId,
      seatingUnit: ticket.seatingUnit,
      orderId: input.orderId,
      nowMs: input.nowMs,
    })
    if (!hold.ok) return hold

    const tierId = ticket.tier?.id?.trim()
    if (!tierId || seenTiers.has(tierId)) continue
    seenTiers.add(tierId)
    const stock = assertPersistedTierStock({
      name: ticket.tier?.name,
      capacity: ticket.tier?.capacity,
      sold: ticket.tier?.sold,
    })
    if (!stock.ok) return stock
  }

  return { ok: true }
}

type OrderStockQueryClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
    }
  }
}

function asOrderStockClient(db: unknown): OrderStockQueryClient {
  return db as OrderStockQueryClient
}

type TicketStockJoin = {
  id: string
  status: string
  seating_unit_id?: string | null
  event_seating_units?: {
    status?: string | null
    reserved_until?: string | null
    reserved_order_id?: string | null
  } | null
  seating_unit?: {
    status?: string | null
    reserved_until?: string | null
    reserved_order_id?: string | null
  } | null
  ticket_tiers?: {
    id?: string | null
    name?: string | null
    capacity?: number | null
    sold?: number | null
  } | null
}

export async function assertPendingOrderStillReservable(
  db: unknown,
  orderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await asOrderStockClient(db)
    .from("tickets")
    .select(
      "id, status, seating_unit_id, event_seating_units(status, reserved_until, reserved_order_id), ticket_tiers!tickets_tier_id_fkey(id, name, capacity, sold)",
    )
    .eq("order_id", orderId)

  if (error) {
    return {
      ok: false,
      error: "No se pudo validar el stock antes de iniciar el pago.",
    }
  }

  const tickets = ((data ?? []) as TicketStockJoin[]).map((row) => {
    const unit = row.event_seating_units ?? row.seating_unit
    return {
      id: row.id,
      status: row.status,
      seatingUnitId: row.seating_unit_id,
      seatingUnit: unit
        ? {
            status: unit.status,
            reservedUntil: unit.reserved_until,
            reservedOrderId: unit.reserved_order_id,
          }
        : null,
      tier: row.ticket_tiers
        ? {
            id: row.ticket_tiers.id,
            name: row.ticket_tiers.name,
            capacity: row.ticket_tiers.capacity,
            sold: row.ticket_tiers.sold,
          }
        : null,
    }
  })

  return assertPendingOrderTicketsReservable({ orderId, tickets })
}
