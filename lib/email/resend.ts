import "server-only"

import { render } from "@react-email/render"
import { Resend } from "resend"
import type { SupabaseClient } from "@supabase/supabase-js"

import { TicketReceiptEmail } from "@/components/emails/TicketReceiptEmail"
import {
  OrderConfirmationEmail,
  type OrderEmailProps,
} from "@/emails/OrderConfirmationEmail"
import {
  buildOrderEmailTickets,
  expandIndividualAccessTickets,
  formatOrderNumber,
  httpImageUrl,
  type OrderEmailData,
} from "@/lib/email/order-ticket-payload"
import { escapeHtml, sanitizeEmailSubject, sanitizeEmailText } from "@/lib/email/sanitize"
import { formatCurrency, formatEventDate } from "@/lib/format"
import { logger } from "@/lib/logger"
import { getSiteUrl } from "@/lib/mercadopago"
import { withCircuit } from "@/lib/resilience/circuit-breaker"

export type TicketOrderDetails = {
  orderId: string
  ticketCount: number
  totalPaid: number
}

export type TicketEventDetails = {
  title: string
  date: string
  location: string
}

let resendClient: Resend | null | undefined

function getResendClient(): Resend | null {
  if (resendClient !== undefined) return resendClient
  const apiKey = process.env.RESEND_API_KEY?.trim()
  resendClient = apiKey ? new Resend(apiKey) : null
  return resendClient
}

async function sendResendEmail(
  payload: Parameters<Resend["emails"]["send"]>[0],
) {
  const client = getResendClient()
  if (!client) {
    throw new Error("RESEND_API_KEY no configurada")
  }

  return withCircuit("resend", async () => {
    const { data, error } = await client.emails.send(payload)
    if (error) {
      throw new Error(error.message || "Resend rejected the email")
    }
    return data
  })
}

function resendFromAddress(): string {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "TokePass <entradas@tokepass.com>"
  )
}

export async function sendOrderTicketsEmail(
  payload: OrderEmailData,
): Promise<{ messageId: string }> {
  const email = payload.to.trim().toLowerCase()
  if (!email || !email.includes("@")) {
    throw new Error("invalid_recipient")
  }

  const client = getResendClient()
  if (!client) {
    throw new Error("RESEND_API_KEY no configurada")
  }

  const accountUrl =
    payload.accountUrl?.trim() || `${getEmailAppUrl()}/cuenta/entradas`
  const emailProps: OrderEmailProps = {
    customerName: payload.customerName,
    orderNumber: payload.orderNumber,
    eventName: payload.eventName,
    eventDate: payload.eventDate,
    eventVenue: payload.eventVenue,
    eventBannerUrl: payload.eventBannerUrl,
    totalAmount:
      typeof payload.totalAmount === "number"
        ? formatCurrency(payload.totalAmount)
        : payload.totalAmount,
    tickets: payload.tickets,
    accountUrl,
  }

  const html = await render(OrderConfirmationEmail(emailProps))
  const text = [
    `Tus entradas para ${payload.eventName} ya estan listas.`,
    `Hola ${payload.customerName},`,
    `Orden: ${payload.orderNumber}`,
    `Evento: ${payload.eventName}`,
    `Fecha: ${payload.eventDate}`,
    `Lugar: ${payload.eventVenue}`,
    `Total: ${emailProps.totalAmount}`,
    ...payload.tickets.map((ticket) => `${ticket.label}: ${ticket.codeText}`),
    `Ver entradas: ${accountUrl}`,
  ].join("\n")

  const data = await sendResendEmail({
    from: resendFromAddress(),
    to: [email],
    subject: sanitizeEmailSubject(`Tus entradas para ${payload.eventName}`),
    html,
    text,
  })

  if (!data?.id) {
    throw new Error("Resend rejected the email")
  }

  return { messageId: data.id }
}

export function getEmailAppUrl(): string {
  try {
    return getSiteUrl()
  } catch {
    return (
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
      "https://www.tokepass.com.ar"
    )
  }
}

export async function sendTicketConfirmationEmail({
  to,
  orderDetails,
  eventDetails,
  buyerName,
  walletUrl,
  otpCode,
}: {
  to: string
  orderDetails: TicketOrderDetails
  eventDetails: TicketEventDetails
  buyerName?: string
  walletUrl?: string
  otpCode?: string
}): Promise<void> {
  const email = to.trim().toLowerCase()
  if (!email || !email.includes("@")) {
    logger.warn({
      context: "email/resend",
      message: "skip_invalid_recipient",
      order_id: orderDetails.orderId,
    })
    return
  }

  const client = getResendClient()
  if (!client) {
    logger.warn({
      context: "email/resend",
      message: "resend_api_key_missing",
      order_id: orderDetails.orderId,
    })
    return
  }

  const appUrl = getEmailAppUrl()
  const accessUrl = walletUrl || `${appUrl}/cuenta/entradas`
  const logoUrl = `${appUrl}/brand/tokepass-mark.png`
  const ticketCount = Math.max(1, orderDetails.ticketCount)
  const eventDateLabel = formatEventDate(eventDetails.date)
  const totalPaidLabel = formatCurrency(orderDetails.totalPaid)
  const from = resendFromAddress()

  const html = await render(
    TicketReceiptEmail({
      buyerName,
      eventTitle: eventDetails.title,
      eventDateLabel,
      eventLocation: eventDetails.location ?? "Online",
      ticketCount,
      totalPaidLabel,
      walletUrl: accessUrl,
      logoUrl,
      otpCode,
    }),
  )

  const text = [
    `Confirmado. Ya tenés tus entradas para ${eventDetails.title}.`,
    buyerName ? `Hola ${buyerName},` : "Hola,",
    `Evento: ${eventDetails.title}`,
    `Fecha: ${eventDateLabel}`,
    `Lugar: ${eventDetails.location?.trim() || "Online"}`,
    `Entradas: ${ticketCount}`,
    `Total pagado: ${totalPaidLabel}`,
    `Billetera: ${accessUrl}`,
    otpCode ? `Codigo de acceso: ${otpCode}` : "",
    "Por motivos de seguridad y para evitar fraudes, tus códigos QR son dinámicos y solo pueden visualizarse desde la plataforma. No se adjuntan PDFs.",
  ]
    .filter(Boolean)
    .join("\n")

  await sendResendEmail({
    from,
    to: [email],
    subject: sanitizeEmailSubject(`Confirmado: tus entradas para ${eventDetails.title}`),
    html,
    text,
  })
}

export async function sendGuestOtpEmail(input: {
  to: string
  otp: string
  magicUrl: string
}): Promise<void> {
  await sendTicketConfirmationEmail({
    to: input.to,
    otpCode: input.otp,
    walletUrl: input.magicUrl,
    orderDetails: {
      orderId: "otp",
      ticketCount: 1,
      totalPaid: 0,
    },
    eventDetails: {
      title: "Tu entrada TokePass",
      date: new Date().toISOString(),
      location: "TokePass",
    },
  })
}

/**
 * Carga orden + evento y envía el recibo. Pensado para el webhook de MP.
 */
export async function sendPaidOrderReceiptEmail(
  admin: SupabaseClient,
  orderId: string,
  access?: { magicUrl: string; otp: string } | null,
): Promise<void> {
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, total_amount, buyer_id")
    .eq("id", orderId)
    .maybeSingle()

  if (orderError || !order) {
    logger.warn({
      context: "email/resend",
      message: "order_not_found",
      order_id: orderId,
      error: orderError?.message,
    })
    return
  }

  try {
    await expandIndividualAccessTickets(admin, orderId)
  } catch (error) {
    logger.error({
      context: "email/resend",
      message: "expand_access_tickets_failed",
      order_id: orderId,
      error,
    })
  }

  const [{ data: tickets }, { data: profile }] = await Promise.all([
    admin
      .from("tickets")
      .select(
        "id, event_id, qr_code, holder_email, holder_name, group_id, group_slot, ticket_tiers(name), event_seating_units(label, sector_name)",
      )
      .eq("order_id", orderId)
      .order("group_slot", { ascending: true, nullsFirst: true }),
    admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", order.buyer_id)
      .maybeSingle(),
  ])

  const ticketRows = tickets ?? []
  const eventId = ticketRows[0]?.event_id
  if (!eventId) {
    logger.warn({
      context: "email/resend",
      message: "no_tickets_for_receipt",
      order_id: orderId,
    })
    return
  }

  const { data: event } = await admin
    .from("events")
    .select("title, date, location, flyer_url, image_url, venues(name, location)")
    .eq("id", eventId)
    .maybeSingle()

  const venue = event?.venues as
    | { name?: string | null; location?: string | null }
    | { name?: string | null; location?: string | null }[]
    | null
  const venueRow = Array.isArray(venue) ? venue[0] : venue
  const location =
    venueRow?.name?.trim() ||
    venueRow?.location?.trim() ||
    event?.location?.trim() ||
    "A confirmar"

  const holderEmail = ticketRows
    .map((row) => row.holder_email?.trim().toLowerCase())
    .find((value) => value && value.includes("@"))
  const to = holderEmail || profile?.email?.trim().toLowerCase() || ""
  const buyerName =
    ticketRows.find((row) => row.holder_name?.trim())?.holder_name?.trim() ||
    profile?.full_name?.trim() ||
    ""

  let walletUrl: string | undefined = access?.magicUrl
  let otpCode: string | undefined = access?.otp?.trim() || undefined
  if (to && !walletUrl) {
    const { issueGuestReceiptAccess } = await import(
      "@/app/actions/guest-ticket-access"
    )
    const issued = await issueGuestReceiptAccess(order.id)
    walletUrl = issued?.magicUrl
    otpCode = issued?.otp?.trim() || undefined
  }

  const eventName = event?.title?.trim() || "Evento TokePass"
  const eventDate = event?.date
    ? formatEventDate(event.date)
    : "Fecha a confirmar"
  const bannerUrl =
    httpImageUrl(event?.flyer_url) || httpImageUrl(event?.image_url)
  const appUrl = getEmailAppUrl()
  const emailTickets = buildOrderEmailTickets({
    appUrl,
    tickets: ticketRows,
  })

  if (!to) {
    logger.warn({
      context: "email/resend",
      message: "skip_invalid_recipient",
      order_id: order.id,
    })
    return
  }

  try {
    await sendOrderTicketsEmail({
      to,
      customerName: buyerName,
      orderNumber: formatOrderNumber(order.id),
      eventName,
      eventDate,
      eventVenue: location,
      eventBannerUrl: bannerUrl,
      totalAmount: Number(order.total_amount) || 0,
      tickets: emailTickets,
      accountUrl: walletUrl || `${appUrl}/cuenta/entradas`,
    })
  } catch (error) {
    logger.error({
      context: "email/resend",
      message: "order_tickets_email_failed",
      order_id: order.id,
      error,
    })
    try {
      await sendTicketConfirmationEmail({
        to,
        buyerName,
        walletUrl,
        otpCode,
        orderDetails: {
          orderId: order.id,
          ticketCount: ticketRows.length || 1,
          totalPaid: Number(order.total_amount) || 0,
        },
        eventDetails: {
          title: eventName,
          date: event?.date || new Date().toISOString(),
          location,
        },
      })
    } catch (fallbackError) {
      logger.error({
        context: "email/resend",
        message: "receipt_fallback_email_failed",
        order_id: order.id,
        error: fallbackError,
      })
      throw fallbackError instanceof Error
        ? fallbackError
        : new Error("receipt_email_failed")
    }
    if (!getResendClient()) {
      throw error instanceof Error ? error : new Error("receipt_email_failed")
    }
  }
}

export async function sendOpsAlertEmail(input: {
  to: string
  subject: string
  text: string
}): Promise<void> {
  const email = input.to.trim().toLowerCase()
  if (!email || !email.includes("@")) return
  const client = getResendClient()
  if (!client) return
  const subject = sanitizeEmailSubject(input.subject)
  const text = input.text
  try {
    await sendResendEmail({
      from: resendFromAddress(),
      to: [email],
      subject,
      text,
      html: `<p>${escapeHtml(text).replaceAll("\n", "<br/>")}</p>`,
    })
  } catch (error) {
    logger.error({
      context: "email/resend",
      message: "ops_alert_failed",
      error: error instanceof Error ? error.message : error,
    })
  }
}

export async function sendEventAuditEmail(input: {
  to: string
  organizerName: string
  eventTitle: string
  kind: "submitted" | "approved" | "needs_revision" | "rejected"
  note?: string | null
}): Promise<void> {
  const email = input.to.trim().toLowerCase()
  if (!email || !email.includes("@")) return

  const client = getResendClient()
  if (!client) {
    logger.warn({
      context: "email/resend",
      message: "resend_api_key_missing",
      kind: input.kind,
    })
    return
  }

  const appUrl = getEmailAppUrl()
  const panelUrl = `${appUrl}/admin/events`
  const name = sanitizeEmailText(input.organizerName.trim() || "hola")
  const eventTitle = sanitizeEmailText(input.eventTitle)
  const note = input.note?.trim() ? sanitizeEmailText(input.note, 400) : ""
  const copy = {
    submitted: {
      subject: sanitizeEmailSubject(`Recibimos ${eventTitle} para revisión`),
      text: `${name}, recibimos “${eventTitle}”. El equipo de TokePass audita fecha, locación y condiciones antes de habilitar la venta. Te avisamos a este correo cuando esté activo.`,
    },
    approved: {
      subject: sanitizeEmailSubject(`${eventTitle} ya está activo en TokePass`),
      text: `${name}, “${eventTitle}” ya está publicado. La venta de entradas quedó habilitada. Podés verlo en ${panelUrl}.`,
    },
    needs_revision: {
      subject: sanitizeEmailSubject(`Hay que revisar ${eventTitle}`),
      text: `${name}, TokePass pidió cambios en “${eventTitle}” antes de habilitar la venta.${
        note ? ` Motivo: ${note}` : ""
      } Editá el evento en ${panelUrl} y volvé a enviarlo a revisión.`,
    },
    rejected: {
      subject: sanitizeEmailSubject(`${eventTitle} no fue aprobado`),
      text: `${name}, “${eventTitle}” fue rechazado y no sale a la venta.${
        note ? ` Motivo: ${note}` : ""
      } Si corresponde, editá el evento en ${panelUrl} y volvé a enviarlo a revisión.`,
    },
  }[input.kind]

  try {
    await sendResendEmail({
      from: resendFromAddress(),
      to: [email],
      subject: copy.subject,
      text: copy.text,
      html: `<p>${escapeHtml(copy.text)}</p><p><a href="${escapeHtml(panelUrl)}">Ir a Tu Panel</a></p>`,
    })
  } catch (error) {
    logger.error({
      context: "email/resend",
      message: "event_audit_email_failed",
      kind: input.kind,
      error: error instanceof Error ? error.message : error,
    })
  }
}

export async function sendPayoutSettlementEmail(input: {
  to: string
  organizerName: string
  eventTitle: string
  grossAmount: string
  serviceFeeAmount: string
  netAmount: string
  destination: string
  transferredAt: string
}): Promise<void> {
  const email = input.to.trim().toLowerCase()
  if (!email || !email.includes("@")) return

  const client = getResendClient()
  if (!client) {
    logger.warn({
      context: "email/resend",
      message: "resend_api_key_missing",
      kind: "payout_settlement",
    })
    return
  }

  const appUrl = getEmailAppUrl()
  const panelUrl = `${appUrl}/admin/finances`
  const name = sanitizeEmailText(input.organizerName.trim() || "hola")
  const eventTitle = sanitizeEmailText(input.eventTitle)
  const grossAmount = sanitizeEmailText(input.grossAmount, 40)
  const serviceFeeAmount = sanitizeEmailText(input.serviceFeeAmount, 40)
  const netAmount = sanitizeEmailText(input.netAmount, 40)
  const destination = sanitizeEmailText(input.destination, 80)
  const transferredAt = sanitizeEmailText(input.transferredAt, 40)
  const subject = sanitizeEmailSubject(
    `Comprobante de liquidación TokePass — ${eventTitle}`,
  )
  const text = [
    `${name}, TokePass liberó la liquidación de “${eventTitle}”.`,
    "",
    `Recaudación bruta: ${grossAmount}`,
    `Comisión TokePass: ${serviceFeeAmount}`,
    `Saldo neto transferido: ${netAmount}`,
    `Destino: ${destination}`,
    `Fecha de transferencia: ${transferredAt}`,
    "",
    `Podés ver el detalle en ${panelUrl}.`,
  ].join("\n")

  try {
    await sendResendEmail({
      from: resendFromAddress(),
      to: [email],
      subject,
      text,
      html: `<p>${escapeHtml(text).replaceAll("\n", "<br/>")}</p><p><a href="${escapeHtml(panelUrl)}">Ir a Recaudación</a></p>`,
    })
  } catch (error) {
    logger.error({
      context: "email/resend",
      message: "payout_settlement_email_failed",
      error: error instanceof Error ? error.message : error,
    })
  }
}
