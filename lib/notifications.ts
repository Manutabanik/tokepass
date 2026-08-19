/**
 * Notificaciones outbound (email / WhatsApp webhook).
 */

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

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel, ...body }),
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
    const response = await fetch("https://api.resend.com/emails", {
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
  ticketId: string
  ticketCode: string
}

export async function notifyLivingTicketEmail(
  payload: LivingTicketEmailPayload,
): Promise<void> {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://tokepass.app"
  const ticketUrl = `${siteUrl}/tickets/${payload.ticketId}`
  const message = [
    `Hola ${payload.holderName},`,
    `Tu entrada TokePass para ${payload.eventTitle} está lista.`,
    `Código: #${payload.ticketCode}`,
    `Abrí tu Living QR: ${ticketUrl}`,
  ].join("\n")

  try {
    if (
      await postWebhook("living_ticket_email", {
        to: payload.toEmail,
        message,
        eventTitle: payload.eventTitle,
        ticketId: payload.ticketId,
        ticketUrl,
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
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [payload.toEmail],
        subject: `Tu entrada TokePass — ${payload.eventTitle}`,
        text: message,
      }),
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
    message,
  })
}

export async function notifyPosTicketIssued(
  payload: PosTicketNotifyPayload,
): Promise<void> {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://tokepass.app"
  const links = payload.ticketIds
    .map((id) => `${siteUrl}/tickets/${id}/print`)
    .join("\n")
  const message = `Tu entrada TokePass para ${payload.eventTitle} (${payload.quantity}). Abrí el QR:\n${links}`

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
