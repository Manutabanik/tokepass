"use server"

import { revalidatePath } from "next/cache"

import {
  openSupportThreadForEvent,
  sendSupportMessage,
} from "@/app/actions/support"
import { sendPayoutSettlementEmail } from "@/lib/email/resend"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { logger } from "@/lib/logger"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { SuperAdminForbiddenError } from "@/lib/superadmin-errors"
import type { EventPayoutStatus } from "@/types/database"

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

export type EventPayoutRow = {
  id: string
  eventId: string
  eventTitle: string
  eventDate: string
  organizerId: string
  organizerName: string
  organizerEmail: string
  grossAmount: number
  serviceFeeAmount: number
  netAmount: number
  payoutStatus: EventPayoutStatus
  scheduledPayoutDate: string | null
  holdReason: string | null
  transferredAt: string | null
  bankHolder: string | null
  bankTaxId: string | null
  bankCbu: string | null
  bankAlias: string | null
  bankVerified: boolean
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

function revalidateFinancePaths() {
  revalidatePath("/superadmin")
  revalidatePath("/superadmin/settlements")
  revalidatePath("/superadmin/finanzas")
  revalidatePath("/superadmin/soporte")
  revalidatePath("/admin/finances")
}

export async function listEventPayouts(options?: {
  status?: EventPayoutStatus | "actionable" | "all"
}): Promise<EventPayoutRow[]> {
  const { admin } = await requireSuperAdmin()
  const { error: syncError } = await admin.rpc("sync_event_payouts")
  if (syncError) {
    logger.error({
      context: "event-payouts",
      message: "sync_event_payouts_failed",
      error: syncError.message,
    })
  }

  const filter = options?.status ?? "actionable"
  let query = admin
    .from("event_payouts")
    .select("*")
    .order("scheduled_payout_date", { ascending: true })
    .limit(200)

  if (filter === "actionable") {
    query = query.in("payout_status", ["hold", "pending_approval", "processing"])
  } else if (filter !== "all") {
    query = query.eq("payout_status", filter)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = data ?? []
  if (rows.length === 0) return []

  const organizerIds = [...new Set(rows.map((row) => row.organizer_id))]
  const eventIds = [...new Set(rows.map((row) => row.event_id))]

  const [{ data: profiles }, { data: events }, { data: banks }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, public_name, email")
        .in("id", organizerIds),
      admin
        .from("events")
        .select("id, title, date")
        .in("id", eventIds),
      admin
        .from("organizer_profiles")
        .select("user_id, verification_status, full_name_or_company, tax_id, bank_cbu_cvu, bank_alias")
        .in("user_id", organizerIds),
    ])

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
  const eventById = new Map((events ?? []).map((e) => [e.id, e]))
  const bankById = new Map((banks ?? []).map((b) => [b.user_id, b]))

  return rows.map((row) => {
    const profile = profileById.get(row.organizer_id)
    const event = eventById.get(row.event_id)
    const bank = bankById.get(row.organizer_id)
    return {
      id: row.id,
      eventId: row.event_id,
      eventTitle: event?.title?.trim() || "Evento",
      eventDate: event?.date ?? row.created_at,
      organizerId: row.organizer_id,
      organizerName:
        bank?.full_name_or_company?.trim() ||
        profile?.public_name?.trim() ||
        profile?.full_name?.trim() ||
        profile?.email ||
        "Productora",
      organizerEmail: profile?.email ?? "",
      grossAmount: Number(row.gross_amount),
      serviceFeeAmount: Number(row.service_fee_amount),
      netAmount: Number(row.net_amount),
      payoutStatus: row.payout_status,
      scheduledPayoutDate: row.scheduled_payout_date,
      holdReason: row.hold_reason,
      transferredAt: row.transferred_at,
      bankHolder: row.bank_holder_snapshot || bank?.full_name_or_company || null,
      bankTaxId: row.bank_tax_id_snapshot || bank?.tax_id || null,
      bankCbu: row.bank_cbu_snapshot || bank?.bank_cbu_cvu || null,
      bankAlias: row.bank_alias_snapshot || bank?.bank_alias || null,
      bankVerified: bank?.verification_status === "verified",
    }
  })
}

export async function countActionableEventPayouts(): Promise<number> {
  const { admin } = await requireSuperAdmin()
  const { count, error } = await admin
    .from("event_payouts")
    .select("id", { count: "exact", head: true })
    .in("payout_status", ["hold", "pending_approval", "processing"])
  if (error) return 0
  return count ?? 0
}

export async function approveEventPayout(
  payoutId: string,
): Promise<ActionResult> {
  try {
    const { admin, actorId } = await requireSuperAdmin()
    const { data: payout, error: loadError } = await admin
      .from("event_payouts")
      .select("*")
      .eq("id", payoutId)
      .maybeSingle()

    if (loadError || !payout) {
      return { success: false, error: "Liquidación no encontrada." }
    }
    if (
      payout.payout_status !== "pending_approval" &&
      payout.payout_status !== "processing"
    ) {
      return {
        success: false,
        error: "Solo se pueden liberar liquidaciones pendientes o en proceso.",
      }
    }

    const { data: bank } = await admin
      .from("organizer_profiles")
      .select("*")
      .eq("user_id", payout.organizer_id)
      .maybeSingle()

    if (!bank || bank.verification_status !== "verified") {
      return {
        success: false,
        error: "El CBU/CUIT del organizador todavía no está verificado.",
      }
    }
    if (!bank.bank_cbu_cvu && !bank.bank_alias) {
      return { success: false, error: "Falta CBU/CVU o alias de destino." }
    }

    const now = new Date().toISOString()
    const { data: updated, error } = await admin
      .from("event_payouts")
      .update({
        payout_status: "completed",
        transferred_at: now,
        reviewed_by: actorId,
        hold_reason: null,
        bank_holder_snapshot: bank.full_name_or_company,
        bank_tax_id_snapshot: bank.tax_id,
        bank_cbu_snapshot: bank.bank_cbu_cvu,
        bank_alias_snapshot: bank.bank_alias,
        updated_at: now,
      })
      .eq("id", payoutId)
      .in("payout_status", ["pending_approval", "processing"])
      .select("id")
      .maybeSingle()

    if (error || !updated) {
      return { success: false, error: error?.message ?? "No se pudo liberar el pago." }
    }

    const [{ data: profile }, { data: event }] = await Promise.all([
      admin
        .from("profiles")
        .select("email, full_name, public_name")
        .eq("id", payout.organizer_id)
        .maybeSingle(),
      admin.from("events").select("title").eq("id", payout.event_id).maybeSingle(),
    ])

    const destination =
      bank.bank_cbu_cvu
        ? `CBU/CVU ${bank.bank_cbu_cvu}`
        : `Alias ${bank.bank_alias}`

    void sendPayoutSettlementEmail({
      to: profile?.email ?? "",
      organizerName:
        bank.full_name_or_company ||
        profile?.public_name ||
        profile?.full_name ||
        "hola",
      eventTitle: event?.title?.trim() || "tu evento",
      grossAmount: formatCurrency(Number(payout.gross_amount)),
      serviceFeeAmount: formatCurrency(Number(payout.service_fee_amount)),
      netAmount: formatCurrency(Number(payout.net_amount)),
      destination,
      transferredAt: formatDateTime(now),
    }).catch((emailError) => {
      logger.error({
        context: "event-payouts",
        message: "settlement_email_failed",
        error: emailError instanceof Error ? emailError.message : "unknown",
      })
    })

    revalidateFinancePaths()
    return { success: true, data: undefined }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof SuperAdminForbiddenError
          ? error.message
          : error instanceof Error
            ? error.message
            : "No se pudo liberar el pago.",
    }
  }
}

export async function holdEventPayout(
  payoutId: string,
  reason: string,
): Promise<ActionResult<{ threadId?: string }>> {
  const holdReason = reason.trim()
  if (holdReason.length < 8) {
    return {
      success: false,
      error: "Ingresá un motivo de retención (mínimo 8 caracteres).",
    }
  }

  try {
    const { admin, actorId } = await requireSuperAdmin()
    const { data: payout, error: loadError } = await admin
      .from("event_payouts")
      .select("id, event_id, organizer_id, payout_status")
      .eq("id", payoutId)
      .maybeSingle()

    if (loadError || !payout) {
      return { success: false, error: "Liquidación no encontrada." }
    }
    if (payout.payout_status === "completed" || payout.payout_status === "cancelled") {
      return { success: false, error: "Esta liquidación ya está cerrada." }
    }

    const now = new Date().toISOString()
    const { error } = await admin
      .from("event_payouts")
      .update({
        payout_status: "hold",
        hold_reason: holdReason.slice(0, 800),
        reviewed_by: actorId,
        updated_at: now,
      })
      .eq("id", payoutId)

    if (error) return { success: false, error: error.message }

    const thread = await openSupportThreadForEvent(
      payout.event_id,
      payout.organizer_id,
    )
    if (thread.success) {
      await sendSupportMessage(
        thread.data.threadId,
        `TokePass retuvo la liquidación de este evento. Motivo: ${holdReason.slice(0, 800)}`,
      )
    }

    revalidateFinancePaths()
    return {
      success: true,
      data: { threadId: thread.success ? thread.data.threadId : undefined },
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof SuperAdminForbiddenError
          ? error.message
          : error instanceof Error
            ? error.message
            : "No se pudieron retener los fondos.",
    }
  }
}
