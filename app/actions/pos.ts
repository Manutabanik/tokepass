"use server"

import { revalidatePath } from "next/cache"

import { listOperableEvents } from "@/lib/event-ops-access"
import { logger } from "@/lib/logger"
import { notifyPosTicketIssued } from "@/lib/notifications"
import { createClient } from "@/lib/supabase/server"
import type { PaymentMethod, QrType } from "@/types/database"

export type TicketZReport = {
  shiftId: string
  eventTitle: string
  cashierName: string
  openedAt: string
  closedAt: string | null
  startAmount: number
  cashSalesTotal: number
  cardSalesTotal: number
  transferSalesTotal: number
  ticketsSold: number
  endAmountExpected: number
  endAmountCounted: number | null
  byTier: Array<{ tierName: string; count: number; amount: number }>
}

export type PosEventOption = {
  id: string
  title: string
  date: string
  qrType: QrType
  hasSupervisorPin: boolean
  tiers: Array<{
    id: string
    name: string
    price: number
    available: number
    admitCount: number
    requiresSupervisorPin: boolean
  }>
}

export type CashierShiftRow = {
  id: string
  eventId: string
  cashierId: string
  startAmount: number
  endAmountExpected: number | null
  endAmountCounted: number | null
  cashSalesTotal: number
  cardSalesTotal: number
  transferSalesTotal: number
  ticketsSold: number
  status: "open" | "closed"
  openedAt: string
  closedAt: string | null
}

export type PosSaleResult =
  | {
      success: true
      orderId: string
      totalAmount: number
      paymentMethod: PaymentMethod
      tickets: Array<{
        id: string
        totpSecret: string
        qrCode: string
        printPath: string
        holderName: string
        holderDni: string
      }>
    }
  | { success: false; error: string }

export type PrintableTicket = {
  id: string
  totpSecret: string
  qrPayload: string
  status: string
  tierName: string
  holderName: string
  holderDni: string | null
  tierPrice: number | null
  eventTitle: string
  eventDate: string
  eventLocation: string
  qrType: QrType
  scannedAt: string | null
}

function mapShift(row: {
  id: string
  event_id: string
  cashier_id: string
  start_amount: number | string
  end_amount_expected: number | string | null
  end_amount_counted: number | string | null
  cash_sales_total: number | string
  card_sales_total: number | string
  transfer_sales_total: number | string
  tickets_sold: number
  status: string
  opened_at: string
  closed_at: string | null
}): CashierShiftRow {
  return {
    id: row.id,
    eventId: row.event_id,
    cashierId: row.cashier_id,
    startAmount: Number(row.start_amount),
    endAmountExpected:
      row.end_amount_expected == null ? null : Number(row.end_amount_expected),
    endAmountCounted:
      row.end_amount_counted == null ? null : Number(row.end_amount_counted),
    cashSalesTotal: Number(row.cash_sales_total),
    cardSalesTotal: Number(row.card_sales_total),
    transferSalesTotal: Number(row.transfer_sales_total),
    ticketsSold: Number(row.tickets_sold),
    status: row.status === "closed" ? "closed" : "open",
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  }
}

export async function getPosEvents(): Promise<PosEventOption[]> {
  const rows = await listOperableEvents({ roles: ["cashier"] })

  const supabase = await createClient()
  const eventIds = rows.map((event) => event.id)
  const pinByEvent = new Map<string, boolean>()
  if (eventIds.length > 0) {
    const { data: pinRows } = await supabase
      .from("events")
      .select("id, pos_supervisor_pin_hash")
      .in("id", eventIds)
    for (const row of pinRows ?? []) {
      pinByEvent.set(
        row.id as string,
        Boolean((row as { pos_supervisor_pin_hash?: string | null }).pos_supervisor_pin_hash),
      )
    }
  }

  return rows.map((event) => {
    const hasSupervisorPin = pinByEvent.get(event.id) ?? false
    return {
      id: event.id,
      title: event.title,
      date: event.date,
      qrType: event.qr_type === "static" ? "static" : "dynamic",
      hasSupervisorPin,
      tiers: (event.ticket_tiers ?? []).map((tier) => {
        const name = tier.name
        const price = Number(tier.price)
        const lower = name.toLowerCase()
        const requiresSupervisorPin =
          price <= 0 ||
          lower.includes("freepass") ||
          lower.includes("cortes")
        return {
          id: tier.id,
          name,
          price,
          available: Math.max(0, tier.capacity - tier.sold),
          admitCount: Math.max(
            1,
            Number((tier as { admit_count?: number }).admit_count ?? 1),
          ),
          requiresSupervisorPin,
        }
      }),
    }
  })
}

export async function getOpenCashierShift(
  eventId: string,
): Promise<CashierShiftRow | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !eventId) return null

  const { data, error } = await supabase
    .from("cashier_shifts")
    .select("*")
    .eq("event_id", eventId)
    .eq("cashier_id", user.id)
    .eq("status", "open")
    .maybeSingle()

  if (error || !data) return null
  return mapShift(data as Parameters<typeof mapShift>[0])
}

export async function openCashierShift(input: {
  eventId: string
  startAmount: number
}): Promise<{ success: true; shift: CashierShiftRow } | { success: false; error: string }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Sesión requerida." }

    const amount = Number(input.startAmount)
    if (!Number.isFinite(amount) || amount < 0) {
      return { success: false, error: "Ingresá un fondo inicial válido." }
    }

    const { data, error } = await supabase.rpc("open_cashier_shift", {
      p_event_id: input.eventId,
      p_start_amount: amount,
    })

    if (error || !data) {
      return {
        success: false,
        error: error?.message ?? "No se pudo abrir la caja.",
      }
    }

    revalidatePath("/admin/pos")
    return {
      success: true,
      shift: mapShift(data as Parameters<typeof mapShift>[0]),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al abrir caja.",
    }
  }
}

export async function closeCashierShift(input: {
  shiftId: string
  countedAmount?: number | null
}): Promise<
  | { success: true; shift: CashierShiftRow; zReport: TicketZReport }
  | { success: false; error: string }
> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Sesión requerida." }

    const { data, error } = await supabase.rpc("close_cashier_shift", {
      p_shift_id: input.shiftId,
      p_counted_amount:
        input.countedAmount == null || input.countedAmount === undefined
          ? null
          : Number(input.countedAmount),
    })

    if (error || !data) {
      return {
        success: false,
        error: error?.message ?? "No se pudo cerrar el turno.",
      }
    }

    const shift = mapShift(data as Parameters<typeof mapShift>[0])
    const zReport = await buildTicketZReport(shift)

    revalidatePath("/admin/pos")
    return {
      success: true,
      shift,
      zReport,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al cerrar turno.",
    }
  }
}

async function buildTicketZReport(
  shift: CashierShiftRow,
): Promise<TicketZReport> {
  const supabase = await createClient()

  const [{ data: event }, { data: cashier }, { data: orders }] =
    await Promise.all([
      supabase
        .from("events")
        .select("title")
        .eq("id", shift.eventId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", shift.cashierId)
        .maybeSingle(),
      supabase
        .from("orders")
        .select("id, status")
        .eq("cashier_shift_id", shift.id),
    ])

  const paidOrderIds = (orders ?? [])
    .filter((order) => order.status === "paid")
    .map((order) => order.id)

  const { data: tickets } =
    paidOrderIds.length > 0
      ? await supabase
          .from("tickets")
          .select("id, status, order_id, ticket_tiers(name, price)")
          .in("order_id", paidOrderIds)
      : { data: [] as Array<{
          id: string
          status: string
          order_id: string | null
          ticket_tiers: { name?: string; price?: number | null } | null
        }> }

  type TierAgg = { tierName: string; count: number; amount: number }
  const byTier = new Map<string, TierAgg>()

  for (const row of tickets ?? []) {
    if (
      row.status === "cancelled" ||
      row.status === "revoked" ||
      row.status === "transferred"
    ) {
      continue
    }
    const tier = row.ticket_tiers as unknown as {
      name?: string
      price?: number | null
    } | null
    const name = tier?.name?.trim() || "Entrada"
    const current = byTier.get(name) ?? {
      tierName: name,
      count: 0,
      amount: 0,
    }
    current.count += 1
    current.amount += Number(tier?.price ?? 0)
    byTier.set(name, current)
  }

  return {
    shiftId: shift.id,
    eventTitle: event?.title ?? "Evento",
    cashierName:
      cashier?.full_name?.trim() || cashier?.email || "Cajero Tokepass",
    openedAt: shift.openedAt,
    closedAt: shift.closedAt,
    startAmount: shift.startAmount,
    cashSalesTotal: shift.cashSalesTotal,
    cardSalesTotal: shift.cardSalesTotal,
    transferSalesTotal: shift.transferSalesTotal,
    ticketsSold: shift.ticketsSold,
    endAmountExpected: shift.endAmountExpected ?? shift.startAmount + shift.cashSalesTotal,
    endAmountCounted: shift.endAmountCounted,
    byTier: [...byTier.values()].sort((a, b) => b.count - a.count),
  }
}

export async function getTicketZReport(
  shiftId: string,
): Promise<TicketZReport | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !shiftId) return null

  const { data } = await supabase
    .from("cashier_shifts")
    .select("*")
    .eq("id", shiftId)
    .maybeSingle()

  if (!data) return null
  return buildTicketZReport(mapShift(data as Parameters<typeof mapShift>[0]))
}

export async function createPosSale(input: {
  eventId: string
  tierId: string
  quantity: number
  paymentMethod: "cash_pos" | "transfer_pos" | "card_pos"
  customerPhone?: string | null
  customerDni: string
  customerName?: string | null
  shiftId: string
  supervisorPin?: string | null
}): Promise<PosSaleResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: "Sesión requerida." }
    }

    const dni = input.customerDni.replace(/\D/g, "")
    if (dni.length < 7 || dni.length > 11) {
      return {
        success: false,
        error: "Ingresá el DNI del comprador (7 a 11 dígitos).",
      }
    }

    if (
      !input.eventId ||
      !input.tierId ||
      !input.shiftId ||
      !Number.isInteger(input.quantity) ||
      input.quantity < 1
    ) {
      return { success: false, error: "Datos de venta incompletos." }
    }

    const { data, error } = await supabase.rpc("create_pos_sale_tx", {
      p_event_id: input.eventId,
      p_tier_id: input.tierId,
      p_quantity: input.quantity,
      p_payment_method: input.paymentMethod,
      p_staff_id: user.id,
      p_customer_phone: input.customerPhone?.trim() || null,
      p_customer_dni: dni,
      p_customer_name: input.customerName?.trim() || null,
      p_shift_id: input.shiftId,
      p_supervisor_pin: input.supervisorPin?.trim() || null,
    })

    if (error) {
      const msg = error.message || "No se pudo completar la venta."
      const lower = msg.toLowerCase()
      if (lower.includes("sold out")) {
        return { success: false, error: "Sin stock para ese tipo de entrada." }
      }
      if (lower.includes("shift_required") || lower.includes("shift_invalid")) {
        return {
          success: false,
          error: "Tenés que abrir la caja antes de cobrar.",
        }
      }
      if (lower.includes("dni_required")) {
        return {
          success: false,
          error: "Ingresá el DNI del comprador para el respaldo en puerta.",
        }
      }
      if (lower.includes("supervisor_pin")) {
        return {
          success: false,
          error: "PIN de Autorización inválido o no configurado.",
        }
      }
      return { success: false, error: msg }
    }

    type Row = {
      order_id: string
      ticket_id: string
      totp_secret: string
      qr_code: string
      unit_price: number
      total_amount: number
    }

    const rows = (data ?? []) as Row[]
    if (rows.length === 0) {
      return { success: false, error: "La venta no generó tickets." }
    }

    const holderName = input.customerName?.trim() || "Comprador POS"

    const { data: event } = await supabase
      .from("events")
      .select("title")
      .eq("id", input.eventId)
      .maybeSingle()

    const phone = input.customerPhone?.trim()
    if (phone) {
      void notifyPosTicketIssued({
        phone,
        eventTitle: event?.title ?? "Evento Tokepass",
        ticketIds: rows.map((row) => row.ticket_id),
        quantity: rows.length,
      }).catch((notifyError: unknown) => {
        logger.error({
          context: "pos",
          message: "notify_failed",
          error: notifyError,
        })
      })
    }

    revalidatePath("/admin/pos")
    revalidatePath("/admin/scanner")
    revalidatePath("/cuenta/entradas")

    return {
      success: true,
      orderId: rows[0].order_id,
      totalAmount: Number(rows[0].total_amount),
      paymentMethod: input.paymentMethod,
      tickets: rows.map((row) => ({
        id: row.ticket_id,
        totpSecret: row.totp_secret,
        qrCode: row.qr_code,
        printPath: `/tickets/${row.ticket_id}/print`,
        holderName,
        holderDni: dni,
      })),
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error inesperado en POS.",
    }
  }
}

export async function setPosSupervisorPin(input: {
  eventId: string
  pin: string
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const pin = input.pin.trim()
    if (pin.length < 4 || pin.length > 12) {
      return {
        success: false,
        error: "El PIN tiene que tener entre 4 y 12 caracteres.",
      }
    }

    const supabase = await createClient()
    const { error } = await supabase.rpc("set_pos_supervisor_pin", {
      p_event_id: input.eventId,
      p_pin: pin,
    })

    if (error) {
      const lower = error.message.toLowerCase()
      if (lower.includes("forbidden")) {
        return {
          success: false,
          error: "Solo el organizador o un admin puede configurar el PIN.",
        }
      }
      return { success: false, error: error.message }
    }

    revalidatePath("/admin/pos")
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo guardar el PIN.",
    }
  }
}

export type PosShiftOrder = {
  orderId: string
  createdAt: string
  totalAmount: number
  paymentMethod: PaymentMethod
  ticketCount: number
  holderName: string | null
  holderDni: string | null
  tierName: string | null
}

export async function listOpenShiftOrders(
  shiftId: string,
): Promise<PosShiftOrder[]> {
  if (!shiftId) return []
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data: orders } = await supabase
    .from("orders")
    .select("id, created_at, total_amount, payment_method, status")
    .eq("cashier_shift_id", shiftId)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(40)

  if (!orders?.length) return []

  const orderIds = orders.map((o) => o.id)
  const { data: tickets } = await supabase
    .from("tickets")
    .select("order_id, holder_name, holder_dni, ticket_tiers(name)")
    .in("order_id", orderIds)

  const metaByOrder = new Map<
    string,
    { count: number; holderName: string | null; holderDni: string | null; tierName: string | null }
  >()
  for (const row of tickets ?? []) {
    const orderId = row.order_id as string
    const current = metaByOrder.get(orderId) ?? {
      count: 0,
      holderName: null,
      holderDni: null,
      tierName: null,
    }
    current.count += 1
    if (!current.holderName) {
      current.holderName = (row.holder_name as string | null) ?? null
      current.holderDni = (row.holder_dni as string | null) ?? null
      const tier = row.ticket_tiers as unknown as { name?: string } | null
      current.tierName = tier?.name ?? null
    }
    metaByOrder.set(orderId, current)
  }

  return orders.map((order) => {
    const meta = metaByOrder.get(order.id)
    return {
      orderId: order.id,
      createdAt: order.created_at,
      totalAmount: Number(order.total_amount),
      paymentMethod: order.payment_method as PaymentMethod,
      ticketCount: meta?.count ?? 0,
      holderName: meta?.holderName ?? null,
      holderDni: meta?.holderDni ?? null,
      tierName: meta?.tierName ?? null,
    }
  })
}

export async function voidPosOrder(input: {
  orderId: string
  supervisorPin: string
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const pin = input.supervisorPin.trim()
    if (pin.length < 4) {
      return { success: false, error: "Ingresá el PIN de Autorización." }
    }

    const supabase = await createClient()
    const { error } = await supabase.rpc("void_pos_order", {
      p_order_id: input.orderId,
      p_supervisor_pin: pin,
    })

    if (error) {
      const lower = error.message.toLowerCase()
      if (lower.includes("supervisor_pin")) {
        return { success: false, error: "PIN de Autorización inválido." }
      }
      if (lower.includes("void_tickets_used")) {
        return {
          success: false,
          error: "No se puede anular: alguna entrada ya se usó en puerta.",
        }
      }
      if (lower.includes("shift_invalid")) {
        return {
          success: false,
          error: "Solo se pueden anular ventas del turno abierto.",
        }
      }
      return { success: false, error: error.message }
    }

    revalidatePath("/admin/pos")
    revalidatePath("/admin/scanner")
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo anular la venta.",
    }
  }
}

export async function getPrintableTicket(
  ticketId: string,
): Promise<PrintableTicket | null> {
  if (!ticketId) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data, error } = await supabase
    .from("tickets")
    .select(
      "id, status, totp_secret, scanned_at, is_dynamic_qr, owner_id, holder_name, holder_dni, ticket_tiers(name, price), events(id, title, date, location, qr_type, organizer_id)",
    )
    .eq("id", ticketId)
    .maybeSingle()

  if (error || !data) return null

  type Row = {
    id: string
    status: string
    totp_secret: string
    scanned_at: string | null
    is_dynamic_qr: boolean
    owner_id: string | null
    holder_name: string | null
    holder_dni: string | null
    ticket_tiers: { name: string; price?: number | null } | null
    events: {
      id: string
      title: string
      date: string
      location: string
      qr_type: QrType | null
      organizer_id: string
    } | null
  }

  const row = data as unknown as Row
  if (!row.events) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("id", user.id)
    .maybeSingle()

  const allowed =
    row.owner_id === user.id ||
    row.events.organizer_id === user.id ||
    profile?.role === "super_admin"

  if (!allowed) {
    // Staff cajero / puerta del evento
    const { data: staffOk } = await supabase.rpc(
      "user_is_event_organizer_or_staff",
      {
        p_event_id: row.events.id,
        p_user_id: user.id,
        p_roles: ["cashier", "door_staff"],
      },
    )
    if (!staffOk) return null
  }

  let holderName =
    row.holder_name?.trim() ||
    profile?.full_name?.trim() ||
    profile?.email ||
    "Titular Tokepass"

  if (!row.holder_name && row.owner_id && row.owner_id !== user.id) {
    const { data: owner } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", row.owner_id)
      .maybeSingle()
    holderName =
      owner?.full_name?.trim() || owner?.email || "Titular Tokepass"
  }

  // Papel / POS: siempre payload estático (secreto) para que el escáner lo acepte.
  const qrType: QrType =
    row.is_dynamic_qr === false || row.events.qr_type === "static"
      ? "static"
      : "static"

  return {
    id: row.id,
    totpSecret: row.totp_secret,
    qrPayload: row.totp_secret,
    status: row.status,
    tierName: row.ticket_tiers?.name ?? "Entrada",
    holderName,
    holderDni: row.holder_dni,
    tierPrice:
      row.ticket_tiers?.price == null ? null : Number(row.ticket_tiers.price),
    eventTitle: row.events.title,
    eventDate: row.events.date,
    eventLocation: row.events.location,
    qrType,
    scannedAt: row.scanned_at,
  }
}
