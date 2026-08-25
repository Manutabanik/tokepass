"use server"

import { formatSupabaseError } from "@/lib/errors/supabase-error"
import { isPlatformOwnerRole } from "@/lib/auth/platform-owner"
import { createClient } from "@/lib/supabase/server"

export { saveEventDraftV2, type SaveEventDraftV2Result } from "@/app/actions/events-v2"

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
