"use server"

import { revalidatePath } from "next/cache"

import { formatSupabaseError } from "@/lib/errors/supabase-error"
import { isPlatformOwnerRole } from "@/lib/auth/platform-owner"
import { hardReplacePublishedEventArtists } from "@/lib/events/hard-replace-event-artists-v2"
import { hardReplacePublishedSeatingMaps } from "@/lib/events/hard-replace-seating-maps-v2"
import { eventArtistRowsToDraftLineup } from "@/lib/events/publish-event-v2-lineup"
import {
  isEventDraftStateEmpty,
  overlayLiveExperienceOnDraft,
  rehydrateEventDraftV2,
  type LiveEventTicketSnapshotV2,
} from "@/lib/events/rehydrate-event-draft-v2"
import {
  buildPublishEventV2Payload,
  formatEventPublishIssues,
  freePublishCapacity,
  isPublishScheduleForeignKeyError,
  publishedExperienceColumns,
  type PublishEventV2Issue,
  type PublishEventV2Payload,
  type PublishEventV2TierPayload,
} from "@/lib/events/publish-event-v2"
import { eventPreviewPath } from "@/lib/events/editor-v2-ux"
import { revalidatePublicEventCache } from "@/lib/events/revalidate-public-event"
import { getSeoOrigin, publicEventPath, publicEventUrl } from "@/lib/seo/site"
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
  parseDraftLineup,
  parseEventDraftV2,
  toEventDraftV2Payload,
  type EventDraftV2LineupItem,
} from "@/lib/validations/event-draft-v2"
import { MAX_EVENT_FLYER_BYTES } from "@/lib/validations/event-form"
import type { EventDeliveryMode, EventStatus, Json, TicketTier } from "@/types/database"

export type SaveEventDraftV2Result =
  | { success: true; eventId: string; draftState: Json }
  | { success: false; error: string }

export type GetEventDraftV2Result =
  | {
      success: true
      eventId: string
      draftState: Json | null
      isPublished: boolean
    }
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
      "id, organizer_id, status, draft_state, title, date, ends_at, location, description, flyer_url, image_url, social_share_image_url, visibility, refund_policy, province, department, delivery_mode, venue_map, venue_id, schedule_days, promo_video_url, gallery_urls, restrictions, what_to_bring, lineup",
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
      isPublished: true,
    }
  }

  const current = parseEventDraftV2(data.draft_state)
  const liveLineup = await loadDraftLineupFromLiveEvent(gate.supabase, data.id, data.lineup)
  const overlay = overlayLiveExperienceOnDraft(
    current,
    {
      promoVideoUrl: data.promo_video_url,
      galleryUrls: data.gallery_urls,
      restrictions: data.restrictions,
      whatToBring: data.what_to_bring,
      lineup: liveLineup,
    },
    data.draft_state,
  )
  const restorePublishedLineup =
    data.status === "published" &&
    overlay.draft.lineup.length === 0 &&
    liveLineup.length > 0
  const nextDraft = restorePublishedLineup
    ? parseEventDraftV2({ ...overlay.draft, lineup: liveLineup })
    : overlay.draft
  if (overlay.changed || restorePublishedLineup) {
    const draftState = toEventDraftV2Payload(nextDraft) as Json
    const written = await gate.supabase
      .from("events")
      .update({
        draft_state: draftState,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("id, draft_state")
      .maybeSingle()
    return {
      success: true,
      eventId: data.id,
      draftState: (written.data?.draft_state ?? draftState) as Json,
      isPublished: data.status === "published",
    }
  }

  return {
    success: true,
    eventId: data.id,
    draftState: (data.draft_state ?? null) as Json | null,
    isPublished: data.status === "published",
  }
}

async function loadDraftLineupFromLiveEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  fallbackLineup: unknown,
): Promise<EventDraftV2LineupItem[]> {
  const query = await supabase
    .from("event_artists")
    .select("artist_id, stage, sort_order, artists(id, name, image_url, spotify_id)")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })
  if (!query.error) {
    const mapped = eventArtistRowsToDraftLineup(query.data ?? [])
    if (mapped.length > 0) return mapped
  }
  return parseDraftLineup(fallbackLineup)
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
    schedule_days?: unknown
    promo_video_url?: string | null
    gallery_urls?: unknown
    restrictions?: string | null
    what_to_bring?: string | null
    lineup?: unknown
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
  const ticketSelectWithType =
    "id, name, description, price, capacity, min_purchase_limit, max_purchase_limit, tier_type, category, layout_type, seating_sector_id, day_id, ticket_type"
  const ticketSelectCore =
    "id, name, description, price, capacity, min_purchase_limit, max_purchase_limit, tier_type, category, layout_type, seating_sector_id, day_id"
  let ticketsQuery: {
    data: LiveEventTicketSnapshotV2[] | null
    error: { message: string } | null
  } = await input.supabase
    .from("ticket_tiers")
    .select(ticketSelectWithType)
    .eq("event_id", input.event.id)
    .order("created_at", { ascending: true })
  if (
    ticketsQuery.error &&
    /ticket_type|schema cache|PGRST204|42703/i.test(ticketsQuery.error.message)
  ) {
    ticketsQuery = await input.supabase
      .from("ticket_tiers")
      .select(ticketSelectCore)
      .eq("event_id", input.event.id)
      .order("created_at", { ascending: true })
  }
  const schedulesQuery = await input.supabase
    .from("event_schedules")
    .select("id, title, start_time, end_time")
    .eq("event_id", input.event.id)
    .order("start_time", { ascending: true })

  const liveLineup = await loadDraftLineupFromLiveEvent(
    input.supabase,
    input.event.id,
    input.event.lineup,
  )
  const draftState = toEventDraftV2Payload(
    rehydrateEventDraftV2({
      event: input.event,
      venue: venueQuery.error ? null : (venueQuery.data ?? null),
      tickets: ticketsQuery.error ? [] : (ticketsQuery.data ?? []),
      schedules: schedulesQuery.error ? [] : (schedulesQuery.data ?? []),
      lineup: liveLineup,
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
 * Does not write ticket_tiers, venues, events.flyer_url, or events.gallery_urls.
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
  const kind =
    kindRaw === "banner" ? "banner" : kindRaw === "gallery" ? "gallery" : "flyer"
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

export type PublishEventV2Mode = "draft" | "published"

export type PublishEventV2Result =
  | {
      success: true
      eventId: string
      slug: string | null
      status: PublishEventV2Mode
      publicPath: string
      publicUrl: string
      previewPath: string
      previewUrl: string
    }
  | { success: false; error: string; issues?: PublishEventV2Issue[] }

function isMissingPublishRpc(error: { code?: string; message?: string } | null) {
  if (!error) return false
  const code = String(error.code ?? "")
  return code === "PGRST202" || code === "42883"
}

function isPublishEnumMismatch(error: {
  code?: string
  message?: string
  details?: string
  hint?: string
} | null) {
  if (!error) return false
  const code = String(error.code ?? "")
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase()
  return (
    code === "42804" &&
    (text.includes("category") ||
      text.includes("refund_policy") ||
      text.includes("delivery_mode") ||
      text.includes("event_status") ||
      text.includes("column \"status\""))
  )
}

function shouldFallbackPublishRpc(error: {
  code?: string
  message?: string
  details?: string
  hint?: string
} | null) {
  if (!error) return false
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`
  return (
    isMissingPublishRpc(error) ||
    isPublishEnumMismatch(error) ||
    isPublishScheduleForeignKeyError(error) ||
    /ticket_type|schema cache|PGRST204|42703/i.test(text)
  )
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
    tier_type: ticket.tier_type as TicketTier["tier_type"],
    layout_type: ticket.layout_type as TicketTier["layout_type"],
    seating_sector_id: ticket.seating_sector_id,
    day_id: null,
    visibility: "public" as const,
    capacity_per_unit: 1,
    admit_count: 1,
    bundle_items: [] as Json,
    ticket_type: ticket.ticket_type,
    updated_at: new Date().toISOString(),
  }
}

type PublishedTicketWriteRow = ReturnType<typeof relationalTierRow> & {
  sold?: number
}

async function writePublishedTicketRow(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    mode: "insert" | "update"
    eventId: string
    ticketId: string | null
    row: PublishedTicketWriteRow
    ticketName: string
  },
): Promise<{ id: string }> {
  const insertPayload = input.ticketId
    ? { id: input.ticketId, ...input.row }
    : input.row
  const first =
    input.mode === "update"
      ? await admin
          .from("ticket_tiers")
          .update(input.row)
          .eq("id", input.ticketId ?? "")
          .eq("event_id", input.eventId)
          .select("id")
          .maybeSingle()
      : await admin
          .from("ticket_tiers")
          .insert(insertPayload)
          .select("id")
          .maybeSingle()
  let written = first
  if (
    written.error &&
    /ticket_type|schema cache|PGRST204|42703/i.test(written.error.message)
  ) {
    const { ticket_type: _ticketType, ...withoutType } = input.row
    void _ticketType
    const fallbackInsert = input.ticketId
      ? { id: input.ticketId, ...withoutType }
      : withoutType
    written =
      input.mode === "update"
        ? await admin
            .from("ticket_tiers")
            .update(withoutType)
            .eq("id", input.ticketId ?? "")
            .eq("event_id", input.eventId)
            .select("id")
            .maybeSingle()
        : await admin
            .from("ticket_tiers")
            .insert(fallbackInsert)
            .select("id")
            .maybeSingle()
  }
  if (written.error) throw new Error(formatSupabaseError(written.error))
  if (!written.data?.id) {
    throw new Error(
      `ticket_tiers.${input.mode} no devolvió fila (${input.ticketName})`,
    )
  }
  return { id: written.data.id }
}

async function unlinkPublishedTicketDays(eventId: string) {
  const admin = createAdminClient()
  const written = await admin
    .from("ticket_tiers")
    .update({ day_id: null } as never)
    .eq("event_id", eventId)
  if (written.error) throw new Error(formatSupabaseError(written.error))
}

async function syncPublishedTickets(
  eventId: string,
  tickets: PublishEventV2TierPayload[],
): Promise<Array<{ id: string; day_id: string | null }>> {
  const admin = createAdminClient()
  const existing = await admin
    .from("ticket_tiers")
    .select("id, sold, tier_type, event_id")
    .eq("event_id", eventId)
  if (existing.error) throw new Error(formatSupabaseError(existing.error))

  const byId = new Map((existing.data ?? []).map((row) => [row.id, row]))
  const seen = new Set<string>()
  const binds: Array<{ id: string; day_id: string | null }> = []

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
      const written = await writePublishedTicketRow(admin, {
        mode: "update",
        eventId,
        ticketId: current.id,
        row,
        ticketName: ticket.name,
      })
      seen.add(written.id)
      binds.push({ id: written.id, day_id: ticket.day_id })
      continue
    }

    const inserted = await writePublishedTicketRow(admin, {
      mode: "insert",
      eventId,
      ticketId: ticket.id,
      row: { ...row, sold: 0 },
      ticketName: ticket.name,
    })
    seen.add(inserted.id)
    binds.push({ id: inserted.id, day_id: ticket.day_id })
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
  return binds
}

async function bindPublishedTicketDays(
  eventId: string,
  tickets: Array<{ id: string | null; day_id: string | null }>,
) {
  const admin = createAdminClient()
  for (const ticket of tickets) {
    if (!ticket.id) continue
    const written = await admin
      .from("ticket_tiers")
      .update({ day_id: ticket.day_id } as never)
      .eq("id", ticket.id)
      .eq("event_id", eventId)
    if (written.error) throw new Error(formatSupabaseError(written.error))
  }
}

async function unpackPublishedSchedule(
  eventId: string,
  payload: PublishEventV2Payload,
) {
  const admin = createAdminClient()
  const written = await admin
    .from("events")
    .update({
      date: payload.date,
      ends_at: payload.ends_at,
      schedule_days: payload.schedule_days as unknown as Json,
    } as never)
    .eq("id", eventId)
  if (written.error) throw new Error(formatSupabaseError(written.error))
}

async function unpackPublishedExperience(
  eventId: string,
  payload: PublishEventV2Payload,
) {
  const admin = createAdminClient()
  const written = await admin
    .from("events")
    .update(publishedExperienceColumns(payload) as never)
    .eq("id", eventId)
  if (!written.error) return
  if (
    /restrictions|what_to_bring|promo_video_url|gallery_urls|schema cache|PGRST204|42703/i.test(
      written.error.message,
    )
  ) {
    return
  }
  throw new Error(formatSupabaseError(written.error))
}

async function unpackPublishEventV2Sequential(input: {
  eventId: string
  organizerId: string
  existingVenueId: string | null
  existingFlyerUrl: string | null
  existingImageUrl: string | null
  existingShareUrl: string | null
  payload: PublishEventV2Payload
  lineup: EventDraftV2LineupItem[]
  targetStatus?: PublishEventV2Mode
  keepDraftState?: boolean
}) {
  const venueId = await upsertPublishedVenue({
    organizerId: input.organizerId,
    existingVenueId: input.existingVenueId,
    venue: input.payload.venue,
    venueMap: input.payload.venue_map,
  })
  // Children first: unlink ticket_tiers.day_id, sync tickets, write
  // event_schedules / schedule_days, then rebind days. Avoids 23503.
  await unlinkPublishedTicketDays(input.eventId)
  const ticketDays = await syncPublishedTickets(
    input.eventId,
    input.payload.tickets,
  )
  await unpackPublishedSchedule(input.eventId, input.payload)
  await bindPublishedTicketDays(input.eventId, ticketDays)
  await hardReplacePublishedSeatingMaps({
    eventId: input.eventId,
    maps: input.payload.seating_maps,
  })
  await hardReplacePublishedEventArtists({
    eventId: input.eventId,
    lineup: input.lineup,
  })

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
      delivery_mode: input.payload.delivery_mode as EventDeliveryMode,
      visibility:
        input.targetStatus === "draft" ? "private" : input.payload.visibility,
      flyer_url: input.payload.flyer_url ?? input.existingFlyerUrl,
      image_url:
        input.payload.image_url ??
        input.payload.flyer_url ??
        input.existingImageUrl,
      social_share_image_url:
        input.payload.social_share_image_url ?? input.existingShareUrl,
      venue_id: venueId,
      ...(input.payload.venue_map ? { venue_map: input.payload.venue_map } : {}),
      has_seating_plan: input.payload.has_seating_plan,
      status: (input.targetStatus ?? "published") as EventStatus,
      ...(input.keepDraftState ? {} : { draft_state: null }),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", input.eventId)
    .select("id, slug")
    .maybeSingle()
  if (written.error) throw new Error(formatSupabaseError(written.error))
  if (!written.data?.id) {
    throw new Error("events.update publish no devolvió fila")
  }
  await unpackPublishedExperience(input.eventId, input.payload)
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
  options: { status?: PublishEventV2Mode } = {},
): Promise<PublishEventV2Result> {
  const id = eventId.trim()
  if (!id) return { success: false, error: "Evento inválido." }
  const targetStatus: PublishEventV2Mode =
    options.status === "draft" ? "draft" : "published"

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

  const lineup = parsed.data.lineup ?? []
  let slug = event.slug
  if (targetStatus === "draft") {
    try {
      const written = await unpackPublishEventV2Sequential({
        eventId: id,
        organizerId: event.organizer_id,
        existingVenueId: event.venue_id,
        existingFlyerUrl: event.flyer_url,
        existingImageUrl: event.image_url,
        existingShareUrl: event.social_share_image_url,
        payload,
        lineup,
        targetStatus: "draft",
        keepDraftState: true,
      })
      slug = written.slug
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : formatSupabaseError(error),
      }
    }
  } else {
    const rpc = await gate.supabase.rpc("publish_event_v2", {
      p_event_id: id,
      p_payload: payload as unknown as Json,
    })

    if (rpc.error && !shouldFallbackPublishRpc(rpc.error)) {
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
          lineup,
        })
        slug = written.slug
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : formatSupabaseError(error),
        }
      }
    } else {
      try {
        await unlinkPublishedTicketDays(id)
        await unpackPublishedSchedule(id, payload)
        await bindPublishedTicketDays(id, payload.tickets)
        await hardReplacePublishedSeatingMaps({
          eventId: id,
          maps: payload.seating_maps,
        })
        await hardReplacePublishedEventArtists({ eventId: id, lineup })
        await unpackPublishedExperience(id, payload)
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : formatSupabaseError(error),
        }
      }
    }
  }

  const latest = await gate.supabase
    .from("events")
    .select("slug")
    .eq("id", id)
    .maybeSingle()
  if (!latest.error && latest.data?.slug) {
    slug = latest.data.slug
  }

  revalidatePath("/admin/events")
  revalidatePath(`/admin/events/${id}`)
  revalidatePath(`/admin/events/${id}/edit`)
  revalidatePath(eventPreviewPath(id))
  revalidatePublicEventCache({ eventId: id, slug })

  const previewPath = eventPreviewPath(id)
  return {
    success: true,
    eventId: id,
    slug: slug?.trim() || null,
    status: targetStatus,
    publicPath: publicEventPath({ id, slug }),
    publicUrl: publicEventUrl({ id, slug }),
    previewPath,
    previewUrl: `${getSeoOrigin()}${previewPath}`,
  }
}
