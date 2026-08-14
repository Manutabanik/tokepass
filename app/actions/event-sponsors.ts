"use server"

import { revalidatePath } from "next/cache"

import {
  MAX_EVENT_SPONSORS,
  MAX_SPONSOR_LOGO_BYTES,
  SPONSOR_LOGO_TYPES,
  mapSponsorRow,
  normalizeSponsorWebsite,
  storagePathFromSponsorUrl,
  type PublicSponsor,
  type SponsorTier,
} from "@/lib/sponsors"
import { createClient } from "@/lib/supabase/server"
import type { EventSponsor } from "@/types/database"

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

async function requireEventOrganizer(eventId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Debés iniciar sesión." }

  const [{ data: profile }, { data: event }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("events").select("id, organizer_id").eq("id", eventId).maybeSingle(),
  ])

  if (!event) return { ok: false as const, error: "Evento no encontrado." }
  if (event.organizer_id !== user.id && profile?.role !== "super_admin") {
    return { ok: false as const, error: "No tenés permiso para este evento." }
  }

  return { ok: true as const, supabase, eventId: event.id }
}

export async function listEventSponsors(eventId: string): Promise<PublicSponsor[]> {
  if (!eventId) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("event_sponsors")
    .select("id, name, logo_url, website_url, tier")
    .eq("event_id", eventId)
    .order("tier", { ascending: true })
    .order("display_order", { ascending: true })

  if (error) return []
  return (data ?? []).map(mapSponsorRow)
}

export async function listEventSponsorsForOrganizer(
  eventId: string,
): Promise<EventSponsor[]> {
  const access = await requireEventOrganizer(eventId)
  if (!access.ok) return []

  const { data, error } = await access.supabase
    .from("event_sponsors")
    .select("*")
    .eq("event_id", eventId)
    .order("tier", { ascending: true })
    .order("display_order", { ascending: true })

  if (error) return []
  return (data ?? []) as EventSponsor[]
}

function revalidateEventSurfaces(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/edit`)
  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/cuenta/entradas`)
}

export async function createEventSponsor(
  eventId: string,
  formData: FormData,
): Promise<ActionResult<EventSponsor>> {
  try {
    const access = await requireEventOrganizer(eventId)
    if (!access.ok) return { success: false, error: access.error }

    const { count } = await access.supabase
      .from("event_sponsors")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)

    if ((count ?? 0) >= MAX_EVENT_SPONSORS) {
      return {
        success: false,
        error: `Máximo ${MAX_EVENT_SPONSORS} sponsors por evento.`,
      }
    }

    const name = String(formData.get("name") ?? "").trim()
    const websiteUrl = normalizeSponsorWebsite(String(formData.get("websiteUrl") ?? ""))
    const tierRaw = String(formData.get("tier") ?? "regular")
    const tier: SponsorTier = tierRaw === "main" ? "main" : "regular"
    const file = formData.get("logo")

    if (name.length < 2) {
      return { success: false, error: "El nombre debe tener al menos 2 caracteres." }
    }
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: "Subí un logo PNG o SVG transparente." }
    }
    if (!SPONSOR_LOGO_TYPES.has(file.type)) {
      return { success: false, error: "Solo PNG, SVG, JPG o WEBP." }
    }
    if (file.size > MAX_SPONSOR_LOGO_BYTES) {
      return { success: false, error: "El logo no puede superar 2 MB." }
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "png"
    const path = `events/${eventId}/${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await access.supabase.storage
      .from("sponsors")
      .upload(path, file, {
        upsert: false,
        contentType: file.type,
        cacheControl: "3600",
      })

    if (uploadError) {
      return { success: false, error: `No se pudo subir el logo: ${uploadError.message}` }
    }

    const { data: publicUrl } = access.supabase.storage.from("sponsors").getPublicUrl(path)
    const { data, error } = await access.supabase
      .from("event_sponsors")
      .insert({
        event_id: eventId,
        name,
        logo_url: publicUrl.publicUrl,
        website_url: websiteUrl,
        tier,
        display_order: (count ?? 0) * 10 + 10,
      })
      .select("*")
      .single()

    if (error || !data) {
      await access.supabase.storage.from("sponsors").remove([path])
      return { success: false, error: error?.message ?? "No se pudo guardar el sponsor." }
    }

    revalidateEventSurfaces(eventId)
    return { success: true, data: data as EventSponsor }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al crear el sponsor.",
    }
  }
}

export async function deleteEventSponsor(
  eventId: string,
  sponsorId: string,
): Promise<ActionResult> {
  try {
    const access = await requireEventOrganizer(eventId)
    if (!access.ok) return { success: false, error: access.error }

    const { data: row } = await access.supabase
      .from("event_sponsors")
      .select("logo_url")
      .eq("id", sponsorId)
      .eq("event_id", eventId)
      .maybeSingle()

    const { error } = await access.supabase
      .from("event_sponsors")
      .delete()
      .eq("id", sponsorId)
      .eq("event_id", eventId)

    if (error) return { success: false, error: error.message }

    const path = row?.logo_url ? storagePathFromSponsorUrl(row.logo_url) : null
    if (path) {
      await access.supabase.storage.from("sponsors").remove([path.split("?")[0] ?? path])
    }

    revalidateEventSurfaces(eventId)
    return { success: true, data: undefined }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo eliminar.",
    }
  }
}
