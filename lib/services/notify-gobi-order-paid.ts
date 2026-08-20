import type { SupabaseClient } from "@supabase/supabase-js"

import { logger } from "@/lib/logger"
import { dispatchOrderPaidToGobi } from "@/lib/services/gobi-dispatcher"

export type GobiNotifyOutcome =
  | { status: "sent" }
  | {
      status: "skipped"
      reason: "no_order" | "no_phone" | "no_tickets" | "not_configured"
    }
  | { status: "failed"; error: string }

/**
 * Carga datos de la orden pagada y notifica a Gobi (Living Ticket vía WhatsApp HSM).
 * No revierte el pago. El worker de outbox decide reintento o skip.
 */
export async function notifyGobiOrderPaid(
  admin: SupabaseClient,
  orderId: string,
  access?: { magicUrl: string; otp: string } | null,
  options?: { throwOnError?: boolean },
): Promise<GobiNotifyOutcome> {
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, customer_phone, buyer_id")
    .eq("id", orderId)
    .maybeSingle()

  if (orderError || !order) {
    logger.error({
      context: "services/notify-gobi-order-paid",
      message: "order_not_found",
      order_id: orderId,
      error: orderError?.message,
    })
    return { status: "skipped", reason: "no_order" }
  }

  const phone = String(order.customer_phone ?? "").trim()
  if (!phone) {
    logger.warn({
      context: "services/notify-gobi-order-paid",
      message: "missing_customer_phone_skip",
      order_id: orderId,
    })
    return { status: "skipped", reason: "no_phone" }
  }

  const [{ data: profile }, { data: tickets }] = await Promise.all([
    admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", order.buyer_id)
      .maybeSingle(),
    admin
      .from("tickets")
      .select("id, event_id, holder_email")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true })
      .limit(1),
  ])

  const ticket = tickets?.[0]
  if (!ticket?.id) {
    console.warn("[notifyGobiOrderPaid] sin tickets — skip Gobi", { orderId })
    return { status: "skipped", reason: "no_tickets" }
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

  const customerName =
    String(profile?.full_name ?? "").trim() ||
    String(profile?.email ?? "").trim() ||
    "Cliente"

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://tokepass.app"
  let ticketUrl = access?.magicUrl ?? ""
  let accessCode = access?.otp?.trim() || undefined
  if (!ticketUrl) {
    const { issueGuestReceiptAccess } = await import(
      "@/app/actions/guest-ticket-access"
    )
    const issued = await issueGuestReceiptAccess(orderId)
    if (issued) {
      ticketUrl = issued.magicUrl
      accessCode = issued.otp.trim() || undefined
    }
  }
  if (!ticketUrl) {
    ticketUrl = `${siteUrl}/cuenta/entradas`
  }

  const result = await dispatchOrderPaidToGobi({
    order_id: orderId,
    event_name: eventName,
    customer_name: customerName,
    customer_phone: phone,
    ticket_url: ticketUrl,
    ...(accessCode ? { access_code: accessCode } : {}),
  })

  if (result.ok) {
    return { status: "sent" }
  }

  if (result.error === "gobi_not_configured") {
    return { status: "skipped", reason: "not_configured" }
  }

  if (options?.throwOnError) {
    throw new Error(result.error)
  }

  return { status: "failed", error: result.error }
}
