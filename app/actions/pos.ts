"use server"

import { revalidatePath } from "next/cache"

import { notifyPosTicketIssued } from "@/lib/notifications"
import { createClient } from "@/lib/supabase/server"
import type { PaymentMethod, QrType } from "@/types/database"

export type PosEventOption = {
  id: string
  title: string
  date: string
  qrType: QrType
  tiers: Array<{
    id: string
    name: string
    price: number
    available: number
  }>
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
  eventTitle: string
  eventDate: string
  eventLocation: string
  qrType: QrType
  scannedAt: string | null
}

export async function getPosEvents(): Promise<PosEventOption[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error("auth_required")

  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, date, qr_type, ticket_tiers(id, name, price, capacity, sold)",
    )
    .eq("organizer_id", user.id)
    .in("status", ["published", "draft"])
    .order("date", { ascending: true })

  if (error) throw new Error(error.message)

  type Row = {
    id: string
    title: string
    date: string
    qr_type: QrType | null
    ticket_tiers: Array<{
      id: string
      name: string
      price: number
      capacity: number
      sold: number
    }> | null
  }

  return ((data ?? []) as unknown as Row[]).map((event) => ({
    id: event.id,
    title: event.title,
    date: event.date,
    qrType: event.qr_type === "static" ? "static" : "dynamic",
    tiers: (event.ticket_tiers ?? [])
      .filter((tier) => {
        const n = tier.name.toLowerCase()
        return !n.includes("freepass") && !n.includes("cortes")
      })
      .map((tier) => ({
        id: tier.id,
        name: tier.name,
        price: Number(tier.price),
        available: Math.max(0, tier.capacity - tier.sold),
      })),
  }))
}

export async function createPosSale(input: {
  eventId: string
  tierId: string
  quantity: number
  paymentMethod: "cash_pos" | "transfer_pos"
  customerPhone?: string | null
}): Promise<PosSaleResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: "Sesión requerida." }
    }

    if (
      !input.eventId ||
      !input.tierId ||
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
    })

    if (error) {
      const msg = error.message || "No se pudo completar la venta."
      if (msg.toLowerCase().includes("sold out")) {
        return { success: false, error: "Sin stock para ese tipo de entrada." }
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
        console.error("[pos] notify failed", notifyError)
      })
    }

    revalidatePath("/admin/pos")
    revalidatePath("/admin/scanner")
    revalidatePath("/my-tickets")

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
      "id, status, totp_secret, scanned_at, is_dynamic_qr, owner_id, ticket_tiers(name), events(id, title, date, location, qr_type, organizer_id)",
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
    ticket_tiers: { name: string } | null
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

  if (!allowed) return null

  let holderName =
    profile?.full_name?.trim() || profile?.email || "Titular Tokepass"

  if (row.owner_id && row.owner_id !== user.id) {
    const { data: owner } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", row.owner_id)
      .maybeSingle()
    holderName =
      owner?.full_name?.trim() || owner?.email || "Titular Tokepass"
  }

  const qrType: QrType =
    row.events.qr_type === "static" || !row.is_dynamic_qr
      ? "static"
      : "dynamic"

  return {
    id: row.id,
    totpSecret: row.totp_secret,
    qrPayload: row.totp_secret,
    status: row.status,
    tierName: row.ticket_tiers?.name ?? "Entrada",
    holderName,
    eventTitle: row.events.title,
    eventDate: row.events.date,
    eventLocation: row.events.location,
    qrType,
    scannedAt: row.scanned_at,
  }
}
