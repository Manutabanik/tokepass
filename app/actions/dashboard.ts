"use server"

import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

export type RecentSale = {
  id: string
  date: string
  amount: number
  status: string
  buyerName: string
}

export type DashboardMetrics = {
  totalRevenue: number
  ticketsSold: number
  activeEvents: number
  recentSales: RecentSale[]
}

type RpcMetrics = {
  total_revenue?: number | string | null
  tickets_sold?: number | string | null
  active_events?: number | string | null
  recent_sales?: Array<{
    id?: string
    date?: string
    amount?: number | string
    status?: string
    buyer_name?: string
  }> | null
}

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeMetrics(raw: unknown): DashboardMetrics {
  const data = (raw ?? {}) as RpcMetrics

  const recentSales = (data.recent_sales ?? [])
    .filter((sale) => sale && sale.id && sale.date != null)
    .map((sale) => ({
      id: String(sale.id),
      date: String(sale.date),
      amount: toNumber(sale.amount),
      status: String(sale.status ?? "paid"),
      buyerName: String(sale.buyer_name ?? "Comprador"),
    }))

  return {
    totalRevenue: toNumber(data.total_revenue),
    ticketsSold: Math.max(0, Math.trunc(toNumber(data.tickets_sold))),
    activeEvents: Math.max(0, Math.trunc(toNumber(data.active_events))),
    recentSales,
  }
}

const EMPTY_METRICS: DashboardMetrics = {
  totalRevenue: 0,
  ticketsSold: 0,
  activeEvents: 0,
  recentSales: [],
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error("Debes iniciar sesión para ver el dashboard.")
  }

  const { data, error } = await supabase.rpc("get_organizer_metrics", {
    p_organizer_id: user.id,
  })

  if (error) {
    throw new Error(`No se pudieron cargar las métricas: ${error.message}`)
  }

  if (data == null) {
    return EMPTY_METRICS
  }

  return normalizeMetrics(data as Json)
}
