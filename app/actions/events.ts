"use server"

import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import {
  eventFormSchema,
  type EventFormValues,
} from "@/lib/validations/event-form"
import type { Database, Event, Json, Venue } from "@/types/database"

export type OrganizerEvent = Pick<
  Event,
  | "id"
  | "title"
  | "description"
  | "date"
  | "location"
  | "image_url"
  | "status"
  | "venue_id"
  | "created_at"
> & {
  venues: Pick<Venue, "id" | "name" | "location"> | null
}

async function requireAuthenticatedUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error("Debes iniciar sesión para administrar eventos.")
  }

  return { supabase, user }
}

function requiredText(formData: FormData, field: string, label: string) {
  const value = formData.get(field)

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} es obligatorio.`)
  }

  return value.trim()
}

function optionalText(formData: FormData, field: string) {
  const value = formData.get(field)
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export async function getOrganizerEvents(): Promise<OrganizerEvent[]> {
  const { supabase, user } = await requireAuthenticatedUser()
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, description, date, location, image_url, status, venue_id, created_at, venues(id, name, location)",
    )
    .eq("organizer_id", user.id)
    .order("date", { ascending: true })

  if (error) {
    throw new Error(`No se pudieron cargar los eventos: ${error.message}`)
  }

  return data
}

export async function createEvent(formData: FormData): Promise<Event> {
  const { supabase, user } = await requireAuthenticatedUser()
  const title = requiredText(formData, "title", "El título")
  const location = requiredText(formData, "location", "La ubicación")
  const dateValue = requiredText(formData, "date", "La fecha")
  const parsedDate = new Date(dateValue)

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("La fecha del evento no es válida.")
  }

  const { data, error } = await supabase
    .from("events")
    .insert({
      organizer_id: user.id,
      title,
      description: optionalText(formData, "description"),
      date: parsedDate.toISOString(),
      location,
      image_url: optionalText(formData, "imageUrl"),
      venue_id: optionalText(formData, "venueId"),
      status: "draft",
    })
    .select("*")
    .single()

  if (error) {
    throw new Error(`No se pudo crear el evento: ${error.message}`)
  }

  revalidatePath("/admin")
  revalidatePath("/admin/events")

  return data
}

/** JSON contract expected by `public.create_complete_event_tx`. */
export type CreateCompleteEventRpcPayload = {
  title: string
  description: string
  date: string
  location: string
  image_url: string | null
  flyer_url: string | null
  venue: {
    name: string
    location: string
    capacity: number
  }
  zones: Array<{
    name: string
    type: "general_admission" | "reserved_seating"
    capacity: number
    rows: number | null
    seats_per_row: number | null
  }>
  tiers: Array<{
    name: string
    price: number
    capacity: number
    time_limit: string | null
    bonus_reward: string | null
    zone_index: number
  }>
  rrpp_commission: number | null
  addons_enabled: boolean
}

function mapEventFormToRpcPayload(
  data: EventFormValues,
  flyerUrl: string | null = null,
): CreateCompleteEventRpcPayload {
  const isGeneralAdmission = data.venue.zoneType === "general_admission"
  const capacity = isGeneralAdmission
    ? (data.venue.capacity ?? 0)
    : (data.venue.rows ?? 0) * (data.venue.seatsPerRow ?? 0)

  return {
    title: data.basics.title,
    description: data.basics.description,
    date: new Date(data.basics.date).toISOString(),
    location: data.venue.venueName,
    image_url: flyerUrl,
    flyer_url: flyerUrl,
    venue: {
      name: data.venue.venueName,
      location: data.venue.venueName,
      capacity,
    },
    zones: [
      {
        name: isGeneralAdmission ? "General" : "Platea",
        type: data.venue.zoneType,
        capacity,
        rows: isGeneralAdmission ? null : (data.venue.rows ?? null),
        seats_per_row: isGeneralAdmission
          ? null
          : (data.venue.seatsPerRow ?? null),
      },
    ],
    tiers: data.tickets.map((tier) => ({
      name: tier.name,
      price: tier.price,
      capacity: tier.capacity,
      time_limit: tier.timeLimit?.trim() ? tier.timeLimit.trim() : null,
      bonus_reward: tier.bonusReward?.trim() ? tier.bonusReward.trim() : null,
      zone_index: 0,
    })),
    rrpp_commission: data.growth.isRRPPEnabled
      ? (data.growth.commissionPercentage ?? null)
      : null,
    addons_enabled: data.growth.isAddonsEnabled,
  }
}

const ALLOWED_FLYER_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
])
const MAX_FLYER_BYTES = 5 * 1024 * 1024

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 80)
}

async function uploadEventFlyer(
  supabase: SupabaseClient<Database>,
  userId: string,
  file: File,
): Promise<{ url: string } | { error: string }> {
  if (!ALLOWED_FLYER_TYPES.has(file.type)) {
    return {
      error: "El flyer debe ser PNG, JPG o WEBP.",
    }
  }

  if (file.size > MAX_FLYER_BYTES) {
    return {
      error: "El flyer no puede superar los 5 MB.",
    }
  }

  const uniqueName = `${Date.now()}-${sanitizeFileName(file.name || "flyer.jpg")}`
  const path = `${userId}/${uniqueName}`

  const { error: uploadError } = await supabase.storage
    .from("event-flyers")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    })

  if (uploadError) {
    return {
      error: `No se pudo subir el flyer: ${uploadError.message}`,
    }
  }

  const { data } = supabase.storage.from("event-flyers").getPublicUrl(path)

  if (!data?.publicUrl) {
    await supabase.storage.from("event-flyers").remove([path])
    return { error: "No se pudo obtener la URL pública del flyer." }
  }

  return { url: data.publicUrl }
}

export type CreateCompleteEventResult =
  | { success: true; eventId: string }
  | { success: false; error: string }

/**
 * Crea el evento atómicamente. Espera FormData con:
 * - `payload`: JSON string de `EventFormValues`
 * - `flyer`: File opcional (imagen)
 */
export async function createCompleteEvent(
  formData: FormData,
): Promise<CreateCompleteEventResult> {
  const rawPayload = formData.get("payload")
  if (typeof rawPayload !== "string") {
    return {
      success: false,
      error: "Payload del evento inválido.",
    }
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawPayload)
  } catch {
    return {
      success: false,
      error: "No se pudo interpretar la configuración del evento.",
    }
  }

  const parsed = eventFormSchema.safeParse(parsedJson)

  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        "La configuración del evento no es válida.",
    }
  }

  let supabase: Awaited<ReturnType<typeof createClient>>
  let userId: string

  try {
    const session = await requireAuthenticatedUser()
    supabase = session.supabase
    userId = session.user.id
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Debes iniciar sesión para crear un evento.",
    }
  }

  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle()

  const actorRole = actorProfile?.role ?? null

  // White-glove: solo super_admin puede crear a nombre de otra productora.
  // Un admin normal siempre queda atado a su propio ID (ignora el param).
  let organizerId = userId
  const targetRaw = formData.get("targetOrganizerId")
  const targetOrganizerId =
    typeof targetRaw === "string" && targetRaw.trim() ? targetRaw.trim() : null

  if (targetOrganizerId && actorRole === "super_admin") {
    const admin = createAdminClient()
    const { data: targetProfile, error: targetError } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", targetOrganizerId)
      .maybeSingle()

    if (
      targetError ||
      !targetProfile ||
      (targetProfile.role !== "admin" && targetProfile.role !== "super_admin")
    ) {
      return {
        success: false,
        error: "La productora destino no existe o no es un organizador válido.",
      }
    }

    organizerId = targetProfile.id
  }

  const flyerEntry = formData.get("flyer")
  let flyerUrl: string | null = null

  // Cliente RPC: service-role si impersonamos (el RPC exige auth.uid = organizer
  // o service_role). Caso normal: sesión del organizador.
  const rpcClient =
    organizerId !== userId ? createAdminClient() : supabase

  if (flyerEntry instanceof File && flyerEntry.size > 0) {
    const uploaded = await uploadEventFlyer(rpcClient, organizerId, flyerEntry)
    if ("error" in uploaded) {
      return { success: false, error: uploaded.error }
    }
    flyerUrl = uploaded.url
  }

  const rpcPayload = mapEventFormToRpcPayload(parsed.data, flyerUrl)

  const { data: eventId, error } = await rpcClient.rpc(
    "create_complete_event_tx",
    {
      payload: rpcPayload as unknown as Json,
      p_organizer_id: organizerId,
    },
  )

  if (error) {
    if (flyerUrl) {
      const path = flyerUrl.split("/event-flyers/")[1]
      if (path) {
        await rpcClient.storage.from("event-flyers").remove([path])
      }
    }

    return {
      success: false,
      error: error.message.replace(/^create_complete_event_tx:\s*/i, ""),
    }
  }

  if (!eventId) {
    return {
      success: false,
      error: "La base de datos no devolvió el ID del evento.",
    }
  }

  revalidatePath("/admin")
  revalidatePath("/admin/events")
  revalidatePath("/events")
  revalidatePath("/")
  revalidatePath("/superadmin")
  revalidatePath("/super-admin")
  revalidatePath("/superadmin/events")

  return { success: true, eventId }
}
