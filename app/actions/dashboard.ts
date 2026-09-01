"use server"

import { logger } from "@/lib/logger"
import { createClient } from "@/lib/supabase/server"
import {
  filterPaidRecentSales,
  paidLedgerFromRpc,
  roundLedger,
  type OrganizerPaidLedger,
} from "@/lib/finance/organizer-ledger"
import type { Json } from "@/types/database"

export type RecentSale = {
  id: string
  date: string
  amount: number
  status: string
  buyerName: string
}

export type DashboardMetrics = OrganizerPaidLedger & {
  totalRevenue: number
  ticketsSold: number
  webSold: number
  paperIssued: number
  activeEvents: number
  recentSales: RecentSale[]
}

type RpcMetrics = {
  gross_revenue?: number | string | null
  tokepass_service_charge?: number | string | null
  organizer_net_payout?: number | string | null
  total_revenue?: number | string | null
  tickets_sold?: number | string | null
  web_sold?: number | string | null
  paper_issued?: number | string | null
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

function normalizeRecentSales(raw: RpcMetrics["recent_sales"]): RecentSale[] {
  const recentSales = (raw ?? [])
    .filter((sale) => sale && sale.id && sale.date != null)
    .map((sale) => ({
      id: String(sale.id),
      date: String(sale.date),
      amount: toNumber(sale.amount),
      status: String(sale.status ?? "paid"),
      buyerName: String(sale.buyer_name ?? "Comprador"),
    }))
  return filterPaidRecentSales(recentSales)
}

function normalizeMetrics(raw: unknown): DashboardMetrics {
  const data = (raw ?? {}) as RpcMetrics
  const fromRpc = paidLedgerFromRpc(raw)
  const ledger = roundLedger(
    fromRpc ?? {
      grossRevenue: 0,
      tokepassServiceCharge: 0,
      organizerNetPayout: 0,
    },
  )

  return {
    ...ledger,
    totalRevenue: ledger.grossRevenue,
    ticketsSold: Math.max(0, Math.trunc(toNumber(data.tickets_sold))),
    webSold: Math.max(
      0,
      Math.trunc(toNumber(data.web_sold ?? data.tickets_sold)),
    ),
    paperIssued: Math.max(0, Math.trunc(toNumber(data.paper_issued))),
    activeEvents: Math.max(0, Math.trunc(toNumber(data.active_events))),
    recentSales: normalizeRecentSales(data.recent_sales),
  }
}

const EMPTY_METRICS: DashboardMetrics = {
  grossRevenue: 0,
  tokepassServiceCharge: 0,
  organizerNetPayout: 0,
  totalRevenue: 0,
  ticketsSold: 0,
  webSold: 0,
  paperIssued: 0,
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
    logger.error({
      context: "getDashboardMetrics",
      message: "organizer_metrics_rpc_failed",
      error,
    })
    return EMPTY_METRICS
  }

  if (data == null) {
    return EMPTY_METRICS
  }

  return normalizeMetrics(data as Json)
}
