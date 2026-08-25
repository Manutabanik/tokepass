"use server"

import { formatSupabaseError } from "@/lib/errors/supabase-error"
import { isPlatformOwnerRole } from "@/lib/auth/platform-owner"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

export type SaveEventDraftV2Result =
  | { success: true; eventId: string; draftState: Json }
  | { success: false; error: string }

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
export async function createEventDraftV2(): Promise<CreateEventDraftV2Result> {
  const gate = await requireDraftActor()
  if (!gate.ok) return { success: false, error: gate.error }

  const { data, error } = await gate.actor.supabase
    .from("events")
    .insert({
      organizer_id: gate.actor.userId,
      title: "Borrador V2",
      date: new Date().toISOString(),
      status: "draft",
      has_seating_plan: false,
      draft_state: {},
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

  return { success: true, eventId: data.id }
}

/**
 * JSON Draft Pattern: the only persist path for Event Creator V2 while editing.
 * UPDATE events.draft_state. No validation, no aforo, no relational upserts.
 */
export async function saveEventDraftV2(
  eventId: string,
  rawJsonData: unknown,
): Promise<SaveEventDraftV2Result> {
  const id = eventId.trim()
  if (!id) {
    return { success: false, error: "Evento inválido." }
  }

  const gate = await requireDraftActor()
  if (!gate.ok) return { success: false, error: gate.error }

  const { data: event, error: eventError } = await gate.actor.supabase
    .from("events")
    .select("id, organizer_id")
    .eq("id", id)
    .maybeSingle()
  if (eventError) return { success: false, error: formatSupabaseError(eventError) }
  if (!event) return { success: false, error: "Evento no encontrado." }
  if (event.organizer_id !== gate.actor.userId && !gate.actor.isSuperAdmin) {
    return { success: false, error: "No tenés permiso para editar este evento." }
  }

  const draftState = (rawJsonData ?? {}) as Json
  const { data, error } = await gate.actor.supabase
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
