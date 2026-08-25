"use server"

import { revalidatePath } from "next/cache"

import { formatSupabaseError } from "@/lib/errors/supabase-error"
import { isPlatformOwnerRole } from "@/lib/auth/platform-owner"
import {
  isEventDraftStateEmpty,
  rehydrateEventDraftV2,
} from "@/lib/events/rehydrate-event-draft-v2"
import {
  buildPublishEventV2Payload,
  formatEventPublishIssues,
  freePublishCapacity,
  type PublishEventV2Issue,
  type PublishEventV2Payload,
  type PublishEventV2TierPayload,
} from "@/lib/events/publish-event-v2"
import { revalidatePublicEventCache } from "@/lib/events/revalidate-public-event"
import {
  bytesToBlob,
  detectRasterImageMagic,
  rasterContentType,
  readFileBytes,
} from "@/lib/media/image-magic"
import {
  DEFAULT_MAX_FREE_TICKETS,
  DEFAULT_PLATFORM_FEE_PERCENTAGE,
  DEFAULT_PLATFORM_FIXED_FEE,
} from "@/lib/pricing/event-fees"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import {
  eventPublishSchema,
  parseEventDraftV2,
  toEventDraftV2Payload,
} from "@/lib/validations/event-draft-v2"
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
    .select(
      "id, organizer_id, status, draft_state, title, date, ends_at, location, description, flyer_url, image_url, social_share_image_url, visibility, refund_policy, province, department, delivery_mode, venue_map, venue_id",
    )
    .eq("id", id)
    .maybeSingle()
  if (error) return { success: false, error: formatSupabaseError(error) }
  if (!data) return { success: false, error: "Evento no encontrado.", code: "NOT_FOUND" }
  if (data.organizer_id !== gate.userId && !gate.isSuperAdmin) {
    return { success: false, error: "No tenés permiso para editar este evento." }
  }

  if (data.status === "published" && isEventDraftStateEmpty(data.draft_state)) {
    const draftState = await persistRehydratedPublishedDraft({
      supabase: gate.supabase,
      event: data,
    })
    return {
      success: true,
      eventId: data.id,
      draftState,
    }
  }

  return {
    success: true,
    eventId: data.id,
    draftState: (data.draft_state ?? null) as Json | null,
  }
}

async function persistRehydratedPublishedDraft(input: {
  supabase: Awaited<ReturnType<typeof createClient>>
  event: {
    id: string
    title: string | null
    date: string | null
    ends_at: string | null
    location: string | null
    description: string | null
    flyer_url: string | null
    image_url: string | null
    social_share_image_url: string | null
    visibility: string | null
    refund_policy: string | null
    province: string | null
    department: string | null
    delivery_mode: string | null
    venue_map: unknown
    venue_id: string | null
  }
}): Promise<Json> {
  const venueQuery = input.event.venue_id
    ? await input.supabase
        .from("venues")
        .select(
          "name, location, address, city, latitude, longitude, capacity, max_capacity, venue_map",
        )
        .eq("id", input.event.venue_id)
        .maybeSingle()
    : { data: null, error: null }
  const ticketsQuery = await input.supabase
    .from("ticket_tiers")
    .select(
      "id, name, description, price, capacity, min_purchase_limit, max_purchase_limit, tier_type, category, layout_type, seating_sector_id",
    )
    .eq("event_id", input.event.id)
    .order("created_at", { ascending: true })

  const draftState = toEventDraftV2Payload(
    rehydrateEventDraftV2({
      event: input.event,
      venue: venueQuery.error ? null : (venueQuery.data ?? null),
      tickets: ticketsQuery.error ? [] : (ticketsQuery.data ?? []),
    }),
  ) as Json

  const written = await input.supabase
    .from("events")
    .update({
      draft_state: draftState,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.event.id)
    .select("id, draft_state")
    .maybeSingle()

  if (written.error || !written.data?.id) {
    return draftState
  }
  return (written.data.draft_state ?? draftState) as Json
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

export type PublishEventV2Result =
  | { success: true; eventId: string }
  | { success: false; error: string; issues?: PublishEventV2Issue[] }

function isMissingPublishRpc(error: { code?: string; message?: string } | null) {
  if (!error) return false
  const code = String(error.code ?? "")
  return code === "PGRST202" || code === "42883"
}

async function upsertPublishedVenue(input: {
  organizerId: string
  existingVenueId: string | null
  venue: PublishEventV2Payload["venue"]
  venueMap?: Json
}): Promise<string> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const patch = {
    name: input.venue.name,
    location: input.venue.location,
    address: input.venue.location,
    city: input.venue.city,
    latitude: input.venue.latitude,
    longitude: input.venue.longitude,
    capacity: input.venue.capacity,
    max_capacity: input.venue.capacity,
    updated_at: now,
    ...(input.venueMap ? { venue_map: input.venueMap } : {}),
  }

  if (input.existingVenueId) {
    const written = await admin
      .from("venues")
      .update(patch)
      .eq("id", input.existingVenueId)
      .eq("organizer_id", input.organizerId)
      .select("id")
      .maybeSingle()
    if (written.error) throw new Error(formatSupabaseError(written.error))
    if (written.data?.id) return written.data.id
  }

  const existing = await admin
    .from("venues")
    .select("id")
    .eq("organizer_id", input.organizerId)
    .eq("name", input.venue.name)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existing.error) throw new Error(formatSupabaseError(existing.error))
  if (existing.data?.id) {
    const written = await admin
      .from("venues")
      .update(patch)
      .eq("id", existing.data.id)
      .select("id")
      .maybeSingle()
    if (written.error) throw new Error(formatSupabaseError(written.error))
    if (!written.data?.id) {
      throw new Error("venues.update no devolvió fila")
    }
    return written.data.id
  }

  const inserted = await admin
    .from("venues")
    .insert({
      organizer_id: input.organizerId,
      zone_blueprint: [],
      ...patch,
    } as never)
    .select("id")
    .maybeSingle()
  if (inserted.error) throw new Error(formatSupabaseError(inserted.error))
  if (!inserted.data?.id) {
    throw new Error("venues.insert no devolvió fila")
  }
  return inserted.data.id
}

function relationalTierRow(
  eventId: string,
  ticket: PublishEventV2TierPayload,
  sold: number,
) {
  const capacity = Math.max(ticket.capacity, sold)
  return {
    event_id: eventId,
    name: ticket.name,
    description: ticket.description,
    price: ticket.price,
    base_price: ticket.base_price,
    platform_fee: ticket.platform_fee,
    capacity,
    total_capacity: capacity,
    min_purchase_limit: ticket.min_purchase_limit,
    max_purchase_limit: ticket.max_purchase_limit,
    tier_type: ticket.tier_type,
    category: ticket.category,
    layout_type: ticket.layout_type,
    seating_sector_id: ticket.seating_sector_id,
    visibility: "public" as const,
    capacity_per_unit: 1,
    admit_count: 1,
    bundle_items: [] as Json,
    updated_at: new Date().toISOString(),
  }
}

async function syncPublishedTickets(
  eventId: string,
  tickets: PublishEventV2TierPayload[],
) {
  const admin = createAdminClient()
  const existing = await admin
    .from("ticket_tiers")
    .select("id, sold, tier_type, event_id")
    .eq("event_id", eventId)
  if (existing.error) throw new Error(formatSupabaseError(existing.error))

  const byId = new Map((existing.data ?? []).map((row) => [row.id, row]))
  const seen = new Set<string>()

  for (const ticket of tickets) {
    const current = ticket.id ? byId.get(ticket.id) : undefined
    if (current && current.event_id !== eventId) {
      throw new Error(`El ticket ${ticket.name} pertenece a otro evento.`)
    }
    const sold = Number(current?.sold ?? 0)
    if (sold > ticket.capacity) {
      throw new Error(
        `La capacidad de "${ticket.name}" no puede ser menor a ${sold} entradas vendidas.`,
      )
    }
    const row = relationalTierRow(eventId, ticket, sold)
    if (current) {
      const written = await admin
        .from("ticket_tiers")
        .update(row)
        .eq("id", current.id)
        .eq("event_id", eventId)
        .select("id")
        .maybeSingle()
      if (written.error) throw new Error(formatSupabaseError(written.error))
      if (!written.data?.id) {
        throw new Error(`ticket_tiers.update no devolvió fila (${ticket.name})`)
      }
      seen.add(written.data.id)
      continue
    }

    const inserted = await admin
      .from("ticket_tiers")
      .insert(ticket.id ? { id: ticket.id, ...row, sold: 0 } : { ...row, sold: 0 })
      .select("id")
      .maybeSingle()
    if (inserted.error) throw new Error(formatSupabaseError(inserted.error))
    if (!inserted.data?.id) {
      throw new Error(`ticket_tiers.insert no devolvió fila (${ticket.name})`)
    }
    seen.add(inserted.data.id)
  }

  const leftovers = (existing.data ?? []).filter(
    (row) =>
      (row.tier_type === "general" ||
        row.tier_type === "addon" ||
        row.tier_type === "seated") &&
      !seen.has(row.id),
  )
  const blocked = leftovers.find((row) => Number(row.sold) > 0)
  if (blocked) {
    throw new Error("No podés quitar un ticket con entradas vendidas.")
  }
  const removable = leftovers.map((row) => row.id)
  if (removable.length > 0) {
    const removed = await admin
      .from("ticket_tiers")
      .delete()
      .eq("event_id", eventId)
      .in("id", removable)
    if (removed.error) throw new Error(formatSupabaseError(removed.error))
  }
}

async function unpackPublishEventV2Sequential(input: {
  eventId: string
  organizerId: string
  existingVenueId: string | null
  existingFlyerUrl: string | null
  existingImageUrl: string | null
  existingShareUrl: string | null
  payload: PublishEventV2Payload
}) {
  const venueId = await upsertPublishedVenue({
    organizerId: input.organizerId,
    existingVenueId: input.existingVenueId,
    venue: input.payload.venue,
    venueMap: input.payload.venue_map,
  })
  await syncPublishedTickets(input.eventId, input.payload.tickets)

  const admin = createAdminClient()
  const written = await admin
    .from("events")
    .update({
      title: input.payload.title,
      description: input.payload.description,
      date: input.payload.date,
      ends_at: input.payload.ends_at,
      location: input.payload.location,
      province: input.payload.venue.province,
      department: input.payload.venue.city,
      delivery_mode: input.payload.delivery_mode,
      visibility: input.payload.visibility,
      flyer_url: input.payload.flyer_url ?? input.existingFlyerUrl,
      image_url:
        input.payload.image_url ??
        input.payload.flyer_url ??
        input.existingImageUrl,
      social_share_image_url:
        input.payload.social_share_image_url ?? input.existingShareUrl,
      refund_policy: input.payload.refund_policy,
      venue_id: venueId,
      ...(input.payload.venue_map ? { venue_map: input.payload.venue_map } : {}),
      has_seating_plan: input.payload.has_seating_plan,
      status: "published",
      draft_state: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", input.eventId)
    .select("id, slug")
    .maybeSingle()
  if (written.error) throw new Error(formatSupabaseError(written.error))
  if (!written.data?.id) {
    throw new Error("events.update publish no devolvió fila")
  }
  if (input.payload.has_seating_plan) {
    const materialized = await admin.rpc("materialize_event_seating_units", {
      p_event_id: input.eventId,
    })
    if (materialized.error) {
      throw new Error(formatSupabaseError(materialized.error))
    }
  }
  return written.data
}

/**
 * Reads draft_state, validates with eventPublishSchema, then unpacks
 * the JSON into events / venues / ticket_tiers. RPC first (atomic);
 * sequential admin writes if the function is not deployed yet.
 */
export async function publishEventV2(
  eventId: string,
): Promise<PublishEventV2Result> {
  const id = eventId.trim()
  if (!id) return { success: false, error: "Evento inválido." }

  const gate = await requireDraftWriter()
  if (!gate.ok) return { success: false, error: gate.error }

  const { data: event, error: eventError } = await gate.supabase
    .from("events")
    .select(
      "id, organizer_id, venue_id, draft_state, slug, flyer_url, image_url, social_share_image_url, platform_fee_percentage, platform_fixed_fee, max_free_tickets, is_sponsored_by_tokepass",
    )
    .eq("id", id)
    .maybeSingle()
  if (eventError) return { success: false, error: formatSupabaseError(eventError) }
  if (!event) return { success: false, error: "Evento no encontrado." }
  if (event.organizer_id !== gate.userId && !gate.isSuperAdmin) {
    return { success: false, error: "No tenés permiso para publicar este evento." }
  }

  const parsed = eventPublishSchema.safeParse(
    parseEventDraftV2(event.draft_state),
  )
  if (!parsed.success) {
    const issues = formatEventPublishIssues(parsed.error.issues)
    return {
      success: false,
      error: issues.map((issue) => `${issue.path}: ${issue.message}`).join(" · "),
      issues,
    }
  }

  let payload: PublishEventV2Payload
  try {
    payload = buildPublishEventV2Payload(parsed.data, {
      platformFeePercentage: Number(
        event.platform_fee_percentage ?? DEFAULT_PLATFORM_FEE_PERCENTAGE,
      ),
      platformFixedFee: Number(
        event.platform_fixed_fee ?? DEFAULT_PLATFORM_FIXED_FEE,
      ),
      maxFreeTickets: Number(event.max_free_tickets ?? DEFAULT_MAX_FREE_TICKETS),
      isSponsoredByTokePass: Boolean(event.is_sponsored_by_tokepass),
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo armar el payload de publicación.",
    }
  }

  if (!gate.isSuperAdmin) {
    const freeCapacity = freePublishCapacity(payload)
    const maxFree = Number(event.max_free_tickets ?? DEFAULT_MAX_FREE_TICKETS)
    if (freeCapacity > maxFree) {
      return {
        success: false,
        error: `El cupo total de entradas gratuitas (${freeCapacity}) supera el máximo permitido (${maxFree}).`,
      }
    }
  }

  const rpc = await gate.supabase.rpc("publish_event_v2", {
    p_event_id: id,
    p_payload: payload as unknown as Json,
  })

  let slug = event.slug
  if (rpc.error && !isMissingPublishRpc(rpc.error)) {
    return { success: false, error: formatSupabaseError(rpc.error) }
  }

  if (rpc.error) {
    try {
      const written = await unpackPublishEventV2Sequential({
        eventId: id,
        organizerId: event.organizer_id,
        existingVenueId: event.venue_id,
        existingFlyerUrl: event.flyer_url,
        existingImageUrl: event.image_url,
        existingShareUrl: event.social_share_image_url,
        payload,
      })
      slug = written.slug
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : formatSupabaseError(error),
      }
    }
  }

  revalidatePath("/admin/events")
  revalidatePath(`/admin/events/${id}`)
  revalidatePath(`/admin/events/${id}/edit`)
  revalidatePublicEventCache({ eventId: id, slug })

  return { success: true, eventId: id }
}
