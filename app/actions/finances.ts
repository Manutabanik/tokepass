"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import type { PayoutRequestStatus } from "@/types/database"

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

export type FinancePayoutRequest = {
  id: string
  amount: number
  status: PayoutRequestStatus
  cbuDestination: string
  eventId: string | null
  adminNotes: string | null
  createdAt: string
  updatedAt: string
  reviewedAt: string | null
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
  retainedHeld: number
  availableToSettle: number
  platformFeeDebt: number
  settlements: FinanceSettlement[]
  payoutRequests: FinancePayoutRequest[]
  defaultCbu: string | null
}

async function requireOrganizer() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("auth_required")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", user.id)
    .maybeSingle()

  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "super_admin")
  ) {
    throw new Error("forbidden")
  }

  if (
    profile.role === "admin" &&
    profile.organizer_approval_status !== "approved"
  ) {
    throw new Error("forbidden")
  }

  return { supabase, userId: user.id }
}

function mapFinanceSummary(data: unknown): Omit<OrganizerFinanceSummary, "defaultCbu"> {
  const row = (data ?? {}) as Record<string, unknown>
  const settlementsRaw = Array.isArray(row.settlements) ? row.settlements : []
  const payoutsRaw = Array.isArray(row.payoutRequests) ? row.payoutRequests : []

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
    retainedHeld: Number(row.retainedHeld ?? 0),
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
    payoutRequests: payoutsRaw.map((item) => {
      const p = item as Record<string, unknown>
      const status = String(p.status ?? "pending") as PayoutRequestStatus
      return {
        id: String(p.id),
        amount: Number(p.amount ?? 0),
        status,
        cbuDestination: String(p.cbuDestination ?? ""),
        eventId: (p.eventId as string | null) ?? null,
        adminNotes: (p.adminNotes as string | null) ?? null,
        createdAt: String(p.createdAt ?? new Date().toISOString()),
        updatedAt: String(p.updatedAt ?? new Date().toISOString()),
        reviewedAt: (p.reviewedAt as string | null) ?? null,
      }
    }),
  }
}

export async function getOrganizerFinanceSummary(): Promise<OrganizerFinanceSummary> {
  const { supabase, userId } = await requireOrganizer()

  const [{ data, error }, { data: application }] = await Promise.all([
    supabase.rpc("get_organizer_finance_summary", {
      p_organizer_id: userId,
    }),
    supabase
      .from("organizer_applications")
      .select("cbu_alias")
      .eq("id", userId)
      .maybeSingle(),
  ])

  if (error) {
    throw new Error(error.message)
  }

  return {
    ...mapFinanceSummary(data),
    defaultCbu: application?.cbu_alias?.trim() || null,
  }
}

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

/** @deprecated Prefer requestPayout con monto + CBU. */
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

export async function requestPayout(input: {
  amount: number
  cbuDestination: string
  eventId?: string | null
}): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase } = await requireOrganizer()
    const amount = Number(input.amount)
    const cbu = input.cbuDestination?.trim() ?? ""

    if (!Number.isFinite(amount) || amount < 1) {
      return { success: false, error: "Ingresá un monto válido (mínimo $1)." }
    }
    if (cbu.length < 6) {
      return { success: false, error: "Ingresá un CBU/CVU o alias válido." }
    }

    const { data, error } = await supabase.rpc("request_organizer_payout", {
      p_amount: amount,
      p_cbu_destination: cbu,
      p_event_id: input.eventId?.trim() || null,
    })

    if (error || !data) {
      return {
        success: false,
        error: error?.message ?? "No se pudo solicitar el retiro.",
      }
    }

    revalidatePath("/admin/finances")
    revalidatePath("/admin/payouts")
    revalidatePath("/superadmin/settlements")
    revalidatePath("/superadmin/liquidaciones")
    return { success: true, data: { id: String(data) } }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al solicitar el retiro.",
    }
  }
}
