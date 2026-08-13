"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { SuperAdminForbiddenError } from "@/lib/superadmin-errors"
import type { PayoutRequestStatus } from "@/types/database"

export type PlatformPayoutRequestRow = {
  id: string
  organizerId: string
  organizerName: string
  organizerEmail: string
  eventId: string | null
  eventTitle: string | null
  amount: number
  status: PayoutRequestStatus
  cbuDestination: string
  adminNotes: string | null
  createdAt: string
  reviewedAt: string | null
}

async function requireSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new SuperAdminForbiddenError("Debés iniciar sesión.")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role !== "super_admin") {
    throw new SuperAdminForbiddenError()
  }

  return { admin: createAdminClient(), actorId: user.id }
}

export async function listPlatformPayoutRequests(options?: {
  status?: PayoutRequestStatus | "all"
}): Promise<PlatformPayoutRequestRow[]> {
  const { admin } = await requireSuperAdmin()
  const status = options?.status ?? "pending"

  let query = admin
    .from("payout_requests")
    .select(
      "id, organizer_id, event_id, amount, status, cbu_destination, admin_notes, created_at, reviewed_at",
    )
    .order("created_at", { ascending: true })
    .limit(200)

  if (status !== "all") {
    query = query.eq("status", status)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = data ?? []
  if (rows.length === 0) return []

  const organizerIds = [...new Set(rows.map((r) => r.organizer_id))]
  const eventIds = [
    ...new Set(rows.map((r) => r.event_id).filter(Boolean) as string[]),
  ]

  const [{ data: profiles }, { data: events }, { data: apps }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, email, public_name")
        .in("id", organizerIds),
      eventIds.length
        ? admin.from("events").select("id, title").in("id", eventIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      admin
        .from("organizer_applications")
        .select("id, company_name")
        .in("id", organizerIds),
    ])

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
  const eventById = new Map((events ?? []).map((e) => [e.id, e.title]))
  const appById = new Map((apps ?? []).map((a) => [a.id, a.company_name]))

  return rows.map((row) => {
    const profile = profileById.get(row.organizer_id)
    const company = appById.get(row.organizer_id)
    return {
      id: row.id,
      organizerId: row.organizer_id,
      organizerName:
        company ||
        profile?.public_name?.trim() ||
        profile?.full_name?.trim() ||
        profile?.email ||
        "Productora",
      organizerEmail: profile?.email ?? "",
      eventId: row.event_id,
      eventTitle: row.event_id ? (eventById.get(row.event_id) ?? null) : null,
      amount: Number(row.amount),
      status: row.status as PayoutRequestStatus,
      cbuDestination: row.cbu_destination,
      adminNotes: row.admin_notes,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
    }
  })
}

export async function completePayoutRequest(
  payoutId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireSuperAdmin()
    const supabase = await createClient()
    const { error } = await supabase.rpc("complete_organizer_payout", {
      p_payout_id: payoutId,
    })
    if (error) return { success: false, error: error.message }
    revalidatePath("/superadmin/settlements")
    revalidatePath("/superadmin/liquidaciones")
    revalidatePath("/admin/finances")
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof SuperAdminForbiddenError
          ? error.message
          : error instanceof Error
            ? error.message
            : "No se pudo marcar como transferido.",
    }
  }
}

export async function rejectPayoutRequest(
  payoutId: string,
  adminNotes?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireSuperAdmin()
    const supabase = await createClient()
    const { error } = await supabase.rpc("reject_organizer_payout", {
      p_payout_id: payoutId,
      p_admin_notes: adminNotes?.trim() || null,
    })
    if (error) return { success: false, error: error.message }
    revalidatePath("/superadmin/settlements")
    revalidatePath("/superadmin/liquidaciones")
    revalidatePath("/admin/finances")
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof SuperAdminForbiddenError
          ? error.message
          : error instanceof Error
            ? error.message
            : "No se pudo rechazar el retiro.",
    }
  }
}
