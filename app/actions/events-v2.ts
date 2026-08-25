"use server"

import { formatSupabaseError } from "@/lib/errors/supabase-error"
import { isPlatformOwnerRole } from "@/lib/auth/platform-owner"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

export type SaveEventDraftV2Result =
  | { success: true; eventId: string; draftState: Json }
  | { success: false; error: string }

export type GetEventDraftV2Result =
  | { success: true; eventId: string; draftState: Json | null }
  | { success: false; error: string; code?: string }

async function requireDraftWriter() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    return { ok: false as const, error: formatSupabaseError(authError) }
  }
  if (!user) {
    return {
      ok: false as const,
      error: "Debes iniciar sesión para guardar el borrador.",
      code: "UNAUTHENTICATED",
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", user.id)
    .maybeSingle()
  if (profileError) {
    return { ok: false as const, error: formatSupabaseError(profileError) }
  }

  const isSuperAdmin = isPlatformOwnerRole(profile?.role)
  const canWrite =
    isSuperAdmin ||
    (profile?.role === "admin" &&
      profile.organizer_approval_status === "approved")
  if (!canWrite) {
    return {
      ok: false as const,
      error: "Tu cuenta de organizador no está habilitada para editar eventos.",
    }
  }

  return { ok: true as const, supabase, userId: user.id, isSuperAdmin }
}

export async function getEventDraftV2(
  eventId: string,
): Promise<GetEventDraftV2Result> {
  const id = eventId.trim()
  if (!id) return { success: false, error: "Evento inválido." }

  const gate = await requireDraftWriter()
  if (!gate.ok) {
    return { success: false, error: gate.error, code: gate.code }
  }

  const { data, error } = await gate.supabase
    .from("events")
    .select("id, organizer_id, draft_state")
    .eq("id", id)
    .maybeSingle()
  if (error) return { success: false, error: formatSupabaseError(error) }
  if (!data) return { success: false, error: "Evento no encontrado.", code: "NOT_FOUND" }
  if (data.organizer_id !== gate.userId && !gate.isSuperAdmin) {
    return { success: false, error: "No tenés permiso para editar este evento." }
  }

  return {
    success: true,
    eventId: data.id,
    draftState: (data.draft_state ?? null) as Json | null,
  }
}

/**
 * JSON Draft Pattern. Only writes events.draft_state.
 * No ticket_tiers. No venues.
 */
export async function saveEventDraftV2(
  eventId: string,
  rawData: unknown,
): Promise<SaveEventDraftV2Result> {
  const id = eventId.trim()
  if (!id) return { success: false, error: "Evento inválido." }

  const gate = await requireDraftWriter()
  if (!gate.ok) return { success: false, error: gate.error }

  const { data: event, error: eventError } = await gate.supabase
    .from("events")
    .select("id, organizer_id")
    .eq("id", id)
    .maybeSingle()
  if (eventError) return { success: false, error: formatSupabaseError(eventError) }
  if (!event) return { success: false, error: "Evento no encontrado." }
  if (event.organizer_id !== gate.userId && !gate.isSuperAdmin) {
    return { success: false, error: "No tenés permiso para editar este evento." }
  }

  const draftState = (rawData ?? {}) as Json
  const { data, error } = await gate.supabase
    .from("events")
    .update({
      draft_state: draftState,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, draft_state")
    .maybeSingle()

  if (error) return { success: false, error: formatSupabaseError(error) }
  if (!data?.id) {
    return {
      success: false,
      error: formatSupabaseError({
        code: "NO_ROWS",
        message: "events.update draft_state no devolvió fila",
        details: id,
      }),
    }
  }

  return {
    success: true,
    eventId: data.id,
    draftState: (data.draft_state ?? draftState) as Json,
  }
}
