"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { isGatewayRefundSuccess, isLocallyRefundablePayment } from "@/lib/legal/withdrawal"
import { mercadoPagoRefundService } from "@/lib/mercadopago/refund-service"
import { logger } from "@/lib/logger"
import { SuperAdminForbiddenError } from "@/lib/superadmin-errors"
import type { EventStatus, OrganizerRiskTier } from "@/types/database"

async function requireSuperAdminActor() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new SuperAdminForbiddenError("Debés iniciar sesión.")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role !== "super_admin") {
    const admin = createAdminClient()
    await admin.from("platform_ops_audit").insert({
      actor_id: user.id,
      action: "MASS_REFUND_UNAUTHORIZED",
      reason: "Intento de acceso no autorizado a Mass Refund Engine",
      metadata: { blocked: true },
    })
    throw new SuperAdminForbiddenError()
  }

  return { admin: createAdminClient(), actorId: user.id }
}

export type MassRefundPreview = {
  eventId: string
  eventTitle: string
  eventDate: string
  eventLocation: string
  eventStatus: EventStatus
  organizerId: string
  organizerName: string
  riskTier: OrganizerRiskTier
  paidOrders: number
  validTickets: number
  refundableAmount: number
}

export type MassRefundResult =
  | {
      success: true
      data: {
        eventId: string
        ordersRefunded: number
        ticketsCancelled: number
        mpAttempts: number
        mpSucceeded: number
        mpFailed: number
        mpMocked: number
        riskTier: OrganizerRiskTier
      }
    }
  | { success: false; error: string }

async function loadPaidEventOrders(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
) {
  const { data: ticketRows, error: ticketRowsError } = await admin
    .from("tickets")
    .select("order_id, status")
    .eq("event_id", eventId)

  if (ticketRowsError) throw new Error(ticketRowsError.message)

  const orderIds = [
    ...new Set(
      (ticketRows ?? [])
        .map((ticket) => ticket.order_id)
        .filter((orderId): orderId is string => Boolean(orderId)),
    ),
  ]

  const validTickets = (ticketRows ?? []).filter((ticket) =>
    ["valid", "used", "scanned", "pending_payment"].includes(ticket.status),
  ).length

  if (orderIds.length === 0) {
    return { validTickets, paidOrders: [] as Array<{
      id: string
      total_amount: number
      mp_payment_id: string | null
      payment_method: string
    }> }
  }

  const { data, error: ordersError } = await admin
    .from("orders")
    .select("id, total_amount, mp_payment_id, payment_method")
    .eq("status", "paid")
    .in("id", orderIds)

  if (ordersError) throw new Error(ordersError.message)
  return { validTickets, paidOrders: data ?? [] }
}

export async function getMassRefundPreview(
  eventId: string,
): Promise<MassRefundPreview | null> {
  const { admin } = await requireSuperAdminActor()
  const id = eventId.trim()
  if (!id) return null

  const { data: event, error } = await admin
    .from("events")
    .select(
      "id, title, date, location, status, organizer_id, profiles!events_organizer_id_fkey(full_name, email, risk_tier)",
    )
    .eq("id", id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!event) return null

  type EventRow = {
    id: string
    title: string
    date: string
    location: string
    status: EventStatus
    organizer_id: string
    profiles: {
      full_name: string | null
      email: string
      risk_tier: OrganizerRiskTier | null
    } | null
  }

  const row = event as unknown as EventRow
  const { validTickets, paidOrders } = await loadPaidEventOrders(admin, id)

  return {
    eventId: row.id,
    eventTitle: row.title,
    eventDate: row.date,
    eventLocation: row.location,
    eventStatus: row.status,
    organizerId: row.organizer_id,
    organizerName:
      row.profiles?.full_name?.trim() || row.profiles?.email || "Productora",
    riskTier: row.profiles?.risk_tier ?? "TIER_1_CUSTODY",
    paidOrders: paidOrders.length,
    validTickets,
    refundableAmount: paidOrders.reduce(
      (sum, order) => sum + Number(order.total_amount ?? 0),
      0,
    ),
  }
}

/**
 * Cancela el evento para cortar ventas. Cada orden `paid` solo pasa a
 * `refunded` si la pasarela confirma el reembolso (HTTP 200/201).
 */
export async function executeMassEventRefund(
  eventId: string,
  reason: string,
): Promise<MassRefundResult> {
  try {
    const { admin, actorId } = await requireSuperAdminActor()
    const id = eventId.trim()
    const cleanReason = reason.trim()

    if (!id) {
      return { success: false, error: "Evento inválido." }
    }
    if (cleanReason.length < 8) {
      return {
        success: false,
        error: "Indicá un motivo legal de al menos 8 caracteres.",
      }
    }

    const { data: event, error: eventError } = await admin
      .from("events")
      .select(
        "id, organizer_id, status, profiles!events_organizer_id_fkey(risk_tier)",
      )
      .eq("id", id)
      .maybeSingle()

    if (eventError || !event) {
      return { success: false, error: "Evento no encontrado." }
    }

    type EventRow = {
      id: string
      organizer_id: string
      status: EventStatus
      profiles: { risk_tier: OrganizerRiskTier | null } | null
    }
    const row = event as unknown as EventRow
    const riskTier = row.profiles?.risk_tier ?? "TIER_1_CUSTODY"
    const organizerId = row.organizer_id

    const { paidOrders } = await loadPaidEventOrders(admin, id)

    if (row.status !== "cancelled") {
      const { error: cancelError } = await admin
        .from("events")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)

      if (cancelError) {
        return {
          success: false,
          error: `No se pudo cancelar el evento: ${cancelError.message}`,
        }
      }
    }

    await admin.from("platform_ops_audit").insert({
      actor_id: actorId,
      action: "MASS_REFUND_GATEWAY_FIRST",
      event_id: id,
      organizer_id: organizerId,
      reason: cleanReason,
      metadata: {
        paid_orders: paidOrders.length,
        risk_tier: riskTier,
      },
    })

    let organizerToken: string | null = null
    if (
      organizerId &&
      (riskTier === "TIER_2_INSTANT_SPLIT" ||
        riskTier === "TIER_3_ENTERPRISE")
    ) {
      const { data: organizer } = await admin
        .from("organizer_mp_connect")
        .select("access_token")
        .eq("organizer_id", organizerId)
        .maybeSingle()
      organizerToken = organizer?.access_token ?? null
    }

    let mpAttempts = 0
    let mpSucceeded = 0
    let mpFailed = 0
    const mpMocked = 0
    let ordersRefunded = 0
    let ticketsCancelled = 0

    for (const order of paidOrders) {
      const paymentId = order.mp_payment_id?.trim() || null
      const localRefund = isLocallyRefundablePayment({
        paymentMethod: order.payment_method,
        mpPaymentId: paymentId,
      })

      let gatewayOk = localRefund
      if (!localRefund) {
        if (!paymentId) {
          mpFailed += 1
          continue
        }

        const useOrganizerToken =
          riskTier === "TIER_2_INSTANT_SPLIT" ||
          riskTier === "TIER_3_ENTERPRISE"

        if (useOrganizerToken && !organizerToken) {
          logger.error({
            context: "superadmin-refunds",
            message: "mass_refund_missing_organizer_token",
            eventId: id,
            orderId: order.id,
          })
          mpFailed += 1
          continue
        }

        mpAttempts += 1
        const result = await mercadoPagoRefundService.refundPayment({
          paymentId,
          accessToken: useOrganizerToken ? organizerToken : null,
          amount: Number(order.total_amount),
          reason: cleanReason,
        })

        if (!isGatewayRefundSuccess(result)) {
          mpFailed += 1
          continue
        }
        mpSucceeded += 1
        gatewayOk = true
      }

      if (!gatewayOk) continue

      const { data: cancelledCount, error: applyError } = await admin.rpc(
        "apply_order_refund_state",
        {
          p_order_id: order.id,
          p_order_status: "refunded",
        },
      )

      if (applyError) {
        logger.error({
          context: "superadmin-refunds",
          message: "mass_refund_db_apply_failed",
          eventId: id,
          orderId: order.id,
          error: applyError.message,
        })
        mpFailed += 1
        continue
      }

      ordersRefunded += 1
      ticketsCancelled += Number(cancelledCount ?? 0)
    }

    revalidatePath("/superadmin")
    revalidatePath("/superadmin/events")
    revalidatePath(`/superadmin/events/${id}`)
    revalidatePath("/superadmin/orders")
    revalidatePath("/superadmin/settlements")
    revalidatePath("/cuenta/entradas")
    revalidatePath("/events")

    return {
      success: true,
      data: {
        eventId: id,
        ordersRefunded,
        ticketsCancelled,
        mpAttempts,
        mpSucceeded,
        mpFailed,
        mpMocked,
        riskTier,
      },
    }
  } catch (error) {
    if (error instanceof SuperAdminForbiddenError) {
      return { success: false, error: error.message }
    }
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al ejecutar el protocolo de reembolso.",
    }
  }
}
