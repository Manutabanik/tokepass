"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { resolveEventStartAt } from "@/lib/event-status"
import {
  isEventFarEnoughForWithdrawal,
  isGatewayRefundSuccess,
  isLocallyRefundablePayment,
  isWithinWithdrawalWindow,
  normalizeWithdrawalEmail,
  WITHDRAWAL_DAYS,
  WITHDRAWAL_MIN_HOURS_BEFORE_EVENT,
} from "@/lib/legal/withdrawal"
import { logger } from "@/lib/logger"
import { mercadoPagoRefundService } from "@/lib/mercadopago/refund-service"
import { consumeRateLimit } from "@/lib/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type SubmitWithdrawalResult =
  | {
      success: true
      requestId: string
      orderStatus: "refund_processing" | "refunded"
      moneyMoved: boolean
    }
  | { success: false; error: string }

const GENERIC_NOT_FOUND =
  "No encontramos una compra pagada con esos datos. Revisá el número de orden y el correo."

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

export async function submitWithdrawalRequest(input: {
  orderId: string
  email: string
  reason?: string
}): Promise<SubmitWithdrawalResult> {
  const orderId = input.orderId.trim()
  const email = normalizeWithdrawalEmail(input.email)
  const reason = input.reason?.trim() || null

  if (!isUuid(orderId) || !email || !email.includes("@")) {
    return { success: false, error: GENERIC_NOT_FOUND }
  }

  const requestHeaders = await headers()
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip")?.trim() ||
    "unknown"

  const allowed = await consumeRateLimit({
    bucketKey: `withdrawal:${ip}:${email}`,
    limit: 8,
    windowSeconds: 3600,
    useAdmin: true,
  })
  if (!allowed) {
    return {
      success: false,
      error: "Demasiados intentos. Esperá un rato y volvé a probar.",
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select(
      "id, buyer_id, status, created_at, mp_payment_id, payment_method, total_amount",
    )
    .eq("id", orderId)
    .maybeSingle()

  if (orderError || !order) {
    return { success: false, error: GENERIC_NOT_FOUND }
  }

  const { data: buyer } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", order.buyer_id)
    .maybeSingle()

  const { data: tickets, error: ticketsError } = await admin
    .from("tickets")
    .select("id, event_id, holder_email, status")
    .eq("order_id", order.id)

  if (ticketsError) {
    return { success: false, error: "No pudimos validar la compra. Intentá de nuevo." }
  }

  const emailMatchesBuyer =
    normalizeWithdrawalEmail(buyer?.email ?? "") === email
  const emailMatchesHolder = (tickets ?? []).some(
    (ticket) => normalizeWithdrawalEmail(ticket.holder_email ?? "") === email,
  )
  const ownsAsAuthUser = Boolean(user && user.id === order.buyer_id)

  if (!ownsAsAuthUser && !emailMatchesBuyer && !emailMatchesHolder) {
    return { success: false, error: GENERIC_NOT_FOUND }
  }

  if (order.status === "refunded") {
    return { success: false, error: "Esta compra ya fue reembolsada." }
  }
  if (order.status === "refund_processing") {
    return {
      success: false,
      error: "Ya estamos procesando la devolución de esta compra.",
    }
  }
  if (order.status !== "paid") {
    return { success: false, error: GENERIC_NOT_FOUND }
  }

  if (!isWithinWithdrawalWindow(order.created_at)) {
    return {
      success: false,
      error: `El plazo de ${WITHDRAWAL_DAYS} días desde la compra ya venció.`,
    }
  }

  const eventId = tickets?.[0]?.event_id
  if (!eventId) {
    return {
      success: false,
      error: "La compra no tiene entradas asociadas para anular.",
    }
  }

  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id, date, schedule_days")
    .eq("id", eventId)
    .maybeSingle()

  if (eventError || !event) {
    return { success: false, error: "No pudimos validar la fecha del evento." }
  }

  const eventStart = resolveEventStartAt({
    date: event.date,
    scheduleDays: event.schedule_days,
  })
  if (!eventStart) {
    return { success: false, error: "No pudimos validar la fecha del evento." }
  }
  if (!isEventFarEnoughForWithdrawal(eventStart)) {
    return {
      success: false,
      error: `Solo se puede ejercer el arrepentimiento si faltan al menos ${WITHDRAWAL_MIN_HOURS_BEFORE_EVENT} horas para el inicio del evento.`,
    }
  }

  const requestUserId = user?.id ?? order.buyer_id ?? null

  const { data: requestRow, error: insertError } = await admin
    .from("refund_requests")
    .insert({
      order_id: order.id,
      user_id: requestUserId,
      reason,
      status: "approved",
    })
    .select("id")
    .maybeSingle()

  if (insertError || !requestRow) {
    if (insertError?.code === "23505") {
      return {
        success: false,
        error: "Ya hay una solicitud de arrepentimiento para esta orden.",
      }
    }
    logger.error({
      context: "withdrawal",
      message: "refund_request_insert_failed",
      orderId: order.id,
      error: insertError?.message,
    })
    return { success: false, error: "No pudimos registrar la solicitud." }
  }

  const { error: processingError } = await admin.rpc("apply_order_refund_state", {
    p_order_id: order.id,
    p_order_status: "refund_processing",
  })

  if (processingError) {
    logger.error({
      context: "withdrawal",
      message: "refund_processing_state_failed",
      orderId: order.id,
      error: processingError.message,
    })
    await admin
      .from("refund_requests")
      .update({ status: "rejected" })
      .eq("id", requestRow.id)
    return {
      success: false,
      error: "No pudimos anular las entradas. Contactá a soporte.",
    }
  }

  let moneyMoved = false
  let orderStatus: "refund_processing" | "refunded" = "refund_processing"

  const localRefund = isLocallyRefundablePayment({
    paymentMethod: order.payment_method,
    mpPaymentId: order.mp_payment_id,
  })

  if (localRefund) {
    const { error: localError } = await admin.rpc("apply_order_refund_state", {
      p_order_id: order.id,
      p_order_status: "refunded",
    })
    if (!localError) {
      moneyMoved = true
      orderStatus = "refunded"
    }
  } else if (order.mp_payment_id?.trim()) {
    const mpResult = await mercadoPagoRefundService.refundPayment({
      paymentId: order.mp_payment_id,
      amount: Number(order.total_amount),
      reason: reason ?? "Boton de arrepentimiento",
    })
    if (isGatewayRefundSuccess(mpResult)) {
      const { error: refundedError } = await admin.rpc(
        "apply_order_refund_state",
        {
          p_order_id: order.id,
          p_order_status: "refunded",
        },
      )
      if (!refundedError) {
        moneyMoved = true
        orderStatus = "refunded"
      }
    } else {
      logger.error({
        context: "withdrawal",
        message: "mp_refund_pending_after_qr_cancel",
        orderId: order.id,
        error: "success" in mpResult && !mpResult.success ? mpResult.error : "not_accepted",
      })
    }
  }

  revalidatePath("/arrepentimiento")
  revalidatePath("/cuenta/compras")
  revalidatePath("/cuenta/entradas")
  revalidatePath("/superadmin/orders")

  return {
    success: true,
    requestId: requestRow.id,
    orderStatus,
    moneyMoved,
  }
}
