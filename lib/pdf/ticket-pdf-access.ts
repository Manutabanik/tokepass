import { getPrintableTicket } from "@/app/actions/pos"
import type { TicketPdfAudit, TicketPdfSource } from "@/lib/pdf/ticket-pdf-model"
import { DigitalTicketStaticExportError } from "@/lib/tickets/static-tps-policy"
import { createClient } from "@/lib/supabase/server"

export async function loadTicketPdfAudits(
  ticketIds: string[],
): Promise<Map<string, TicketPdfAudit>> {
  const result = new Map<string, TicketPdfAudit>()
  if (ticketIds.length === 0) return result

  const supabase = await createClient()
  const { data: rows } = await supabase
    .from("tickets")
    .select("id, order_id, created_at")
    .in("id", ticketIds)

  const orderIds = [
    ...new Set(
      (rows ?? [])
        .map((row) => row.order_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ]

  const orders = new Map<
    string,
    { payment_method: string | null; created_at: string | null }
  >()
  if (orderIds.length > 0) {
    const { data: orderRows } = await supabase
      .from("orders")
      .select("id, payment_method, created_at")
      .in("id", orderIds)
    for (const order of orderRows ?? []) {
      orders.set(order.id, {
        payment_method: order.payment_method,
        created_at: order.created_at,
      })
    }
  }

  for (const row of rows ?? []) {
    const order = row.order_id ? orders.get(row.order_id) : undefined
    result.set(row.id, {
      orderId: row.order_id,
      paymentMethod: order?.payment_method ?? null,
      issuedAt: order?.created_at ?? row.created_at ?? null,
    })
  }

  return result
}

export async function loadAuthorizedTicketsForPdf(
  ids: string[],
): Promise<TicketPdfSource[] | "unauthorized" | "not_found" | "forbidden"> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return "unauthorized"

  const tickets: TicketPdfSource[] = []
  for (const id of ids) {
    try {
      const ticket = await getPrintableTicket(id)
      if (!ticket) return "not_found"
      tickets.push(ticket)
    } catch (error) {
      if (error instanceof DigitalTicketStaticExportError) return "forbidden"
      throw error
    }
  }
  return tickets
}
