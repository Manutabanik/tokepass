"use server"

import { revalidatePath } from "next/cache"

import { isValidPromoVideoUrl, parsePromoVideoUrl } from "@/lib/promo-video"
import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/types/database"
import type { SupabaseClient } from "@supabase/supabase-js"

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

export type EventMultimediaSettings = {
  eventId: string
  eventTitle: string
  promoVideoUrl: string | null
  galleryUrls: string[]
  socialShareImageUrl: string | null
}

const MAX_GALLERY = 4
const MAX_GALLERY_BYTES = 2 * 1024 * 1024
/** Stories 1080×1920: tope más estricto que el flyer principal (5 MB). */
const MAX_STORY_BYTES = 3 * 1024 * 1024
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"])

async function requireEventOrganizer(eventId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Debés iniciar sesión." }

  const [{ data: profile }, { data: event }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("events")
      .select(
        "id, title, organizer_id, promo_video_url, gallery_urls, social_share_image_url",
      )
      .eq("id", eventId)
      .maybeSingle(),
  ])

  if (!event) return { ok: false as const, error: "Evento no encontrado." }
  if (event.organizer_id !== user.id && profile?.role !== "super_admin") {
    return { ok: false as const, error: "No tenés permiso para este evento." }
  }

  return { ok: true as const, supabase, event, userId: user.id }
}

function normalizeGallery(urls: unknown): string[] {
  if (!Array.isArray(urls)) return []
  return urls
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, MAX_GALLERY)
}

function toSettings(event: {
  id: string
  title: string
  promo_video_url: string | null
  gallery_urls: unknown
  social_share_image_url: string | null
}): EventMultimediaSettings {
  return {
    eventId: event.id,
    eventTitle: event.title,
    promoVideoUrl: event.promo_video_url?.trim() || null,
    galleryUrls: normalizeGallery(event.gallery_urls),
    socialShareImageUrl: event.social_share_image_url?.trim() || null,
  }
}

function storagePathFromPublicUrl(imageUrl: string): string | null {
  const path = imageUrl.split("/event-flyers/")[1]
  return path ? decodeURIComponent(path.split("?")[0] ?? path) : null
}

export async function getEventMultimediaSettings(
  eventId: string,
): Promise<EventMultimediaSettings | null> {
  const access = await requireEventOrganizer(eventId)
  if (!access.ok) return null
  return toSettings(access.event)
}

export async function updateEventMultimediaSettings(
  eventId: string,
  input: {
    promoVideoUrl: string | null
    galleryUrls: string[]
  },
): Promise<ActionResult<EventMultimediaSettings>> {
  try {
    const access = await requireEventOrganizer(eventId)
    if (!access.ok) return { success: false, error: access.error }

    const rawVideo = input.promoVideoUrl?.trim() || ""
    if (rawVideo && !isValidPromoVideoUrl(rawVideo)) {
      return {
        success: false,
        error: "El video debe ser un link válido de YouTube o Vimeo.",
      }
    }

    const parsed = rawVideo ? parsePromoVideoUrl(rawVideo) : null
    const galleryUrls = normalizeGallery(input.galleryUrls)

    if (galleryUrls.length > MAX_GALLERY) {
      return {
        success: false,
        error: `Máximo ${MAX_GALLERY} fotos en la galería.`,
      }
    }

    const { error } = await access.supabase
      .from("events")
      .update({
        promo_video_url: parsed?.canonicalUrl ?? null,
        gallery_urls: galleryUrls,
      })
      .eq("id", eventId)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath(`/admin/events/${eventId}`)
    revalidatePath(`/admin/events/${eventId}/multimedia`)
    revalidatePath(`/events/${eventId}`)
    revalidatePath("/")

    return {
      success: true,
      data: {
        ...toSettings(access.event),
        promoVideoUrl: parsed?.canonicalUrl ?? null,
        galleryUrls,
      },
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo guardar la experiencia multimedia.",
    }
  }
}

function sanitizeFileName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 80)
}

async function uploadGalleryImage(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  file: File,
): Promise<{ url: string } | { error: string }> {
  if (!ALLOWED_TYPES.has(file.type)) {
    return { error: "Solo PNG, JPG o WEBP." }
  }
  if (file.size > MAX_GALLERY_BYTES) {
    return { error: "Cada imagen debe pesar como máximo 2 MB." }
  }

  const uniqueName = `${Date.now()}-${sanitizeFileName(file.name || "gallery.jpg")}`
  const path = `${userId}/${eventId}/gallery/${uniqueName}`

  const { error: uploadError } = await supabase.storage
    .from("event-flyers")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    })

  if (uploadError) {
    return { error: `No se pudo subir la imagen: ${uploadError.message}` }
  }

  const { data } = supabase.storage.from("event-flyers").getPublicUrl(path)
  if (!data?.publicUrl) {
    await supabase.storage.from("event-flyers").remove([path])
    return { error: "No se pudo obtener la URL pública." }
  }

  return { url: data.publicUrl }
}

export async function uploadEventGalleryImage(
  eventId: string,
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  try {
    const access = await requireEventOrganizer(eventId)
    if (!access.ok) return { success: false, error: access.error }

    const current = normalizeGallery(access.event.gallery_urls)
    if (current.length >= MAX_GALLERY) {
      return {
        success: false,
        error: `Ya tenés ${MAX_GALLERY} fotos. Eliminá una para subir otra.`,
      }
    }

    const file = formData.get("image")
    if (!(file instanceof File) || file.size <= 0) {
      return { success: false, error: "Seleccioná una imagen." }
    }

    const uploaded = await uploadGalleryImage(
      access.supabase,
      access.userId,
      eventId,
      file,
    )
    if ("error" in uploaded) {
      return { success: false, error: uploaded.error }
    }

    const next = [...current, uploaded.url]
    const { error } = await access.supabase
      .from("events")
      .update({ gallery_urls: next })
      .eq("id", eventId)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath(`/admin/events/${eventId}/multimedia`)
    revalidatePath(`/events/${eventId}`)

    return { success: true, data: { url: uploaded.url } }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al subir la imagen.",
    }
  }
}

export async function removeEventGalleryImage(
  eventId: string,
  imageUrl: string,
): Promise<ActionResult<EventMultimediaSettings>> {
  try {
    const access = await requireEventOrganizer(eventId)
    if (!access.ok) return { success: false, error: access.error }

    const current = normalizeGallery(access.event.gallery_urls)
    const next = current.filter((url) => url !== imageUrl)

    const { error } = await access.supabase
      .from("events")
      .update({ gallery_urls: next })
      .eq("id", eventId)

    if (error) {
      return { success: false, error: error.message }
    }

    const path = storagePathFromPublicUrl(imageUrl)
    if (path) {
      await access.supabase.storage.from("event-flyers").remove([path])
    }

    revalidatePath(`/admin/events/${eventId}/multimedia`)
    revalidatePath(`/events/${eventId}`)

    return {
      success: true,
      data: {
        ...toSettings(access.event),
        galleryUrls: next,
      },
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo eliminar la imagen.",
    }
  }
}

export async function uploadEventSocialShareImage(
  eventId: string,
  formData: FormData,
): Promise<ActionResult<EventMultimediaSettings>> {
  try {
    const access = await requireEventOrganizer(eventId)
    if (!access.ok) return { success: false, error: access.error }

    const file = formData.get("image")
    if (!(file instanceof File) || file.size <= 0) {
      return { success: false, error: "Seleccioná una imagen." }
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return { success: false, error: "Solo PNG, JPG o WEBP." }
    }
    if (file.size > MAX_STORY_BYTES) {
      return {
        success: false,
        error: "La imagen de Stories debe pesar como máximo 3 MB.",
      }
    }

    const uniqueName = `${Date.now()}-${sanitizeFileName(file.name || "story.jpg")}`
    const path = `${access.userId}/${eventId}/social-share/${uniqueName}`

    const { error: uploadError } = await access.supabase.storage
      .from("event-flyers")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      })

    if (uploadError) {
      return {
        success: false,
        error: `No se pudo subir la imagen: ${uploadError.message}`,
      }
    }

    const { data } = access.supabase.storage
      .from("event-flyers")
      .getPublicUrl(path)

    if (!data?.publicUrl) {
      await access.supabase.storage.from("event-flyers").remove([path])
      return { success: false, error: "No se pudo obtener la URL pública." }
    }

    const previous = access.event.social_share_image_url?.trim() || null

    const { error } = await access.supabase
      .from("events")
      .update({ social_share_image_url: data.publicUrl })
      .eq("id", eventId)

    if (error) {
      await access.supabase.storage.from("event-flyers").remove([path])
      return { success: false, error: error.message }
    }

    if (previous && previous !== data.publicUrl) {
      const oldPath = storagePathFromPublicUrl(previous)
      if (oldPath) {
        await access.supabase.storage.from("event-flyers").remove([oldPath])
      }
    }

    revalidatePath(`/admin/events/${eventId}/multimedia`)
    revalidatePath(`/events/${eventId}`)

    return {
      success: true,
      data: {
        ...toSettings(access.event),
        socialShareImageUrl: data.publicUrl,
      },
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo subir el flyer de Stories.",
    }
  }
}

export async function removeEventSocialShareImage(
  eventId: string,
): Promise<ActionResult<EventMultimediaSettings>> {
  try {
    const access = await requireEventOrganizer(eventId)
    if (!access.ok) return { success: false, error: access.error }

    const previous = access.event.social_share_image_url?.trim() || null

    const { error } = await access.supabase
      .from("events")
      .update({ social_share_image_url: null })
      .eq("id", eventId)

    if (error) {
      return { success: false, error: error.message }
    }

    if (previous) {
      const path = storagePathFromPublicUrl(previous)
      if (path) {
        await access.supabase.storage.from("event-flyers").remove([path])
      }
    }

    revalidatePath(`/admin/events/${eventId}/multimedia`)
    revalidatePath(`/events/${eventId}`)

    return {
      success: true,
      data: {
        ...toSettings(access.event),
        socialShareImageUrl: null,
      },
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el flyer de Stories.",
    }
  }
}
