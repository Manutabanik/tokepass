"use server"

import { createClient } from "@/lib/supabase/server"
import type { OrderStatus, PaymentMethod } from "@/types/database"
import { getMyTickets, type MyTicket } from "@/app/actions/tickets"

export async function getMyTicketById(
  ticketId: string,
): Promise<MyTicket | null> {
  if (!ticketId) return null
  const tickets = await getMyTickets()
  return tickets.find((ticket) => ticket.id === ticketId) ?? null
}

export type BuyerOrderRow = {
  id: string
  status: OrderStatus
  paymentMethod: PaymentMethod
  subtotal: number
  serviceCharge: number
  discountAmount: number
  totalAmount: number
  createdAt: string
  mpPaymentId: string | null
  eventTitle: string | null
  eventDate: string | null
  eventId: string | null
  ticketCount: number
  extrasTotal: number
  extrasCount: number
  firstTicketId: string | null
  reservedUntil: string | null
}

export async function getMyOrders(): Promise<BuyerOrderRow[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("auth_required")

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, status, payment_method, subtotal, service_charge, discount_amount, total_amount, created_at, mp_payment_id",
    )
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) throw new Error(error.message)
  if (!orders?.length) return []

  const orderIds = orders.map((o) => o.id)

  const [{ data: tickets }, { data: redemptions }] = await Promise.all([
    supabase
      .from("tickets")
      .select(
        "id, order_id, event_id, events(id, title, date), seating_unit:event_seating_units(reserved_until)",
      )
      .in("order_id", orderIds)
      .eq("owner_id", user.id),
    supabase
      .from("item_redemptions")
      .select("id, order_id, event_items(price)")
      .in("order_id", orderIds)
      .eq("user_id", user.id),
  ])

  type TicketJoin = {
    id: string
    order_id: string | null
    event_id: string
    events: { id: string; title: string; date: string } | null
    seating_unit: { reserved_until: string | null } | null
  }

  const ticketsByOrder = new Map<string, TicketJoin[]>()
  for (const row of (tickets ?? []) as unknown as TicketJoin[]) {
    if (!row.order_id) continue
    const list = ticketsByOrder.get(row.order_id) ?? []
    list.push(row)
    ticketsByOrder.set(row.order_id, list)
  }

  const extrasByOrder = new Map<string, { count: number; total: number }>()
  for (const row of redemptions ?? []) {
    const orderId = row.order_id as string
    const item = row.event_items as unknown as { price?: number } | null
    const current = extrasByOrder.get(orderId) ?? { count: 0, total: 0 }
    current.count += 1
    current.total += Number(item?.price ?? 0)
    extrasByOrder.set(orderId, current)
  }

  return orders.map((order) => {
    const orderTickets = ticketsByOrder.get(order.id) ?? []
    const firstEvent = orderTickets[0]?.events ?? null
    const extras = extrasByOrder.get(order.id) ?? { count: 0, total: 0 }
    const reservedUntil =
      orderTickets
        .map((ticket) => ticket.seating_unit?.reserved_until)
        .filter((value): value is string => Boolean(value))
        .sort()[0] ?? null

    return {
      id: order.id,
      status: order.status as OrderStatus,
      paymentMethod: order.payment_method as PaymentMethod,
      subtotal: Number(order.subtotal),
      serviceCharge: Number(order.service_charge),
      discountAmount: Number(order.discount_amount ?? 0),
      totalAmount: Number(order.total_amount),
      createdAt: order.created_at,
      mpPaymentId: order.mp_payment_id,
      eventTitle: firstEvent?.title ?? null,
      eventDate: firstEvent?.date ?? null,
      eventId: firstEvent?.id ?? orderTickets[0]?.event_id ?? null,
      ticketCount: orderTickets.length,
      extrasTotal: extras.total,
      extrasCount: extras.count,
      firstTicketId: orderTickets[0]?.id ?? null,
      reservedUntil,
    }
  })
}

export async function getMyOrderById(
  orderId: string,
): Promise<BuyerOrderRow | null> {
  if (!orderId) return null
  const orders = await getMyOrders()
  return orders.find((order) => order.id === orderId) ?? null
}
