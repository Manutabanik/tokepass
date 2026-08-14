"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"
import {
  parseVenueMap,
  serializeVenueMap,
  type InteractiveVenueMap,
} from "@/types/venue-map"

export type OrganizerVenueTemplate = {
  id: string
  name: string
  venueMap: InteractiveVenueMap
  createdAt: string
  updatedAt: string
}

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

const MAX_TEMPLATES = 20
const MAX_JSON_CHARS = 400_000

async function requireOrganizer() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Tenés que iniciar sesión." }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "super_admin")
  ) {
    return { ok: false as const, error: "No tenés permiso para guardar plantillas." }
  }

  return { ok: true as const, supabase, userId: user.id }
}

function normalizeName(value: string): string | null {
  const name = value.trim().replace(/\s+/g, " ")
  if (name.length < 2 || name.length > 80) return null
  return name
}

export async function listOrganizerVenueTemplates(): Promise<
  ActionResult<OrganizerVenueTemplate[]>
> {
  const auth = await requireOrganizer()
  if (!auth.ok) return { success: false, error: auth.error }

  const { data, error } = await auth.supabase
    .from("organization_venue_templates")
    .select("id, name, venue_map, created_at, updated_at")
    .eq("organizer_id", auth.userId)
    .order("updated_at", { ascending: false })

  if (error) {
    return { success: false, error: "No se pudieron cargar tus plantillas." }
  }

  return {
    success: true,
    data: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      venueMap: parseVenueMap(row.venue_map),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  }
}

export async function saveOrganizerVenueTemplate(input: {
  name: string
  map: InteractiveVenueMap
}): Promise<ActionResult<OrganizerVenueTemplate>> {
  const auth = await requireOrganizer()
  if (!auth.ok) return { success: false, error: auth.error }

  const name = normalizeName(input.name)
  if (!name) {
    return {
      success: false,
      error: "El nombre debe tener entre 2 y 80 caracteres.",
    }
  }

  const venueMap = serializeVenueMap(parseVenueMap(input.map))
  const encoded = JSON.stringify(venueMap)
  if (encoded.length > MAX_JSON_CHARS) {
    return {
      success: false,
      error: "El mapa es demasiado grande para guardarlo como plantilla.",
    }
  }

  const { count } = await auth.supabase
    .from("organization_venue_templates")
    .select("id", { count: "exact", head: true })
    .eq("organizer_id", auth.userId)

  if ((count ?? 0) >= MAX_TEMPLATES) {
    return {
      success: false,
      error: `Podés guardar hasta ${MAX_TEMPLATES} plantillas.`,
    }
  }

  const { data, error } = await auth.supabase
    .from("organization_venue_templates")
    .insert({
      organizer_id: auth.userId,
      name,
      venue_map: venueMap as unknown as Json,
    })
    .select("id, name, venue_map, created_at, updated_at")
    .single()

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Ya existe una plantilla con ese nombre." }
    }
    return { success: false, error: "No se pudo guardar la plantilla." }
  }

  revalidatePath("/admin")
  return {
    success: true,
    data: {
      id: data.id,
      name: data.name,
      venueMap: parseVenueMap(data.venue_map),
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  }
}

export async function deleteOrganizerVenueTemplate(
  id: string,
): Promise<ActionResult> {
  const auth = await requireOrganizer()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!id.trim()) return { success: false, error: "Plantilla inválida." }

  const { error } = await auth.supabase
    .from("organization_venue_templates")
    .delete()
    .eq("id", id)
    .eq("organizer_id", auth.userId)

  if (error) {
    return { success: false, error: "No se pudo eliminar la plantilla." }
  }

  revalidatePath("/admin")
  return { success: true, data: undefined }
}
