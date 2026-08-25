"use server"

import { formatSupabaseError } from "@/lib/errors/supabase-error"
import { isPlatformOwnerRole } from "@/lib/auth/platform-owner"
import {
  bytesToBlob,
  detectRasterImageMagic,
  rasterContentType,
  readFileBytes,
} from "@/lib/media/image-magic"
import { createClient } from "@/lib/supabase/server"
import { MAX_EVENT_FLYER_BYTES } from "@/lib/validations/event-form"
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

export type UploadEventDraftMediaV2Result =
  | { success: true; url: string }
  | { success: false; error: string }

function sanitizeMediaFileName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 80)
}

/**
 * Uploads an image to Storage and returns a public URL.
 * Does not write ticket_tiers, venues, or events.flyer_url.
 */
export async function uploadEventDraftMediaV2(
  eventId: string,
  formData: FormData,
): Promise<UploadEventDraftMediaV2Result> {
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

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Elegí una imagen para subir." }
  }
  if (file.size > MAX_EVENT_FLYER_BYTES) {
    return { success: false, error: "La imagen no puede superar los 5 MB." }
  }

  const kindRaw = String(formData.get("kind") ?? "flyer")
  const kind = kindRaw === "banner" ? "banner" : "flyer"
  const bytes = await readFileBytes(file)
  const raster = detectRasterImageMagic(bytes)
  if (!raster) {
    return { success: false, error: "La imagen debe ser JPG, PNG o WEBP." }
  }
  const contentType = rasterContentType(raster)
  const uniqueName = `${kind}-${Date.now()}-${sanitizeMediaFileName(file.name || `${kind}.jpg`)}`
  const path = `${gate.userId}/draft-v2/${id}/${uniqueName}`

  const { error: uploadError } = await gate.supabase.storage
    .from("event-flyers")
    .upload(path, bytesToBlob(bytes, contentType), {
      cacheControl: "60",
      upsert: false,
      contentType,
    })
  if (uploadError) {
    return {
      success: false,
      error: `No se pudo subir la imagen: ${uploadError.message}`,
    }
  }

  const { data } = gate.supabase.storage.from("event-flyers").getPublicUrl(path)
  if (!data?.publicUrl) {
    await gate.supabase.storage.from("event-flyers").remove([path])
    return { success: false, error: "No se pudo obtener la URL pública." }
  }

  return { success: true, url: data.publicUrl }
}
