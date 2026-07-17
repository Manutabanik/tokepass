"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import {
  eventFormSchema,
  type EventFormValues,
} from "@/lib/validations/event-form"
import type { Event, Venue } from "@/types/database"

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

export type CreateCompleteEventResult =
  | { success: true }
  | { success: false; error: string }

export async function createCompleteEvent(
  payload: EventFormValues,
): Promise<CreateCompleteEventResult> {
  await requireAuthenticatedUser()

  const parsed = eventFormSchema.safeParse(payload)

  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        "La configuración del evento no es válida.",
    }
  }

  // Esqueleto transaccional: en la siguiente iteración persistirá venue,
  // evento, zonas, asientos, tiers, RRPP y add-ons de forma atómica.
  console.info("[createCompleteEvent] payload validado", parsed.data)

  return { success: true }
}
