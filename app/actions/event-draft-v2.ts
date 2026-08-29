"use server"

import { revalidatePath } from "next/cache"

import { formatSupabaseError } from "@/lib/errors/supabase-error"
import { isPlatformOwnerRole } from "@/lib/auth/platform-owner"
import {
  DEFAULT_PLATFORM_FEE_PERCENTAGE,
  organizerRateToFeePercentage,
} from "@/lib/pricing/event-fees"
import { getOrganizerServiceChargeRate } from "@/lib/services/organizer-pricing"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import {
  emptyEventDraftV2,
  toEventDraftV2Payload,
} from "@/lib/validations/event-draft-v2"
import { asUuidOrNull } from "@/lib/validations/relation-id"
import type { Json } from "@/types/database"

export type CreateEventDraftV2Result =
  | { success: true; eventId: string }
  | { success: false; error: string }

type DraftActor = {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  isSuperAdmin: boolean
}

async function requireDraftActor(): Promise<
  { ok: true; actor: DraftActor } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    return { ok: false, error: formatSupabaseError(authError) }
  }
  if (!user) {
    return { ok: false, error: "Debes iniciar sesión para guardar el borrador." }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", user.id)
    .maybeSingle()
  if (profileError) {
    return { ok: false, error: formatSupabaseError(profileError) }
  }

  const isSuperAdmin = isPlatformOwnerRole(profile?.role)
  const canWrite =
    isSuperAdmin ||
    (profile?.role === "admin" &&
      profile.organizer_approval_status === "approved")
  if (!canWrite) {
    return {
      ok: false,
      error: "Tu cuenta de organizador no está habilitada para crear eventos.",
    }
  }

  return {
    ok: true,
    actor: { supabase, userId: user.id, isSuperAdmin },
  }
}

/**
 * Bootstrap only: inserts a stub `events` row so `saveEventDraftV2` can UPDATE.
 * Does not write ticket_tiers or venues.
 */
export async function createEventDraftV2(options?: {
  organizerId?: string
}): Promise<CreateEventDraftV2Result> {
  const gate = await requireDraftActor()
  if (!gate.ok) return { success: false, error: gate.error }

  const requestedOrganizerId = asUuidOrNull(options?.organizerId ?? null, [])
  let organizerId = gate.actor.userId
  let writer: typeof gate.actor.supabase | ReturnType<typeof createAdminClient> =
    gate.actor.supabase

  if (requestedOrganizerId && requestedOrganizerId !== gate.actor.userId) {
    if (!gate.actor.isSuperAdmin) {
      return {
        success: false,
        error: "No tenés permiso para crear eventos en nombre de otra productora.",
      }
    }

    const admin = createAdminClient()
    const { data: organizer, error: organizerError } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", requestedOrganizerId)
      .maybeSingle()
    if (organizerError) {
      return { success: false, error: formatSupabaseError(organizerError) }
    }
    if (
      !organizer ||
      (organizer.role !== "admin" && organizer.role !== "super_admin")
    ) {
      return { success: false, error: "No encontramos esa productora." }
    }

    organizerId = organizer.id
    writer = admin
  }

  let platformFeePercentage = DEFAULT_PLATFORM_FEE_PERCENTAGE
  try {
    platformFeePercentage = organizerRateToFeePercentage(
      await getOrganizerServiceChargeRate(organizerId),
    )
  } catch {
    platformFeePercentage = DEFAULT_PLATFORM_FEE_PERCENTAGE
  }

  const { data, error } = await writer
    .from("events")
    .insert({
      organizer_id: organizerId,
      title: "Nuevo evento",
      date: new Date().toISOString(),
      status: "draft",
      has_seating_plan: false,
      platform_fee_percentage: platformFeePercentage,
      draft_state: toEventDraftV2Payload(emptyEventDraftV2()) as Json,
    })
    .select("id")
    .maybeSingle()

  if (error) return { success: false, error: formatSupabaseError(error) }
  if (!data?.id) {
    return {
      success: false,
      error: formatSupabaseError({
        code: "NO_ROWS",
        message: "events.insert no devolvió fila",
        details: "createEventDraftV2",
      }),
    }
  }

  revalidatePath("/admin/events")
  return { success: true, eventId: data.id }
}
