"use server"

import { revalidatePath } from "next/cache"

import { ticketDisplayCode } from "@/lib/admin/issued-tickets"
import { logger } from "@/lib/logger"
import { notifyLivingTicketEmail } from "@/lib/notifications"
import { writeSecurityAuditLog } from "@/lib/security/audit-log"
import { SuperAdminForbiddenError } from "@/lib/superadmin-errors"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { OrderStatus, TicketStatus } from "@/types/database"

async function requireSuperAdmin() {
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
    throw new SuperAdminForbiddenError()
  }

  return { admin: createAdminClient(), actorId: user.id }
}

export type PlatformOrderTicketRow = {
  id: string
  code: string
  status: TicketStatus
  holderName: string | null
  holderEmail: string | null
  holderDni: string | null
}

export type PlatformOrderDetail = {
  orderId: string
  status: OrderStatus
  buyerName: string
  buyerEmail: string
  buyerDni: string | null
  tickets: PlatformOrderTicketRow[]
}

function asOrderStatus(value: string | null | undefined): OrderStatus {
  if (
    value === "pending" ||
    value === "paid" ||
    value === "failed" ||
    value === "expired" ||
    value === "refunded" ||
    value === "refund_processing"
  ) {
    return value
  }
  return "pending"
}

function asTicketStatus(value: string | null | undefined): TicketStatus {
  if (
    value === "pending_payment" ||
    value === "valid" ||
    value === "transferred" ||
    value === "used" ||
    value === "cancelled" ||
    value === "scanned" ||
    value === "revoked"
  ) {
    return value
  }
  return "valid"
}

export async function getPlatformOrderDetail(
  orderId: string,
): Promise<
  { success: true; data: PlatformOrderDetail } | { success: false; error: string }
> {
  try {
    const { admin } = await requireSuperAdmin()
    const id = orderId.trim()
    if (!id) return { success: false, error: "Falta el ID de la compra." }

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, status, buyer_id")
      .eq("id", id)
      .maybeSingle()

    if (orderError || !order) {
      return { success: false, error: "No encontramos esa compra." }
    }

    const [{ data: buyer }, { data: tickets, error: ticketsError }] =
      await Promise.all([
        admin
          .from("profiles")
          .select("full_name, email, dni")
          .eq("id", order.buyer_id)
          .maybeSingle(),
        admin
          .from("tickets")
          .select("id, status, holder_name, holder_email, holder_dni")
          .eq("order_id", id)
          .order("created_at", { ascending: true }),
      ])

    if (ticketsError) {
      return { success: false, error: ticketsError.message }
    }

    const ticketRows: PlatformOrderTicketRow[] = (tickets ?? []).map((ticket) => ({
      id: ticket.id,
      code: ticketDisplayCode(ticket.id),
      status: asTicketStatus(ticket.status),
      holderName: ticket.holder_name,
      holderEmail: ticket.holder_email,
      holderDni: ticket.holder_dni,
    }))

    const holderDni =
      ticketRows.find((ticket) => ticket.holderDni?.trim())?.holderDni ?? null

    return {
      success: true,
      data: {
        orderId: order.id,
        status: asOrderStatus(order.status),
        buyerName: buyer?.full_name?.trim() || "Comprador",
        buyerEmail: buyer?.email?.trim() || "",
        buyerDni: buyer?.dni?.trim() || holderDni,
        tickets: ticketRows,
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
          : "No se pudo cargar el detalle de la compra.",
    }
  }
}

export async function resendPlatformOrderTickets(
  orderId: string,
): Promise<
  | { success: true; sent: number }
  | { success: false; error: string }
> {
  try {
    const { admin, actorId } = await requireSuperAdmin()
    const id = orderId.trim()
    if (!id) return { success: false, error: "Falta el ID de la compra." }

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, status")
      .eq("id", id)
      .maybeSingle()

    if (orderError || !order) {
      return { success: false, error: "No encontramos esa compra." }
    }
    if (order.status !== "paid") {
      return {
        success: false,
        error: "Solo se pueden reenviar entradas de una compra pagada.",
      }
    }

    const { data: tickets, error: ticketsError } = await admin
      .from("tickets")
      .select("id, status, holder_name, holder_email, events(title)")
      .eq("order_id", id)

    if (ticketsError) {
      return { success: false, error: ticketsError.message }
    }

    const deliverable = (tickets ?? []).filter((ticket) => {
      const email = ticket.holder_email?.trim()
      return (
        ticket.status === "valid" &&
        Boolean(email && email.includes("@"))
      )
    })

    if (deliverable.length === 0) {
      return {
        success: false,
        error: "No hay entradas válidas con email para reenviar.",
      }
    }

    let sent = 0
    for (const ticket of deliverable) {
      const eventsJoin = ticket.events as unknown as
        | { title: string }
        | { title: string }[]
        | null
      const eventTitle =
        (Array.isArray(eventsJoin) ? eventsJoin[0]?.title : eventsJoin?.title) ||
        "Evento TokePass"

      await notifyLivingTicketEmail({
        toEmail: ticket.holder_email!.trim().toLowerCase(),
        holderName: ticket.holder_name?.trim() || "Titular",
        eventTitle,
        ticketId: ticket.id,
      })
      sent += 1
    }

    await writeSecurityAuditLog({
      actorId,
      action: "order_tickets_resend",
      entity: "order",
      entityId: id,
      details: { sent },
    })

    return { success: true, sent }
  } catch (error) {
    logger.error({
      context: "superadmin-orders",
      message: "resend_failed",
      order_id: orderId,
      error,
    })
    if (error instanceof SuperAdminForbiddenError) {
      return { success: false, error: error.message }
    }
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudieron reenviar las entradas.",
    }
  }
}

export async function voidPlatformOrder(
  orderId: string,
): Promise<
  | { success: true; ticketsCancelled: number }
  | { success: false; error: string }
> {
  try {
    const { admin, actorId } = await requireSuperAdmin()
    const id = orderId.trim()
    if (!id) return { success: false, error: "Falta el ID de la compra." }

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, status")
      .eq("id", id)
      .maybeSingle()

    if (orderError || !order) {
      return { success: false, error: "No encontramos esa compra." }
    }
    if (order.status === "refunded") {
      return { success: false, error: "Esta compra ya fue anulada." }
    }
    if (order.status !== "paid" && order.status !== "refund_processing") {
      return {
        success: false,
        error: "Solo se pueden anular compras pagadas.",
      }
    }

    const { data: cancelledCount, error: applyError } = await admin.rpc(
      "apply_order_refund_state",
      {
        p_order_id: id,
        p_order_status: "refunded",
      },
    )

    if (applyError) {
      return {
        success: false,
        error: applyError.message || "No se pudo anular la compra.",
      }
    }

    const ticketsCancelled = Number(cancelledCount ?? 0)

    await writeSecurityAuditLog({
      actorId,
      action: "order_void",
      entity: "order",
      entityId: id,
      details: {
        source: "superadmin_orders",
        ticketsCancelled,
      },
    })

    revalidatePath("/superadmin/orders")

    return { success: true, ticketsCancelled }
  } catch (error) {
    logger.error({
      context: "superadmin-orders",
      message: "void_failed",
      order_id: orderId,
      error,
    })
    if (error instanceof SuperAdminForbiddenError) {
      return { success: false, error: error.message }
    }
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "No se pudo anular la compra.",
    }
  }
}
