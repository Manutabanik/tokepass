"use server"

import { revalidatePath } from "next/cache"

import { findScheduleDay, parseScheduleDays } from "@/lib/event-schedule"
import { assertEventOpsAccess, listOperableEvents } from "@/lib/event-ops-access"
import { toPosUserError } from "@/lib/errors/commerce-errors"
import {
  requeuePosIssueNotifications,
  scheduleNotificationOutboxDrain,
} from "@/lib/notifications/outbox"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  POS_STAFF_ROLES,
  isPosStaffRole,
  normalizePosPaymentMethod,
} from "@/lib/pos-checkout"
import { signedDoorQrOrFallback } from "@/lib/totp-offline"
import { createClient } from "@/lib/supabase/server"
import {
  BootstrapPosCashierPinSchema,
  CloseCashierShiftSchema,
  DeliverPosTicketsSchema,
  OpenCashierShiftSchema,
  PosCashierPinSchema,
  PosSaleInputSchema,
  PosSupervisorPinSchema,
  VoidPosOrderSchema,
  formatPosValidationError,
} from "@/lib/validations/pos"
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
  location: string
  qrType: QrType
  hasSupervisorPin: boolean
  tiers: Array<{
    id: string
    name: string
    price: number
    available: number
    admitCount: number
    requiresSupervisorPin: boolean
    seatingSectorId: string | null
  }>
}

export type PosPinContext = {
  eventId: string
  hasSupervisorPin: boolean
  hasCashierPin: boolean
  canManagePins: boolean
}

export type PosThermalReceipt = {
  ticketId: string
  qrPayload: string
  eventTitle: string
  eventDate: string
  eventLocation: string
  tierName: string
  total: number
  holderName: string
  holderDni: string | null
  seatLabel: string | null
}

export type PosReprintRow = {
  orderId: string
  createdAt: string
  totalAmount: number
  ticketCount: number
  holderName: string | null
  tierName: string | null
  receipts: PosThermalReceipt[]
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
        signedQr: string
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
  flyerUrl: string | null
  doorsOpenAt: string
  sectorLabel: string | null
  seatingLabel: string | null
  isTest: boolean
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

async function requirePosSession(): Promise<
  { success: true; userId: string } | { success: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Sesión requerida." }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role === "admin" || profile?.role === "super_admin") {
    return { success: true, userId: user.id }
  }

  const { data: assignments } = await supabase
    .from("event_staff_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)

  const allowed = (assignments ?? []).some((row) => isPosStaffRole(row.role))
  if (!allowed) {
    return {
      success: false,
      error: "No tenés permiso para operar la boletería POS.",
    }
  }

  return { success: true, userId: user.id }
}

export async function getPosEvents(): Promise<PosEventOption[]> {
  const rows = await listOperableEvents({ roles: [...POS_STAFF_ROLES] })

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
      location: event.location?.trim() || "",
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
          seatingSectorId:
            (tier as { seating_sector_id?: string | null }).seating_sector_id ??
            null,
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
    const parsed = OpenCashierShiftSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: formatPosValidationError(parsed.error) }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Sesión requerida." }

    const access = await requirePosSession()
    if (!access.success) return access

    const eventAccess = await assertEventOpsAccess(parsed.data.eventId, [
      ...POS_STAFF_ROLES,
    ])
    if (!eventAccess.ok) {
      return {
        success: false,
        error:
          eventAccess.reason === "auth_required"
            ? "Sesión requerida."
            : "No tenés permiso para abrir caja en este evento.",
      }
    }

    const { data, error } = await supabase.rpc("open_cashier_shift", {
      p_event_id: parsed.data.eventId,
      p_start_amount: parsed.data.startAmount,
    })

    if (error || !data) {
      return {
        success: false,
        error: toPosUserError(error, "No se pudo abrir la caja."),
      }
    }

    revalidatePath("/admin/pos")
    revalidatePath("/dashboard/pos")
    return {
      success: true,
      shift: mapShift(data as Parameters<typeof mapShift>[0]),
    }
  } catch (error) {
    return {
      success: false,
      error: toPosUserError(error, "No se pudo abrir la caja."),
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
    const parsed = CloseCashierShiftSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: formatPosValidationError(parsed.error) }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Sesión requerida." }

    const access = await requirePosSession()
    if (!access.success) return access

    const { data, error } = await supabase.rpc("close_cashier_shift", {
      p_shift_id: parsed.data.shiftId,
      p_counted_amount:
        parsed.data.countedAmount == null || parsed.data.countedAmount === undefined
          ? null
          : parsed.data.countedAmount,
    })

    if (error || !data) {
      return {
        success: false,
        error: toPosUserError(error, "No se pudo cerrar el turno."),
      }
    }

    const shift = mapShift(data as Parameters<typeof mapShift>[0])
    const zReport = await buildTicketZReport(shift)

    revalidatePath("/admin/pos")
    revalidatePath("/dashboard/pos")
    return {
      success: true,
      shift,
      zReport,
    }
  } catch (error) {
    return {
      success: false,
      error: toPosUserError(error, "No se pudo cerrar el turno."),
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
      cashier?.full_name?.trim() || cashier?.email || "Cajero TokePass",
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
  paymentMethod: "cash" | "card" | "transfer" | "cash_pos" | "transfer_pos" | "card_pos"
  customerPhone?: string | null
  customerEmail?: string | null
  customerDni?: string | null
  customerName?: string | null
  shiftId: string
  supervisorPin?: string | null
  seatingLayoutItemId?: string | null
  seatingUnitId?: string | null
}): Promise<PosSaleResult> {
  try {
    const parsed = PosSaleInputSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: formatPosValidationError(parsed.error) }
    }

    const sale = parsed.data
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: "Sesión requerida." }
    }

    const access = await requirePosSession()
    if (!access.success) return access

    const eventAccess = await assertEventOpsAccess(sale.eventId, [
      ...POS_STAFF_ROLES,
    ])
    if (!eventAccess.ok) {
      return {
        success: false,
        error:
          eventAccess.reason === "auth_required"
            ? "Sesión requerida."
            : "No tenés permiso para cobrar en este evento.",
      }
    }

    const paymentMethod = normalizePosPaymentMethod(sale.paymentMethod)
    if (!paymentMethod) {
      return { success: false, error: "Método de pago presencial inválido." }
    }

    const rawDni = sale.customerDni?.replace(/\D/g, "") ?? ""
    const dni =
      rawDni.length >= 7 && rawDni.length <= 11 ? rawDni : "00000000"

    const seatingLayoutItemId = sale.seatingLayoutItemId
    const seatingUnitId = sale.seatingUnitId

    const checkoutArgs = {
      p_event_id: sale.eventId,
      p_tier_id: sale.tierId,
      p_quantity: sale.quantity,
      p_payment_method: paymentMethod,
      p_cashier_user_id: user.id,
      p_customer_phone: sale.customerPhone,
      p_customer_dni: dni,
      p_customer_name: sale.customerName,
      p_shift_id: sale.shiftId,
      p_supervisor_pin: sale.supervisorPin,
      p_seating_unit_id: seatingUnitId,
      p_seating_layout_item_id: seatingLayoutItemId,
    }

    const checkout = await supabase.rpc("process_pos_checkout_tx", checkoutArgs)
    const data = checkout.data
    const error = checkout.error

    if (error) {
      return { success: false, error: toPosUserError(error) }
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

    const holderName = sale.customerName?.trim() || "Consumidor Final"

    scheduleNotificationOutboxDrain()

    revalidatePath("/admin/pos")
    revalidatePath("/dashboard/pos")
    revalidatePath("/admin/scanner")
    revalidatePath("/cuenta/entradas")

    return {
      success: true,
      orderId: rows[0].order_id,
      totalAmount: Number(rows[0].total_amount),
      paymentMethod,
      tickets: rows.map((row) => ({
        id: row.ticket_id,
        totpSecret: row.totp_secret,
        signedQr: signedDoorQrOrFallback(row.ticket_id, row.totp_secret),
        qrCode: row.qr_code,
        printPath: `/tickets/${row.ticket_id}/print`,
        holderName,
        holderDni: dni,
      })),
    }
  } catch (error) {
    return {
      success: false,
      error: toPosUserError(error, "No se pudo completar la venta."),
    }
  }
}

export async function deliverPosTickets(input: {
  eventTitle: string
  ticketIds: string[]
  phone?: string | null
  email?: string | null
}): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = DeliverPosTicketsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: formatPosValidationError(parsed.error) }
  }
  const ticketIds = parsed.data.ticketIds
  const phone = parsed.data.phone
  const email = parsed.data.email
  if (!phone && !email) {
    return { success: false, error: "Ingresá WhatsApp, SMS o email." }
  }
  try {
    const admin = createAdminClient()
    const { data: ticket } = await admin
      .from("tickets")
      .select("order_id")
      .eq("id", ticketIds[0])
      .maybeSingle()

    if (!ticket?.order_id) {
      return { success: false, error: "No se encontro la orden de esas entradas." }
    }

    await requeuePosIssueNotifications({
      orderId: ticket.order_id,
      eventTitle: parsed.data.eventTitle,
      ticketIds,
      phone,
      email,
    })
    scheduleNotificationOutboxDrain()
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: toPosUserError(error, "No se pudo enviar."),
    }
  }
}

export async function setPosSupervisorPin(input: {
  eventId: string
  pin: string
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const parsed = PosSupervisorPinSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: formatPosValidationError(parsed.error) }
    }

    const supabase = await createClient()
    const { error } = await supabase.rpc("set_pos_supervisor_pin", {
      p_event_id: parsed.data.eventId,
      p_pin: parsed.data.pin,
    })

    if (error) {
      return {
        success: false,
        error: toPosUserError(
          error,
          "Solo el organizador o un admin puede configurar el PIN.",
        ),
      }
    }

    revalidatePath("/admin/pos")
    revalidatePath("/dashboard/pos")
    revalidatePath("/admin/settings/users")
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: toPosUserError(error, "No se pudo guardar el PIN."),
    }
  }
}

export async function getPosPinContext(
  eventId: string,
): Promise<PosPinContext> {
  const empty: PosPinContext = {
    eventId,
    hasSupervisorPin: false,
    hasCashierPin: false,
    canManagePins: false,
  }
  if (!eventId) return empty

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return empty

  const [{ data: event }, { data: profile }, cashierPin] = await Promise.all([
    supabase
      .from("events")
      .select("id, organizer_id, pos_supervisor_pin_hash")
      .eq("id", eventId)
      .maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.rpc("pos_cashier_has_pin", { p_event_id: eventId }),
  ])

  const role = profile?.role ?? ""
  const canManagePins = Boolean(
    event &&
      (event.organizer_id === user.id || role === "super_admin"),
  )

  return {
    eventId,
    hasSupervisorPin: Boolean(
      (event as { pos_supervisor_pin_hash?: string | null } | null)
        ?.pos_supervisor_pin_hash,
    ),
    hasCashierPin: Boolean(cashierPin.data),
    canManagePins,
  }
}

export async function verifyPosCashierPin(input: {
  eventId: string
  pin: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = PosCashierPinSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: formatPosValidationError(parsed.error) }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("verify_pos_cashier_pin", {
    p_event_id: parsed.data.eventId,
    p_pin: parsed.data.pin,
  })

  if (error) {
    return { success: false, error: toPosUserError(error, "PIN de cajero inválido.") }
  }
  if (!data) return { success: false, error: "PIN de cajero inválido." }
  return { success: true }
}

export async function bootstrapPosCashierPin(input: {
  eventId: string
  newPin: string
  adminPin?: string | null
}): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = BootstrapPosCashierPinSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: formatPosValidationError(parsed.error) }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("bootstrap_pos_cashier_pin", {
    p_event_id: parsed.data.eventId,
    p_new_pin: parsed.data.newPin,
    p_admin_pin: parsed.data.adminPin || "",
  })

  if (error) {
    return {
      success: false,
      error: toPosUserError(
        error,
        "Se necesita autorización de un administrador.",
      ),
    }
  }

  revalidatePath("/admin/pos")
  revalidatePath("/admin/settings/users")
  return { success: true }
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
  ticketIds: string[]
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
    .select("id, order_id, holder_name, holder_dni, ticket_tiers(name)")
    .in("order_id", orderIds)

  const metaByOrder = new Map<
    string,
    {
      count: number
      holderName: string | null
      holderDni: string | null
      tierName: string | null
      ticketIds: string[]
    }
  >()
  for (const row of tickets ?? []) {
    const orderId = row.order_id as string
    const current = metaByOrder.get(orderId) ?? {
      count: 0,
      holderName: null,
      holderDni: null,
      tierName: null,
      ticketIds: [],
    }
    current.count += 1
    current.ticketIds.push(row.id as string)
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
      ticketIds: meta?.ticketIds ?? [],
    }
  })
}

export async function listShiftReprintReceipts(
  shiftId: string,
): Promise<PosReprintRow[]> {
  const orders = (await listOpenShiftOrders(shiftId)).slice(0, 10)
  if (orders.length === 0) return []

  const ticketIds = orders.flatMap((order) => order.ticketIds)
  if (ticketIds.length === 0) {
    return orders.map((order) => ({
      orderId: order.orderId,
      createdAt: order.createdAt,
      totalAmount: order.totalAmount,
      ticketCount: order.ticketCount,
      holderName: order.holderName,
      tierName: order.tierName,
      receipts: [],
    }))
  }

  const supabase = await createClient()
  const { data: tickets } = await supabase
    .from("tickets")
    .select(
      "id, order_id, totp_secret, holder_name, holder_dni, ticket_tiers(name, price), events(title, date, location)",
    )
    .in("id", ticketIds)

  const receiptsByOrder = new Map<string, PosThermalReceipt[]>()
  for (const row of tickets ?? []) {
    const event = row.events as unknown as {
      title?: string
      date?: string
      location?: string
    } | null
    const tier = row.ticket_tiers as unknown as {
      name?: string
      price?: number | null
    } | null
    const receipt: PosThermalReceipt = {
      ticketId: row.id as string,
      qrPayload: signedDoorQrOrFallback(
        row.id as string,
        row.totp_secret as string | null,
      ),
      eventTitle: event?.title ?? "Evento",
      eventDate: event?.date ?? "",
      eventLocation: event?.location ?? "",
      tierName: tier?.name ?? "Entrada",
      total: Number(tier?.price ?? 0),
      holderName: (row.holder_name as string | null) ?? "Consumidor Final",
      holderDni: (row.holder_dni as string | null) ?? null,
      seatLabel: null,
    }
    const orderId = row.order_id as string
    const list = receiptsByOrder.get(orderId) ?? []
    list.push(receipt)
    receiptsByOrder.set(orderId, list)
  }

  return orders.map((order) => ({
    orderId: order.orderId,
    createdAt: order.createdAt,
    totalAmount: order.totalAmount,
    ticketCount: order.ticketCount,
    holderName: order.holderName,
    tierName: order.tierName,
    receipts: receiptsByOrder.get(order.orderId) ?? [],
  }))
}

export async function voidPosOrder(input: {
  orderId: string
  supervisorPin: string
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const parsed = VoidPosOrderSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: formatPosValidationError(parsed.error) }
    }

    const access = await requirePosSession()
    if (!access.success) return access

    const supabase = await createClient()
    const { error } = await supabase.rpc("void_pos_order", {
      p_order_id: parsed.data.orderId,
      p_supervisor_pin: parsed.data.supervisorPin,
    })

    if (error) {
      return { success: false, error: toPosUserError(error, "No se pudo anular la venta.") }
    }

    revalidatePath("/admin/pos")
    revalidatePath("/dashboard/pos")
    revalidatePath("/admin/scanner")
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: toPosUserError(error, "No se pudo anular la venta."),
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

  const rich = await supabase
    .from("tickets")
    .select(
      "id, status, totp_secret, scanned_at, is_dynamic_qr, is_test, owner_id, holder_name, holder_dni, event_seating_units(label, sector_name, row_label, layout_type), ticket_tiers(name, price, day_id), events(id, title, date, location, qr_type, organizer_id, flyer_url, image_url, schedule_days, venues(name))",
    )
    .eq("id", ticketId)
    .maybeSingle()

  const query =
    rich.error &&
    /event_seating_units|flyer_url|schedule_days|day_id|venues|schema cache|PGRST204|42703/i.test(
      rich.error.message,
    )
      ? await supabase
          .from("tickets")
          .select(
            "id, status, totp_secret, scanned_at, is_dynamic_qr, is_test, owner_id, holder_name, holder_dni, ticket_tiers(name, price), events(id, title, date, location, qr_type, organizer_id)",
          )
          .eq("id", ticketId)
          .maybeSingle()
      : rich

  const { data, error } = query

  if (error || !data) return null

  type Row = {
    id: string
    status: string
    totp_secret: string
    scanned_at: string | null
    is_dynamic_qr: boolean
    is_test?: boolean | null
    owner_id: string | null
    holder_name: string | null
    holder_dni: string | null
    ticket_tiers: { name: string; price?: number | null; day_id?: string | null } | null
    event_seating_units: {
      label: string | null
      sector_name: string | null
      row_label: string | null
      layout_type: string | null
    } | null
    events: {
      id: string
      title: string
      date: string
      location: string
      qr_type: QrType | null
      organizer_id: string
      flyer_url?: string | null
      image_url?: string | null
      schedule_days?: unknown
      venues?: { name?: string | null } | { name?: string | null }[] | null
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
    // Staff cajero del evento (POS). Puerta no imprime desde boletería.
    const { data: staffOk } = await supabase.rpc(
      "user_is_event_organizer_or_staff",
      {
        p_event_id: row.events.id,
        p_user_id: user.id,
        p_roles: ["cashier"],
      },
    )
    if (!staffOk) return null
  }

  let holderName =
    row.holder_name?.trim() ||
    profile?.full_name?.trim() ||
    profile?.email ||
    "Titular TokePass"

  if (!row.holder_name && row.owner_id && row.owner_id !== user.id) {
    const { data: owner } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", row.owner_id)
      .maybeSingle()
    holderName =
      owner?.full_name?.trim() || owner?.email || "Titular TokePass"
  }

  // Papel / POS: siempre payload estático (secreto) para que el escáner lo acepte.
  const qrType: QrType =
    row.is_dynamic_qr === false || row.events.qr_type === "static"
      ? "static"
      : "static"

  const scheduleDays = parseScheduleDays(row.events.schedule_days)
  const dayBound = findScheduleDay(
    scheduleDays,
    row.ticket_tiers?.day_id ?? undefined,
  )
  const seatingParts = [
    row.event_seating_units?.sector_name?.trim(),
    row.event_seating_units?.label?.trim(),
    row.event_seating_units?.row_label
      ? `Fila ${row.event_seating_units.row_label.trim()}`
      : null,
  ].filter((part): part is string => Boolean(part))

  const venueRaw = row.events.venues
  const venueName = (Array.isArray(venueRaw) ? venueRaw[0] : venueRaw)?.name?.trim()
  const eventLocation =
    venueName && venueName !== row.events.location
      ? `${venueName} · ${row.events.location}`
      : row.events.location

  return {
    id: row.id,
    totpSecret: row.totp_secret,
    qrPayload: signedDoorQrOrFallback(row.id, row.totp_secret),
    status: row.status,
    tierName: row.ticket_tiers?.name ?? "Entrada",
    holderName,
    holderDni: row.holder_dni,
    tierPrice:
      row.ticket_tiers?.price == null ? null : Number(row.ticket_tiers.price),
    eventTitle: row.events.title,
    eventDate: row.events.date,
    eventLocation,
    qrType,
    scannedAt: row.scanned_at,
    flyerUrl: row.events.flyer_url?.trim() || row.events.image_url?.trim() || null,
    doorsOpenAt: dayBound?.start_time || row.events.date,
    sectorLabel: seatingParts[0] ?? null,
    seatingLabel: seatingParts.length > 0 ? seatingParts.join(" · ") : null,
    isTest: Boolean(row.is_test),
  }
}
