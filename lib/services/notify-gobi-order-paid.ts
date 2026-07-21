import type { SupabaseClient } from "@supabase/supabase-js"

import { dispatchOrderPaidToGobi } from "@/lib/services/gobi-dispatcher"

/**
 * Carga datos de la orden pagada y notifica a Gobi (Living Ticket vía WhatsApp HSM).
 * Fire-and-forget seguro: errores se loguean; no revierte el pago.
 */
export async function notifyGobiOrderPaid(
  admin: SupabaseClient,
  orderId: string,
): Promise<void> {
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, customer_phone, buyer_id")
    .eq("id", orderId)
    .maybeSingle()

  if (orderError || !order) {
    console.error("[notifyGobiOrderPaid] orden no encontrada", {
      orderId,
      error: orderError?.message,
    })
    return
  }

  const phone = String(order.customer_phone ?? "").trim()
  if (!phone) {
    console.warn("[notifyGobiOrderPaid] sin customer_phone — skip Gobi", {
      orderId,
    })
    return
  }

  const [{ data: profile }, { data: tickets }] = await Promise.all([
    admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", order.buyer_id)
      .maybeSingle(),
    admin
      .from("tickets")
      .select("id, event_id")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true })
      .limit(1),
  ])

  const ticket = tickets?.[0]
  if (!ticket?.id) {
    console.warn("[notifyGobiOrderPaid] sin tickets — skip Gobi", { orderId })
    return
  }

  let eventName = "Tu evento"
  if (ticket.event_id) {
    const { data: event } = await admin
      .from("events")
      .select("title")
      .eq("id", ticket.event_id)
      .maybeSingle()
    if (event?.title) eventName = String(event.title)
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://tokepass.app"
  const ticketUrl = `${siteUrl}/tickets/${ticket.id}/print`
  const customerName =
    String(profile?.full_name ?? "").trim() ||
    String(profile?.email ?? "").trim() ||
    "Cliente"

  await dispatchOrderPaidToGobi({
    order_id: orderId,
    event_name: eventName,
    customer_name: customerName,
    customer_phone: phone,
    ticket_url: ticketUrl,
  })
}
