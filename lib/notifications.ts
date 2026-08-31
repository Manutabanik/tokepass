/**
 * Notificaciones outbound (email / WhatsApp webhook).
 */

import {
  EMAIL_WALLET_CTA,
  LIVING_QR_EMAIL_DISCLAIMER,
  walletReceiptUrl,
} from "@/lib/email/receipt-copy"
import { escapeHtml } from "@/lib/email/sanitize"
import { circuitFetch } from "@/lib/resilience/circuit-breaker"

export type TicketTransferNotifyPayload = {
  receiverEmail: string
  eventTitle: string
  senderUserId: string
  claimUrl?: string
}

export type PosTicketNotifyPayload = {
  phone?: string | null
  email?: string | null
  eventTitle: string
  ticketIds: string[]
  quantity: number
}

async function postWebhook(
  channel: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL?.trim()
  if (!webhookUrl) return false

  const response = await circuitFetch("whatsapp", webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel, ...body }),
    signal: AbortSignal.timeout(8000),
  })

  if (!response.ok) {
    throw new Error(`Webhook notify failed: ${response.status}`)
  }
  return true
}

export async function notifyTicketTransfer(
  payload: TicketTransferNotifyPayload,
): Promise<void> {
  const message = payload.claimUrl
    ? `Te enviaron una entrada para ${payload.eventTitle}. Reclamala en TokePass: ${payload.claimUrl}`
    : `Te han enviado una entrada para ${payload.eventTitle}. Reclamala en TokePass, Mis entradas.`

  try {
    if (
      await postWebhook("ticket_transfer", {
        to: payload.receiverEmail,
        message,
        eventTitle: payload.eventTitle,
        senderUserId: payload.senderUserId,
      })
    ) {
      return
    }
  } catch {
    // fallback abajo
  }

  const resendKey = process.env.RESEND_API_KEY?.trim()
  const fromEmail =
    process.env.RESEND_FROM_EMAIL?.trim() || "TokePass <onboarding@resend.dev>"

  if (resendKey) {
    const response = await circuitFetch("resend", "https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [payload.receiverEmail],
        subject: `Te enviaron una entrada — ${payload.eventTitle}`,
        text: message,
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Resend failed: ${response.status} ${body}`)
    }
    return
  }

  console.info("[notifyTicketTransfer]", {
    to: payload.receiverEmail,
    message,
  })
}

export type LivingTicketEmailPayload = {
  toEmail: string
  holderName: string
  eventTitle: string
  ticketId?: string
  ticketCount?: number
}

export async function notifyLivingTicketEmail(
  payload: LivingTicketEmailPayload,
): Promise<void> {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://tokepass.com.ar"
  const walletUrl = walletReceiptUrl(siteUrl)
  const message = [
    payload.holderName.trim()
      ? `¡Hola, ${payload.holderName.trim()}!`
      : "¡Hola!",
    `Tu entrada para ${payload.eventTitle} ya está en tu billetera TokePass.`,
    LIVING_QR_EMAIL_DISCLAIMER,
    `${EMAIL_WALLET_CTA}: ${walletUrl}`,
  ].join("\n")
  const safeName = escapeHtml(payload.holderName.trim())
  const safeTitle = escapeHtml(payload.eventTitle)
  const html = [
    `<p>${safeName ? `¡Hola, ${safeName}!` : "¡Hola!"}</p>`,
    `<p>Tu entrada para <strong>${safeTitle}</strong> ya está en tu billetera TokePass.</p>`,
    `<p style="background:#3F1D1D;color:#F3F4F6;padding:12px 14px;border-radius:12px;">${escapeHtml(LIVING_QR_EMAIL_DISCLAIMER)}</p>`,
    `<p><a href="${escapeHtml(walletUrl)}" style="display:inline-block;background:#10B981;color:#fff;padding:14px 28px;border-radius:12px;font-weight:700;text-decoration:none;">${escapeHtml(EMAIL_WALLET_CTA)}</a></p>`,
  ].join("")

  try {
    if (
      await postWebhook("living_ticket_email", {
        to: payload.toEmail,
        message,
        eventTitle: payload.eventTitle,
        ticketId: payload.ticketId,
        walletUrl,
      })
    ) {
      return
    }
  } catch {
    // fallback abajo
  }

  const resendKey = process.env.RESEND_API_KEY?.trim()
  const fromEmail =
    process.env.RESEND_FROM_EMAIL?.trim() || "TokePass <onboarding@resend.dev>"

  if (resendKey) {
    const response = await circuitFetch("resend", "https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [payload.toEmail],
        subject: `Recibo TokePass — ${payload.eventTitle}`,
        text: message,
        html,
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Resend failed: ${response.status} ${body}`)
    }
    return
  }

  console.info("[notifyLivingTicketEmail]", {
    to: payload.toEmail,
    ticketId: payload.ticketId,
    walletUrl,
  })
}

export async function notifyPosTicketIssued(
  payload: PosTicketNotifyPayload,
): Promise<void> {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://tokepass.com.ar"
  const walletUrl = walletReceiptUrl(siteUrl)
  const message = [
    `Tu entrada TokePass para ${payload.eventTitle} (${payload.quantity}) ya está en tu billetera.`,
    LIVING_QR_EMAIL_DISCLAIMER,
    `${EMAIL_WALLET_CTA}: ${walletUrl}`,
  ].join("\n")

  try {
    if (
      await postWebhook("pos_ticket_issued", {
        to: payload.phone || payload.email,
        phone: payload.phone,
        email: payload.email,
        message,
        eventTitle: payload.eventTitle,
        ticketIds: payload.ticketIds,
      })
    ) {
      return
    }
  } catch {
    // fallback log
  }

  console.info("[notifyPosTicketIssued]", {
    phone: payload.phone,
    email: payload.email,
    message,
  })
}
