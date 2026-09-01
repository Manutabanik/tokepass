import { isProductionPaidOrder } from "@/lib/finance/organizer-ledger"
import {
  classifyIssuanceForDashboard,
  issuanceUsesDigitalStock,
} from "@/lib/inventory/channel-stock"

const EXCLUDED_TICKET_STATUSES = new Set([
  "pending_payment",
  "cancelled",
  "revoked",
])

export type EventDashboardMetrics = {
  ticketsSold: number
  webSold: number
  paperIssued: number
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
  issuance_channel?: string | null
  issuanceChannel?: string | null
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

  let webSold = 0
  let paperIssued = 0
  let digitalOccupied = 0
  for (const ticket of input.tickets) {
    if (!isProductionTicket(ticket)) continue
    const orderId = ticketOrderId(ticket)
    if (!orderId) continue
    const order = ordersById.get(orderId)
    if (!order || !isProductionPaidOrder(order)) continue
    const channel = ticket.issuanceChannel ?? ticket.issuance_channel
    const bucket = classifyIssuanceForDashboard(channel)
    if (bucket === "web") webSold += 1
    if (bucket === "paper") paperIssued += 1
    if (issuanceUsesDigitalStock(channel)) digitalOccupied += 1
    productionOrders.set(orderId, order)
  }

  const revenue = [...productionOrders.values()].reduce((sum, order) => {
    const amount = Number(order.total_amount ?? order.totalAmount ?? 0)
    return sum + (Number.isFinite(amount) ? amount : 0)
  }, 0)

  return {
    ticketsSold: webSold,
    webSold,
    paperIssued,
    revenue,
    capacity,
    available: Math.max(0, capacity - digitalOccupied),
  }
}

export function eventDashboardMetricsFromRpc(
  raw: unknown,
): EventDashboardMetrics | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const ticketsSold = Number(row.tickets_sold ?? row.ticketsSold)
  const webSold = Number(row.web_sold ?? row.webSold ?? ticketsSold)
  const paperIssued = Number(row.paper_issued ?? row.paperIssued ?? 0)
  const revenue = Number(row.revenue)
  const capacity = Number(row.capacity)
  const availableRaw = Number(row.available)
  if (![ticketsSold, revenue, capacity].every(Number.isFinite)) return null
  const web = Number.isFinite(webSold) ? Math.max(0, Math.trunc(webSold)) : 0
  const paper = Number.isFinite(paperIssued)
    ? Math.max(0, Math.trunc(paperIssued))
    : 0
  return {
    ticketsSold: Math.max(0, Math.trunc(ticketsSold)),
    webSold: web,
    paperIssued: paper,
    revenue,
    capacity: Math.max(0, Math.trunc(capacity)),
    available: Number.isFinite(availableRaw)
      ? Math.max(0, Math.trunc(availableRaw))
      : Math.max(0, Math.trunc(capacity) - web),
  }
}
