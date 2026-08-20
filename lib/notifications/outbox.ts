import "server-only"

import { after } from "next/server"

import { sendPaidOrderReceiptEmail } from "@/lib/email/resend"
import {
  postNotificationWebhook,
  sendEmailWithFailover,
} from "@/lib/email/providers"
import { escapeHtml, sanitizeEmailSubject } from "@/lib/email/sanitize"
import { logger } from "@/lib/logger"
import {
  NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
  notificationOutboxBackoffSeconds,
} from "@/lib/notifications/outbox-backoff"
import { notifyGobiOrderPaid } from "@/lib/services/notify-gobi-order-paid"
import { isGobiConfigured } from "@/lib/services/gobi-dispatcher"
import { createAdminClient } from "@/lib/supabase/admin"
import { isOpenClaimReceiverEmail } from "@/lib/ticket-share"
import type {
  Json,
  NotificationOutbox,
  NotificationOutboxType,
} from "@/types/database"

export { NOTIFICATION_OUTBOX_MAX_ATTEMPTS, notificationOutboxBackoffSeconds }

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export function scheduleNotificationOutboxDrain(limit = 10): void {
  try {
    after(() => {
      void drainNotificationOutbox(limit).catch((error: unknown) => {
        logger.error({
          context: "notifications/outbox",
          message: "drain_after_failed",
          error,
        })
      })
    })
  } catch (error) {
    logger.warn({
      context: "notifications/outbox",
      message: "drain_after_unavailable",
      error,
    })
  }
}

export async function attachTransferClaimUrl(
  transferId: string,
  claimUrl: string,
): Promise<void> {
  const id = transferId.trim()
  const url = claimUrl.trim()
  if (!id || !url) return

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("notification_outbox")
    .select("id, payload")
    .eq("type", "ticket_transfer")
    .filter("payload->>transfer_id", "eq", id)
    .maybeSingle()

  if (error || !data) return

  const payload = {
    ...asRecord(data.payload),
    claim_url: url,
  }

  await admin
    .from("notification_outbox")
    .update({ payload })
    .eq("id", data.id)
}

export async function requeuePosIssueNotifications(input: {
  orderId: string
  eventTitle?: string
  ticketIds?: string[]
  phone?: string | null
  email?: string | null
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.rpc("requeue_notification_outbox", {
    p_order_id: input.orderId,
    p_type: "pos_issue",
    p_payload: {
      event_title: input.eventTitle ?? "Evento TokePass",
      ticket_ids: input.ticketIds ?? [],
      phone: input.phone ?? null,
      email: input.email ?? null,
    },
  })

  if (error) {
    throw new Error(error.message)
  }
}

async function markProcessed(id: string): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from("notification_outbox")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", id)
}

async function markFailed(
  id: string,
  attempts: number,
  errorMessage: string,
): Promise<void> {
  const admin = createAdminClient()
  const dead = attempts >= NOTIFICATION_OUTBOX_MAX_ATTEMPTS
  const delaySeconds = notificationOutboxBackoffSeconds(attempts)
  await admin
    .from("notification_outbox")
    .update({
      status: dead ? "dead" : "failed",
      last_error: errorMessage.slice(0, 500),
      available_at: dead
        ? new Date().toISOString()
        : new Date(Date.now() + delaySeconds * 1000).toISOString(),
    })
    .eq("id", id)
    .neq("status", "processed")
}

async function deliverTransferEmail(payload: Record<string, unknown>): Promise<void> {
  const receiverEmail = asString(payload.receiver_email).trim().toLowerCase()
  if (!receiverEmail || isOpenClaimReceiverEmail(receiverEmail)) {
    return
  }
  if (!receiverEmail.includes("@")) {
    return
  }

  const eventTitle = asString(payload.event_title) || "Evento TokePass"
  const claimUrl = asString(payload.claim_url).trim()
  const text = claimUrl
    ? `Te enviaron una entrada para ${eventTitle}. Reclamala en TokePass: ${claimUrl}`
    : `Te enviaron una entrada para ${eventTitle}. Reclamala en TokePass, Mis entradas.`

  await sendEmailWithFailover({
    to: receiverEmail,
    subject: sanitizeEmailSubject(`Te enviaron una entrada — ${eventTitle}`),
    text,
    html: `<p>${escapeHtml(text)}</p>`,
  })
}

async function lookupOrderEmail(orderId: string): Promise<string> {
  const admin = createAdminClient()
  const [{ data: tickets }, { data: order }] = await Promise.all([
    admin.from("tickets").select("holder_email").eq("order_id", orderId),
    admin.from("orders").select("buyer_id").eq("id", orderId).maybeSingle(),
  ])

  const holder = (tickets ?? [])
    .map((row) => row.holder_email?.trim().toLowerCase())
    .find((value) => value && value.includes("@"))
  if (holder) return holder

  if (!order?.buyer_id) return ""

  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", order.buyer_id)
    .maybeSingle()

  return profile?.email?.trim().toLowerCase() || ""
}

async function deliverOrderEmail(
  type: NotificationOutboxType,
  orderId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  const eventTitle = asString(payload.event_title) || "Evento TokePass"
  const fallback = {
    subject: sanitizeEmailSubject(
      type === "pos_issue"
        ? `Tu entrada TokePass — ${eventTitle}`
        : `Tus entradas para ${eventTitle}`,
    ),
    text: `Tus entradas para ${eventTitle} ya estan listas. Entra a Mis entradas en TokePass.`,
  }

  if (orderId) {
    try {
      const admin = createAdminClient()
      await sendPaidOrderReceiptEmail(admin, orderId)
      return
    } catch (error) {
      const email =
        asString(payload.email).trim().toLowerCase() ||
        (await lookupOrderEmail(orderId))
      if (!email || !email.includes("@")) {
        throw error
      }
      await sendEmailWithFailover(
        { to: email, ...fallback },
        { skipPrimary: true },
      )
      return
    }
  }

  const email = asString(payload.email).trim().toLowerCase()
  if (!email || !email.includes("@")) {
    return
  }

  await sendEmailWithFailover({
    to: email,
    ...fallback,
  })
}

async function deliverWhatsApp(
  row: NotificationOutbox,
  payload: Record<string, unknown>,
): Promise<void> {
  if (row.type === "ticket_transfer") {
    const receiverEmail = asString(payload.receiver_email)
    if (isOpenClaimReceiverEmail(receiverEmail)) return
    await postNotificationWebhook("ticket_transfer_whatsapp", payload)
    return
  }

  if (!row.order_id) {
    const posted = await postNotificationWebhook(row.type, payload)
    if (!posted && !isGobiConfigured()) return
    if (!posted) throw new Error("whatsapp_provider_unavailable")
    return
  }

  const admin = createAdminClient()
  const outcome = await notifyGobiOrderPaid(admin, row.order_id, null, {
    throwOnError: false,
  })

  if (outcome.status === "sent") return
  if (outcome.status === "skipped") {
    if (outcome.reason === "not_configured") {
      const posted = await postNotificationWebhook(row.type, {
        ...payload,
        order_id: row.order_id,
      })
      if (posted) return
      return
    }
    return
  }

  try {
    if (
      await postNotificationWebhook(row.type, {
        ...payload,
        order_id: row.order_id,
        error: outcome.error,
      })
    ) {
      return
    }
  } catch {
    // el error primario de Gobi manda
  }

  throw new Error(outcome.error)
}

async function deliverRow(row: NotificationOutbox): Promise<void> {
  const payload = asRecord(row.payload)

  if (row.channel === "email") {
    if (row.type === "ticket_transfer") {
      await deliverTransferEmail(payload)
      return
    }
    await deliverOrderEmail(row.type, row.order_id, payload)
    return
  }

  await deliverWhatsApp(row, payload)
}

export async function drainNotificationOutbox(
  limit = 15,
): Promise<{ processed: number; failed: number }> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc("claim_notification_outbox", {
    p_limit: limit,
  })

  if (error) {
    logger.error({
      context: "notifications/outbox",
      message: "claim_failed",
      error: error.message,
    })
    throw new Error(error.message)
  }

  let processed = 0
  let failed = 0

  for (const row of data ?? []) {
    try {
      await deliverRow(row)
      await markProcessed(row.id)
      processed += 1
    } catch (deliverError) {
      const message =
        deliverError instanceof Error ? deliverError.message : "deliver_failed"
      logger.error({
        context: "notifications/outbox",
        message: "deliver_failed",
        id: row.id,
        type: row.type,
        channel: row.channel,
        attempts: row.attempts,
        error: message,
      })
      await markFailed(row.id, Number(row.attempts ?? 0), message)
      failed += 1
    }
  }

  return { processed, failed }
}
