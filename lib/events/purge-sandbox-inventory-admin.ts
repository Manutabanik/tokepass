import "server-only"

import { sandboxOrderIdsFromTickets } from "@/lib/events/purge-sandbox-inventory"
import { logger } from "@/lib/logger"
import { createAdminClient } from "@/lib/supabase/admin"

async function cancelLeftoverTestTickets(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
): Promise<void> {
  const { error } = await admin
    .from("tickets")
    .update({ status: "cancelled" })
    .eq("event_id", eventId)
    .eq("is_test", true)
    .neq("status", "cancelled")

  if (error) {
    logger.error({
      context: "events/publish",
      message: "sandbox_ticket_cancel_failed",
      eventId,
      error: error.message,
    })
  }
}

async function expireSandboxOrders(
  admin: ReturnType<typeof createAdminClient>,
  orderIds: string[],
): Promise<number> {
  if (orderIds.length === 0) return 0

  const { error: deleteError } = await admin
    .from("orders")
    .delete()
    .in("id", orderIds)
    .eq("is_test", true)

  if (!deleteError) return orderIds.length

  const { error: expireError } = await admin
    .from("orders")
    .update({
      status: "expired",
      is_test: true,
      environment: "test",
    })
    .in("id", orderIds)
    .eq("is_test", true)

  if (expireError) {
    logger.error({
      context: "events/publish",
      message: "sandbox_order_expire_failed",
      error: expireError.message,
    })
    return 0
  }

  return orderIds.length
}

/** Borra tickets y órdenes de prueba al pasar el evento a publicado. */
export async function purgeSandboxInventoryForEvent(
  eventId: string,
): Promise<{ ticketsPurged: number; ordersPurged: number }> {
  const clean = eventId.trim()
  if (!clean) return { ticketsPurged: 0, ordersPurged: 0 }

  const admin = createAdminClient()
  const { data: testTickets, error: loadError } = await admin
    .from("tickets")
    .select("id, order_id")
    .eq("event_id", clean)
    .eq("is_test", true)

  if (loadError) {
    logger.error({
      context: "events/publish",
      message: "sandbox_ticket_lookup_failed",
      eventId: clean,
      error: loadError.message,
    })
  }

  const orderIds = sandboxOrderIdsFromTickets(testTickets ?? [])
  const ticketCount = testTickets?.length ?? 0

  const purged = await admin.rpc("purge_event_test_tickets", {
    p_event_id: clean,
  })
  if (purged.error) {
    logger.warn({
      context: "events/publish",
      message: "sandbox_purge_rpc_failed",
      eventId: clean,
      error: purged.error.message,
    })
  }

  const { error: deleteError } = await admin
    .from("tickets")
    .delete()
    .eq("event_id", clean)
    .eq("is_test", true)

  if (deleteError) {
    logger.warn({
      context: "events/publish",
      message: "sandbox_ticket_delete_failed",
      eventId: clean,
      error: deleteError.message,
    })
    await cancelLeftoverTestTickets(admin, clean)
  }

  const ordersPurged = await expireSandboxOrders(admin, orderIds)
  return {
    ticketsPurged: Number(purged.data ?? ticketCount),
    ordersPurged,
  }
}
