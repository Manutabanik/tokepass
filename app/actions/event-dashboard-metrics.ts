"use server"

import {
  computeEventDashboardMetrics,
  eventDashboardMetricsFromRpc,
  type EventDashboardMetrics,
} from "@/lib/finance/event-dashboard-metrics"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const EMPTY: EventDashboardMetrics = {
  ticketsSold: 0,
  revenue: 0,
  capacity: 0,
  available: 0,
}

export async function getEventDashboardMetrics(
  eventId: string,
): Promise<EventDashboardMetrics> {
  const clean = eventId.trim()
  if (!clean) return EMPTY

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return EMPTY

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  const owned = await supabase
    .from("events")
    .select("id, organizer_id")
    .eq("id", clean)
    .maybeSingle()

  const isOwner = owned.data?.organizer_id === user.id
  const isSuper = profile?.role === "super_admin"
  if (!isOwner && !isSuper) return EMPTY

  const reader = isOwner ? supabase : createAdminClient()
  const rpc = await reader.rpc("get_event_dashboard_metrics", {
    p_event_id: clean,
  })
  const fromRpc = eventDashboardMetricsFromRpc(rpc.data)
  if (!rpc.error && fromRpc) return fromRpc

  const [{ data: tiers }, { data: tickets }] = await Promise.all([
    reader
      .from("ticket_tiers")
      .select("capacity")
      .eq("event_id", clean),
    reader
      .from("tickets")
      .select(
        "order_id, status, is_test, orders!tickets_order_id_fkey(id, status, total_amount, is_test, environment, payment_method)",
      )
      .eq("event_id", clean)
      .eq("is_test", false),
  ])

  const capacity = (tiers ?? []).reduce(
    (sum, tier) => sum + Math.max(0, Number(tier.capacity) || 0),
    0,
  )
  const orders = new Map<
    string,
    {
      id: string
      status: string
      total_amount: number
      is_test: boolean
      environment: string | null
      payment_method: string | null
    }
  >()
  const ticketRows = (tickets ?? []).map((row) => {
    const orderRaw = row.orders as unknown as
      | {
          id: string
          status: string
          total_amount: number | string | null
          is_test?: boolean | null
          environment?: string | null
          payment_method?: string | null
        }
      | {
          id: string
          status: string
          total_amount: number | string | null
          is_test?: boolean | null
          environment?: string | null
          payment_method?: string | null
        }[]
      | null
    const order = Array.isArray(orderRaw) ? orderRaw[0] : orderRaw
    if (order?.id) {
      orders.set(order.id, {
        id: order.id,
        status: order.status,
        total_amount: Number(order.total_amount) || 0,
        is_test: Boolean(order.is_test),
        environment: order.environment ?? null,
        payment_method: order.payment_method ?? null,
      })
    }
    return {
      order_id: row.order_id,
      status: row.status,
      is_test: Boolean(row.is_test),
    }
  })

  return computeEventDashboardMetrics({
    capacity,
    tickets: ticketRows,
    orders: [...orders.values()],
  })
}
