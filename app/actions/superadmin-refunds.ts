"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
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

  const { data: ticketRows, error: ticketRowsError } = await admin
    .from("tickets")
    .select("order_id, status")
    .eq("event_id", id)

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

  let paidOrders: Array<{ id: string; total_amount: number }> = []
  if (orderIds.length > 0) {
    const { data, error: ordersError } = await admin
      .from("orders")
      .select("id, total_amount")
      .eq("status", "paid")
      .in("id", orderIds)
    if (ordersError) throw new Error(ordersError.message)
    paidOrders = data ?? []
  }

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
 * Cancela el evento y ejecuta el protocolo atómico de reembolso masivo.
 * Protegido estrictamente para `super_admin`.
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

    const { data: rows, error } = await admin.rpc(
      "execute_mass_event_refund_tx",
      {
        p_event_id: id,
        p_actor_id: actorId,
        p_reason: cleanReason,
      },
    )

    if (error) {
      logger.error({
        context: "superadmin-refunds",
        message: "mass_refund_rpc_failed",
        eventId: id,
        actorId,
        error: error.message,
      })
      return {
        success: false,
        error: `No se pudo ejecutar el reembolso masivo: ${error.message}`,
      }
    }

    type RefundRow = {
      order_id: string
      mp_payment_id: string | null
      total_amount: number
      risk_tier: string
      organizer_id: string
      tickets_cancelled: number
    }

    const refundRows = (rows ?? []) as RefundRow[]
    const riskTier = (refundRows[0]?.risk_tier ??
      "TIER_1_CUSTODY") as OrganizerRiskTier
    const organizerId = refundRows[0]?.organizer_id ?? null

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
    let mpMocked = 0

    for (const row of refundRows) {
      const paymentId = row.mp_payment_id?.trim()
      if (!paymentId) continue

      mpAttempts += 1
      const useOrganizerToken =
        riskTier === "TIER_2_INSTANT_SPLIT" ||
        riskTier === "TIER_3_ENTERPRISE"

      const result = await mercadoPagoRefundService.refundPayment({
        paymentId,
        accessToken: useOrganizerToken ? organizerToken : null,
        amount: Number(row.total_amount),
        reason: cleanReason,
        forceMock: useOrganizerToken && !organizerToken,
      })

      if (result.success) {
        if (result.mode === "mock") mpMocked += 1
        else mpSucceeded += 1
      } else {
        mpFailed += 1
      }
    }

    const ticketsCancelled = refundRows.reduce(
      (sum, row) => sum + Number(row.tickets_cancelled ?? 0),
      0,
    )

    revalidatePath("/superadmin")
    revalidatePath("/superadmin/events")
    revalidatePath(`/superadmin/events/${id}`)
    revalidatePath("/superadmin/orders")
    revalidatePath("/superadmin/settlements")
    revalidatePath("/my-tickets")
    revalidatePath("/events")

    return {
      success: true,
      data: {
        eventId: id,
        ordersRefunded: refundRows.length,
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
