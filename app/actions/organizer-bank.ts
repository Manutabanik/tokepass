"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { SuperAdminForbiddenError } from "@/lib/superadmin-errors"
import {
  organizerBankSchema,
  splitBankDestination,
} from "@/lib/validations/organizer-bank"
import type {
  OrganizerBankProfile,
  OrganizerBankVerificationStatus,
} from "@/types/database"

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

export type OrganizerBankFormState = {
  fullNameOrCompany: string
  taxId: string
  destination: string
  bankName: string
  verificationStatus: OrganizerBankVerificationStatus
  reviewNotes: string | null
}

async function requireOrganizer() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("auth_required")

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name, public_name, legal_name, tax_id")
    .eq("id", user.id)
    .maybeSingle()

  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "super_admin")
  ) {
    throw new Error("forbidden")
  }

  return { supabase, userId: user.id, profile, admin: createAdminClient() }
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

function destinationFromProfile(row: OrganizerBankProfile): string {
  return row.bank_cbu_cvu?.trim() || row.bank_alias?.trim() || ""
}

export async function getMyOrganizerBankProfile(): Promise<OrganizerBankFormState | null> {
  try {
    const { userId, profile, admin } = await requireOrganizer()
    const { data } = await admin
      .from("organizer_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()

    if (data) {
      return {
        fullNameOrCompany: data.full_name_or_company,
        taxId: data.tax_id,
        destination: destinationFromProfile(data),
        bankName: data.bank_name ?? "",
        verificationStatus: data.verification_status,
        reviewNotes: data.review_notes,
      }
    }

    return {
      fullNameOrCompany:
        profile.legal_name?.trim() ||
        profile.public_name?.trim() ||
        profile.full_name?.trim() ||
        "",
      taxId: profile.tax_id?.trim() || "",
      destination: "",
      bankName: "",
      verificationStatus: "unverified",
      reviewNotes: null,
    }
  } catch {
    return null
  }
}

export async function saveOrganizerBankProfile(input: {
  fullNameOrCompany: string
  taxId: string
  destination: string
  bankName?: string
}): Promise<ActionResult> {
  try {
    const parsed = organizerBankSchema.safeParse({
      fullNameOrCompany: input.fullNameOrCompany,
      taxId: input.taxId,
      destination: input.destination,
      bankName: input.bankName ?? "",
    })
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Revisá los datos de cobro.",
      }
    }

    const { userId, admin } = await requireOrganizer()
    const { cbu, alias } = splitBankDestination(parsed.data.destination)
    const bankName = parsed.data.bankName?.trim() || null
    const now = new Date().toISOString()

    const { data: existing } = await admin
      .from("organizer_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle()

    const payload = {
      full_name_or_company: parsed.data.fullNameOrCompany,
      tax_id: parsed.data.taxId.replace(/\D/g, ""),
      bank_cbu_cvu: cbu,
      bank_alias: alias,
      bank_name: bankName,
      verification_status: "pending_review" as const,
    }

    const { error } = existing
      ? await admin
          .from("organizer_profiles")
          .update({ ...payload, updated_at: now })
          .eq("user_id", userId)
      : await admin.from("organizer_profiles").insert({
          user_id: userId,
          ...payload,
        })

    if (error) return { success: false, error: error.message }

    await admin
      .from("profiles")
      .update({
        legal_name: parsed.data.fullNameOrCompany,
        tax_id: parsed.data.taxId.replace(/\D/g, ""),
        updated_at: now,
      })
      .eq("id", userId)

    revalidatePath("/dashboard/settings/bank")
    revalidatePath("/admin/settings/bank")
    revalidatePath("/admin/finances")
    revalidatePath("/superadmin/settlements")
    return { success: true, data: undefined }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "No pudimos guardar los cambios. Revisá tu conexión a internet e intentá de nuevo",
    }
  }
}

export type PendingBankProfileRow = {
  id: string
  userId: string
  organizerName: string
  organizerEmail: string
  fullNameOrCompany: string
  taxId: string
  cbu: string | null
  alias: string | null
  bankName: string | null
  verificationStatus: OrganizerBankVerificationStatus
  updatedAt: string
}

export async function listPendingBankProfiles(): Promise<PendingBankProfileRow[]> {
  const { admin } = await requireSuperAdmin()
  const { data, error } = await admin
    .from("organizer_profiles")
    .select("*")
    .in("verification_status", ["pending_review", "unverified"])
    .order("updated_at", { ascending: false })
    .limit(80)

  if (error) throw new Error(error.message)
  const rows = data ?? []
  if (rows.length === 0) return []

  const ids = rows.map((row) => row.user_id)
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, public_name, email")
    .in("id", ids)
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]))

  return rows.map((row) => {
    const profile = byId.get(row.user_id)
    return {
      id: row.id,
      userId: row.user_id,
      organizerName:
        profile?.public_name?.trim() ||
        profile?.full_name?.trim() ||
        profile?.email ||
        "Productora",
      organizerEmail: profile?.email ?? "",
      fullNameOrCompany: row.full_name_or_company,
      taxId: row.tax_id,
      cbu: row.bank_cbu_cvu,
      alias: row.bank_alias,
      bankName: row.bank_name,
      verificationStatus: row.verification_status,
      updatedAt: row.updated_at,
    }
  })
}

export async function reviewOrganizerBankProfile(
  profileId: string,
  decision: "verified" | "rejected",
  notes?: string,
): Promise<ActionResult> {
  try {
    const { admin, actorId } = await requireSuperAdmin()
    const now = new Date().toISOString()
    const { data, error } = await admin
      .from("organizer_profiles")
      .update({
        verification_status: decision,
        review_notes: notes?.trim() || null,
        reviewed_by: actorId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", profileId)
      .select("id")
      .maybeSingle()

    if (error || !data) {
      return { success: false, error: error?.message ?? "Perfil no encontrado." }
    }

    if (decision === "verified") {
      await admin.rpc("sync_event_payouts")
    }

    revalidatePath("/superadmin/settlements")
    revalidatePath("/superadmin/finanzas")
    revalidatePath("/dashboard/settings/bank")
    return { success: true, data: undefined }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof SuperAdminForbiddenError
          ? error.message
          : error instanceof Error
            ? error.message
            : "No se pudo actualizar la verificación.",
    }
  }
}
