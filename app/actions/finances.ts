"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

export type FinanceSettlement = {
  id: string
  grossAmount: number
  platformFee: number
  netAmount: number
  status: "pending" | "completed"
  periodLabel: string | null
  notes: string | null
  completedAt: string | null
  createdAt: string
}

export type OrganizerFinanceSummary = {
  grossRevenue: number
  platformFees: number
  mpPlatformFees: number
  posPlatformFees: number
  netRevenue: number
  mercadopagoGross: number
  posGross: number
  settledNet: number
  pendingSettlementNet: number
  availableToSettle: number
  platformFeeDebt: number
  settlements: FinanceSettlement[]
}

async function requireOrganizer() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("auth_required")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "super_admin")
  ) {
    throw new Error("forbidden")
  }

  return { supabase, userId: user.id }
}

function mapFinanceSummary(data: unknown): OrganizerFinanceSummary {
  const row = (data ?? {}) as Record<string, unknown>
  const settlementsRaw = Array.isArray(row.settlements) ? row.settlements : []

  return {
    grossRevenue: Number(row.grossRevenue ?? 0),
    platformFees: Number(row.platformFees ?? 0),
    mpPlatformFees: Number(row.mpPlatformFees ?? 0),
    posPlatformFees: Number(row.posPlatformFees ?? 0),
    netRevenue: Number(row.netRevenue ?? 0),
    mercadopagoGross: Number(row.mercadopagoGross ?? 0),
    posGross: Number(row.posGross ?? 0),
    settledNet: Number(row.settledNet ?? 0),
    pendingSettlementNet: Number(row.pendingSettlementNet ?? 0),
    availableToSettle: Number(row.availableToSettle ?? 0),
    platformFeeDebt: Number(row.platformFeeDebt ?? 0),
    settlements: settlementsRaw.map((item) => {
      const s = item as Record<string, unknown>
      return {
        id: String(s.id),
        grossAmount: Number(s.grossAmount ?? 0),
        platformFee: Number(s.platformFee ?? 0),
        netAmount: Number(s.netAmount ?? 0),
        status: s.status === "completed" ? "completed" : "pending",
        periodLabel: (s.periodLabel as string | null) ?? null,
        notes: (s.notes as string | null) ?? null,
        completedAt: (s.completedAt as string | null) ?? null,
        createdAt: String(s.createdAt ?? new Date().toISOString()),
      }
    }),
  }
}

export async function getOrganizerFinanceSummary(): Promise<OrganizerFinanceSummary> {
  const { supabase, userId } = await requireOrganizer()

  const { data, error } = await supabase.rpc("get_organizer_finance_summary", {
    p_organizer_id: userId,
  })

  if (error) {
    throw new Error(error.message)
  }

  return mapFinanceSummary(data)
}

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function requestSettlement(input?: {
  periodLabel?: string
  notes?: string
}): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase } = await requireOrganizer()
    const { data, error } = await supabase.rpc("request_organizer_settlement", {
      p_period_label: input?.periodLabel?.trim() || null,
      p_notes: input?.notes?.trim() || null,
    })

    if (error || !data) {
      return {
        success: false,
        error: error?.message ?? "No se pudo solicitar la liquidación.",
      }
    }

    revalidatePath("/admin/finances")
    return { success: true, data: { id: String(data) } }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al solicitar liquidación.",
    }
  }
}
