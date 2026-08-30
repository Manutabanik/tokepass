import { isProductionPaidOrder } from "@/lib/finance/organizer-ledger"

const EXCLUDED_TICKET_STATUSES = new Set([
  "pending_payment",
  "cancelled",
  "revoked",
])

export type EventDashboardMetrics = {
  ticketsSold: number
  revenue: number
  capacity: number
  available: number
}

export type EventDashboardTicketRow = {
  orderId?: string | null
  order_id?: string | null
  status?: string | null
  is_test?: boolean | null
  isTest?: boolean | null
}

export type EventDashboardOrderRow = {
  id: string
  status?: string | null
  total_amount?: number | string | null
  totalAmount?: number | string | null
  is_test?: boolean | null
  isTest?: boolean | null
  environment?: string | null
  payment_method?: string | null
  paymentMethod?: string | null
}

function ticketOrderId(ticket: EventDashboardTicketRow): string {
  return (ticket.orderId ?? ticket.order_id ?? "").trim()
}

function isProductionTicket(ticket: EventDashboardTicketRow): boolean {
  if (ticket.is_test === true || ticket.isTest === true) return false
  const status = String(ticket.status ?? "").trim().toLowerCase()
  if (!status || EXCLUDED_TICKET_STATUSES.has(status)) return false
  return true
}

export function computeEventDashboardMetrics(input: {
  capacity: number
  tickets: EventDashboardTicketRow[]
  orders: EventDashboardOrderRow[]
}): EventDashboardMetrics {
  const capacity = Math.max(0, Math.trunc(Number(input.capacity) || 0))
  const ordersById = new Map(
    input.orders.map((order) => [order.id, order] as const),
  )
  const productionOrders = new Map<string, EventDashboardOrderRow>()

  let ticketsSold = 0
  for (const ticket of input.tickets) {
    if (!isProductionTicket(ticket)) continue
    const orderId = ticketOrderId(ticket)
    if (!orderId) continue
    const order = ordersById.get(orderId)
    if (!order || !isProductionPaidOrder(order)) continue
    ticketsSold += 1
    productionOrders.set(orderId, order)
  }

  const revenue = [...productionOrders.values()].reduce((sum, order) => {
    const amount = Number(order.total_amount ?? order.totalAmount ?? 0)
    return sum + (Number.isFinite(amount) ? amount : 0)
  }, 0)

  return {
    ticketsSold,
    revenue,
    capacity,
    available: Math.max(0, capacity - ticketsSold),
  }
}

export function eventDashboardMetricsFromRpc(
  raw: unknown,
): EventDashboardMetrics | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const ticketsSold = Number(row.tickets_sold ?? row.ticketsSold)
  const revenue = Number(row.revenue)
  const capacity = Number(row.capacity)
  if (![ticketsSold, revenue, capacity].every(Number.isFinite)) return null
  return {
    ticketsSold: Math.max(0, Math.trunc(ticketsSold)),
    revenue,
    capacity: Math.max(0, Math.trunc(capacity)),
    available: Math.max(0, Math.trunc(capacity) - Math.trunc(ticketsSold)),
  }
}
