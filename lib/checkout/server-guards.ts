import "server-only"

import { CHECKOUT_BUSY_ERROR } from "@/lib/checkout/bot-guard"
import {
  GUEST_TICKET_CAP_ERROR,
  PAID_TICKET_STATUSES,
  generateGuestOrderToken,
  guestTicketCapExceeded,
  isGuestOrderToken,
  uniqueTicketCount,
} from "@/lib/checkout/guest-token"
import { getCheckoutIpLimiter } from "@/lib/checkout/memory-rate-limit"
import {
  sanitizeDeviceHash,
  sanitizeDwellMs,
  type CheckoutRequestContext,
} from "@/lib/checkout/request-context"
import { logger } from "@/lib/logger"
import { resolvePurchaseLimit } from "@/lib/checkout-limits"
import { createAdminClient } from "@/lib/supabase/admin"

export async function checkoutIpBurstBlocked(
  ctx: CheckoutRequestContext,
): Promise<boolean> {
  return !getCheckoutIpLimiter().consume(ctx.ip)
}

export async function checkoutFailuresBlocked(
  ctx: CheckoutRequestContext,
): Promise<boolean> {
  return checkoutIpBurstBlocked(ctx)
}

export async function recordCheckoutFailure(
  _ctx: CheckoutRequestContext,
): Promise<void> {
  // The in-memory IP limiter already counted this purchase attempt.
}

export async function assertGuestTicketCap(input: {
  eventId: string
  dni: string
  email: string
  quantity: number
  maxTicketsPerUser: number | null | undefined
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const max = resolvePurchaseLimit(input.maxTicketsPerUser)
  if (max == null) return { ok: true }

  const admin = createAdminClient()
  const dni = input.dni.trim()
  const email = input.email.trim().toLowerCase()

  const [dniResult, emailResult] = await Promise.all([
    dni
      ? admin
          .from("tickets")
          .select("id")
          .eq("event_id", input.eventId)
          .eq("holder_dni", dni)
          .in("status", [...PAID_TICKET_STATUSES])
      : Promise.resolve({ data: [] as Array<{ id: string }>, error: null }),
    email
      ? admin
          .from("tickets")
          .select("id")
          .eq("event_id", input.eventId)
          .eq("holder_email", email)
          .in("status", [...PAID_TICKET_STATUSES])
      : Promise.resolve({ data: [] as Array<{ id: string }>, error: null }),
  ])

  if (dniResult.error || emailResult.error) {
    logger.error({
      context: "checkout/identity-cap",
      message: "count_failed",
      error: dniResult.error?.message ?? emailResult.error?.message,
    })
    return {
      ok: false,
      error: "No pudimos validar el límite de entradas. Intentá de nuevo.",
    }
  }

  const existingTickets = uniqueTicketCount([
    ...(dniResult.data ?? []),
    ...(emailResult.data ?? []),
  ])

  if (guestTicketCapExceeded(existingTickets, input.quantity, max)) {
    return { ok: false, error: GUEST_TICKET_CAP_ERROR }
  }
  return { ok: true }
}

export async function persistCheckoutSecurityEvent(input: {
  orderId: string
  eventId: string
  buyerId: string
  ctx: CheckoutRequestContext
  deviceHash?: string | null
  dwellMs?: number | null
}): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from("checkout_security_events").insert({
      order_id: input.orderId,
      event_id: input.eventId,
      buyer_id: input.buyerId,
      ip: input.ctx.ip,
      user_agent: input.ctx.userAgent,
      device_hash: sanitizeDeviceHash(input.deviceHash),
      dwell_ms: sanitizeDwellMs(input.dwellMs),
      captcha_provider: "none",
      captcha_score: null,
    })
  } catch (error) {
    logger.error({
      context: "checkout/security-event",
      message: "persist_failed",
      error,
    })
  }
}

export async function persistOrderCustomerPhone(input: {
  orderId: string
  phone: string
}): Promise<void> {
  const phone = input.phone.trim()
  if (!phone) return
  try {
    const admin = createAdminClient()
    await admin
      .from("orders")
      .update({ customer_phone: phone })
      .eq("id", input.orderId)
  } catch (error) {
    logger.error({
      context: "checkout/customer-phone",
      message: "persist_failed",
      error,
    })
  }
}

export async function persistOrderGuestToken(orderId: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data: existing } = await admin
      .from("orders")
      .select("guest_token")
      .eq("id", orderId)
      .maybeSingle()
    const current = existing?.guest_token?.trim() ?? ""
    if (isGuestOrderToken(current)) return current

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = generateGuestOrderToken()
      const { error } = await admin
        .from("orders")
        .update({ guest_token: token })
        .eq("id", orderId)
      if (!error) return token
      if (error.code !== "23505") {
        logger.error({
          context: "checkout/guest-token",
          message: "persist_failed",
          error: error.message,
        })
        return null
      }
    }
    return null
  } catch (error) {
    logger.error({
      context: "checkout/guest-token",
      message: "persist_failed",
      error,
    })
    return null
  }
}

export { CHECKOUT_BUSY_ERROR }
