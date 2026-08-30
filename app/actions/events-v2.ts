"use server"

import { revalidatePath } from "next/cache"

import {
  collectValidSectorIdsFromVenueMaps,
  nullifyInvalidTicketSeatingSectors,
  seatingPersistUserMessage,
} from "@/lib/events/sanitize-ticket-tiers"
import { formatSupabaseError } from "@/lib/errors/supabase-error"
import { toUserFacingError } from "@/lib/errors/user-facing-error"
import { isPlatformOwnerRole } from "@/lib/auth/platform-owner"
import { assertDraftMapLayoutImmutable } from "@/lib/events/assert-draft-map-immutability"
import { sanitizeEventDraftForPersist } from "@/lib/events/draft-seating-map-v2"
import { hardReplacePublishedEventArtists } from "@/lib/events/hard-replace-event-artists-v2"
import { hardReplacePublishedSeatingMaps } from "@/lib/events/hard-replace-seating-maps-v2"
import { eventArtistRowsToDraftLineup } from "@/lib/events/publish-event-v2-lineup"
import {
  isEventDraftStateEmpty,
  overlayLiveExperienceOnDraft,
  overlayLivePurchaseCopyOnDraft,
  rehydrateEventDraftV2,
  type LiveEventTicketSnapshotV2,
} from "@/lib/events/rehydrate-event-draft-v2"
import { preparePublishDraftV2 } from "@/lib/events/prepare-publish-draft-v2"
import {
  nextMirroredAccessLink,
  nextMirroredCatalogVisibility,
  preservePublishedEventVisibility,
} from "@/lib/events/published-purchase-mirror"
import {
  formatEventPublishIssues,
  freePublishCapacity,
  isPublishScheduleForeignKeyError,
  publishedExperienceColumns,
  publishedScheduleUpsertRows,
  resolvePublishedSaleWindowTierId,
  sanitizePublishPayloadForDatabase,
  shouldPublishEventV2Sequentially,
  type PublishEventV2Issue,
  type PublishEventV2Payload,
  type PublishEventV2TierPayload,
} from "@/lib/events/publish-event-v2"
import {
  rematchEventDraftTicketIds,
  type LiveTicketIdSnapshot,
} from "@/lib/events/sync-draft-ticket-ids-v2"
import {
  syncPublishedComboItems,
  ticketsWithoutComboScheduleIds,
} from "@/lib/events/sync-published-combo-items"
import { isMissingSaleWindowSchema } from "@/lib/inventory/ticket-sale-window"
import { venueMapToSeatingLayout } from "@/lib/seating/venue-map-geometry"
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
  catalogVisibilityFromDraft,
  overlayDraftCatalogVisibility,
} from "@/lib/catalog/public-visibility"
import {
  eventAbsorbFeesFromRow,
  overlayDraftAbsorbFees,
} from "@/lib/events/event-absorb-fees"
import {
  DEFAULT_MAX_FREE_TICKETS,
  eventFeeConfigFromRow,
  type EventFeeConfig,
} from "@/lib/pricing/event-fees"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import {
  eventPublishSchema,
  parseDraftLineup,
  parseEventDraftV2,
  toEventDraftV2Payload,
  type EventDraftV2,
  type EventDraftV2LineupItem,
} from "@/lib/validations/event-draft-v2"
import {
  MAX_EVENT_FLYER_BYTES,
  parseEventRefundPolicy,
} from "@/lib/validations/event-form"
import type { EventDeliveryMode, EventStatus, Json, TicketTier } from "@/types/database"
import { parseVenueMap } from "@/types/venue-map"

export type SaveEventDraftV2Result =
  | { success: true; eventId: string; draftState: Json }
  | { success: false; error: string }

export type GetEventDraftV2Result =
  | {
      success: true
      eventId: string
      draftState: Json | null
      isPublished: boolean
      fee: EventFeeConfig
      absorbFees: boolean
    }
  | { success: false; error: string; code?: string }

export type UpdateEventAbsorbFeesResult =
  | { success: true; absorbFees: boolean }
  | { success: false; error: string }

export type UpdateEventCatalogVisibilityResult =
  | { success: true; isPublic: boolean }
  | { success: false; error: string }

function publishActionError(error: unknown): string {
  return toUserFacingError(
    error,
    "No se pudo publicar el evento. Revisá el mapa y las entradas e intentá de nuevo.",
  )
}

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

  const draftEventSelect =
    "id, organizer_id, status, draft_state, title, date, ends_at, location, description, flyer_url, image_url, social_share_image_url, visibility, refund_policy, province, department, delivery_mode, access_link, checkout_message, venue_map, venue_id, has_seating_plan, schedule_days, promo_video_url, gallery_urls, restrictions, what_to_bring, lineup, platform_fee_percentage, platform_fixed_fee, absorb_fees, max_free_tickets, is_sponsored_by_tokepass"
  const draftEventSelectCore =
    "id, organizer_id, status, draft_state, title, date, ends_at, location, description, flyer_url, image_url, social_share_image_url, visibility, refund_policy, province, department, delivery_mode, venue_map, venue_id, schedule_days, promo_video_url, gallery_urls, restrictions, what_to_bring, lineup, platform_fee_percentage, platform_fixed_fee, absorb_fees, max_free_tickets, is_sponsored_by_tokepass"
  const draftEventSelectLegacy =
    "id, organizer_id, status, draft_state, title, date, ends_at, location, description, flyer_url, image_url, social_share_image_url, visibility, refund_policy, province, department, delivery_mode, venue_map, venue_id, schedule_days, promo_video_url, gallery_urls, restrictions, what_to_bring, lineup, platform_fee_percentage, platform_fixed_fee, max_free_tickets, is_sponsored_by_tokepass"
  let eventQuery = await gate.supabase
    .from("events")
    .select(draftEventSelect)
    .eq("id", id)
    .maybeSingle()
  if (
    eventQuery.error &&
    /access_link|checkout_message|absorb_fees|has_seating_plan|schema cache|PGRST204|42703/i.test(
      eventQuery.error.message,
    )
  ) {
    eventQuery = await gate.supabase
      .from("events")
      .select(draftEventSelectCore)
      .eq("id", id)
      .maybeSingle()
  }
  if (
    eventQuery.error &&
    /absorb_fees|schema cache|PGRST204|42703/i.test(eventQuery.error.message)
  ) {
    eventQuery = await gate.supabase
      .from("events")
      .select(draftEventSelectLegacy)
      .eq("id", id)
      .maybeSingle()
  }
  const { data, error } = eventQuery
  if (error) return { success: false, error: formatSupabaseError(error) }
  if (!data) return { success: false, error: "Evento no encontrado.", code: "NOT_FOUND" }
  if (data.organizer_id !== gate.userId && !gate.isSuperAdmin) {
    return { success: false, error: "No tenés permiso para editar este evento." }
  }

  const absorbFees = eventAbsorbFeesFromRow(data)

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
      fee: eventFeeConfigFromRow(data),
      absorbFees,
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
  const restoredDraft = restorePublishedLineup
    ? parseEventDraftV2({ ...overlay.draft, lineup: liveLineup })
    : overlay.draft
  const purchaseOverlay = overlayLivePurchaseCopyOnDraft(
    restoredDraft,
    {
      refundPolicy: data.refund_policy,
      checkoutMessage: data.checkout_message,
      accessLink: data.access_link,
      visibility: data.visibility,
    },
    data.draft_state,
  )
  const absorbOverlay = overlayDraftAbsorbFees(purchaseOverlay.draft, absorbFees)
  const nextDraft = absorbOverlay.draft
  if (
    overlay.changed ||
    restorePublishedLineup ||
    purchaseOverlay.changed ||
    absorbOverlay.changed
  ) {
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
      fee: eventFeeConfigFromRow(data),
      absorbFees,
    }
  }

  return {
    success: true,
    eventId: data.id,
    draftState: (data.draft_state ?? null) as Json | null,
    isPublished: data.status === "published",
    fee: eventFeeConfigFromRow(data),
    absorbFees,
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

async function loadLiveTicketIdSnapshots(
  eventId: string,
): Promise<LiveTicketIdSnapshot[]> {
  const admin = createAdminClient()
  const withType = await admin
    .from("ticket_tiers")
    .select("id, name, seating_sector_id, day_id, ticket_type, tier_type")
    .eq("event_id", eventId)
  if (!withType.error) return withType.data ?? []
  if (!/ticket_type|schema cache|PGRST204|42703/i.test(withType.error.message)) {
    throw new Error(formatSupabaseError(withType.error))
  }
  const core = await admin
    .from("ticket_tiers")
    .select("id, name, seating_sector_id, day_id, tier_type")
    .eq("event_id", eventId)
  if (core.error) throw new Error(formatSupabaseError(core.error))
  return (core.data ?? []).map((row) => ({
    ...row,
    ticket_type: null,
  }))
}

async function rematerializeDraftTicketIds(eventId: string) {
  const admin = createAdminClient()
  const event = await admin
    .from("events")
    .select("draft_state")
    .eq("id", eventId)
    .maybeSingle()
  if (event.error) throw new Error(formatSupabaseError(event.error))
  if (!event.data?.draft_state) return
  const tickets = await loadLiveTicketIdSnapshots(eventId)
  const draft = parseEventDraftV2(event.data.draft_state)
  const next = rematchEventDraftTicketIds(draft, tickets)
  const same =
    next.tickets.every((ticket, index) => ticket.id === draft.tickets[index]?.id) &&
    next.extras.every((ticket, index) => ticket.id === draft.extras[index]?.id) &&
    next.tickets.length === draft.tickets.length &&
    next.extras.length === draft.extras.length
  if (same) return
  const written = await admin
    .from("events")
    .update({
      draft_state: toEventDraftV2Payload(next) as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
  if (written.error) throw new Error(formatSupabaseError(written.error))
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
    absorb_fees?: boolean | null
    access_link?: string | null
    checkout_message?: string | null
    has_seating_plan?: boolean | null
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
    "id, name, description, price, base_price, capacity, min_purchase_limit, max_purchase_limit, tier_type, category, layout_type, seating_sector_id, day_id, ticket_type, sale_starts_at, sale_ends_at"
  const ticketSelectCore =
    "id, name, description, price, base_price, capacity, min_purchase_limit, max_purchase_limit, tier_type, category, layout_type, seating_sector_id, day_id"
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
    /ticket_type|sale_starts_at|sale_ends_at|schema cache|PGRST204|42703/i.test(ticketsQuery.error.message)
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
  const seatingMapsQuery = await input.supabase
    .from("seating_maps")
    .select("event_date_id, map_config, pricing")
    .eq("event_id", input.event.id)

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
      seatingMaps: seatingMapsQuery.error
        ? []
        : (seatingMapsQuery.data ?? []).map((row) => ({
            dateId: row.event_date_id,
            event_date_id: row.event_date_id,
            mapConfig: row.map_config,
            map_config: row.map_config,
            pricing: row.pricing,
          })),
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
 * Writes events.draft_state. Published events also mirror refund,
 * checkout copy, the stream URL and catalog hide — never ticket_tiers.
 */
export async function saveEventDraftV2(
  eventId: string,
  rawData: unknown,
): Promise<SaveEventDraftV2Result> {
  const id = eventId.trim()
  if (!id) return { success: false, error: "Evento inválido." }

  const gate = await requireDraftWriter()
  if (!gate.ok) return { success: false, error: gate.error }

  type PersistLiveEvent = {
    id: string
    organizer_id: string
    status: string
    slug: string | null
    absorb_fees?: boolean | null
    refund_policy?: string | null
    checkout_message?: string | null
    access_link?: string | null
    visibility?: string | null
  }
  const persistEventSelects = [
    "id, organizer_id, status, slug, absorb_fees, refund_policy, checkout_message, access_link, visibility",
    "id, organizer_id, status, slug, refund_policy, checkout_message, access_link, visibility",
    "id, organizer_id, status, slug, absorb_fees, refund_policy, access_link, visibility",
    "id, organizer_id, status, slug, absorb_fees, refund_policy, checkout_message, visibility",
    "id, organizer_id, status, slug, refund_policy, access_link, visibility",
    "id, organizer_id, status, slug, refund_policy, visibility",
  ]
  let eventQuery = await gate.supabase
    .from("events")
    .select(persistEventSelects[0])
    .eq("id", id)
    .maybeSingle()
  for (const columns of persistEventSelects.slice(1)) {
    if (
      !eventQuery.error ||
      !/absorb_fees|checkout_message|access_link|schema cache|PGRST204|42703/i.test(
        eventQuery.error.message,
      )
    ) {
      break
    }
    eventQuery = await gate.supabase
      .from("events")
      .select(columns as never)
      .eq("id", id)
      .maybeSingle()
  }
  const eventError = eventQuery.error
  const event = (eventQuery.data ?? null) as PersistLiveEvent | null
  if (eventError) return { success: false, error: formatSupabaseError(eventError) }
  if (!event) return { success: false, error: "Evento no encontrado." }
  if (event.organizer_id !== gate.userId && !gate.isSuperAdmin) {
    return { success: false, error: "No tenés permiso para editar este evento." }
  }

  const parsed = overlayDraftAbsorbFees(
    sanitizeEventDraftForPersist(parseEventDraftV2(rawData)),
    eventAbsorbFeesFromRow(event),
  ).draft
  const locked = await assertDraftMapLayoutImmutable({
    eventId: id,
    draft: parsed,
  })
  if (!locked.ok) return { success: false, error: locked.error }

  const draftState = toEventDraftV2Payload(parsed) as unknown as Json
  const { data, error } = await gate.supabase
    .from("events")
    .update({
      draft_state: draftState,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organizer_id", event.organizer_id)
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

  if (event.status === "published") {
    await mirrorPublishedPurchaseCopy({
      supabase: gate.supabase,
      eventId: id,
      organizerId: event.organizer_id,
      slug: event.slug,
      draft: parsed,
      live: event,
    })
  }

  return {
    success: true,
    eventId: data.id,
    draftState: (data.draft_state ?? draftState) as Json,
  }
}

async function mirrorPublishedPurchaseCopy(input: {
  supabase: Awaited<ReturnType<typeof createClient>>
  eventId: string
  organizerId: string
  slug?: string | null
  draft: EventDraftV2
  live: {
    refund_policy?: string | null
    checkout_message?: string | null
    access_link?: string | null
    visibility?: string | null
  }
}) {
  const nextRefund = parseEventRefundPolicy(input.draft.settings.refundPolicy)
  const checkoutLoaded = Object.prototype.hasOwnProperty.call(
    input.live,
    "checkout_message",
  )
  const accessLoaded = Object.prototype.hasOwnProperty.call(
    input.live,
    "access_link",
  )
  const nextCheckout = checkoutLoaded
    ? input.draft.settings.checkoutMessage.trim() || null
    : undefined
  const nextAccess = accessLoaded
    ? nextMirroredAccessLink({
        draft: input.draft,
        liveAccessLink: input.live.access_link,
      })
    : undefined
  const nextVisibility = nextMirroredCatalogVisibility({
    liveVisibility: input.live.visibility,
    isPublic: input.draft.settings.isPublic !== false,
  })
  if (
    nextRefund === parseEventRefundPolicy(input.live.refund_policy) &&
    (nextCheckout === undefined ||
      nextCheckout === (input.live.checkout_message?.trim() || null)) &&
    (nextAccess === undefined ||
      nextAccess === (input.live.access_link?.trim() || null)) &&
    nextVisibility == null
  ) {
    return
  }
  const listing = nextVisibility ? { visibility: nextVisibility } : {}
  const checkoutPatch =
    nextCheckout === undefined ? {} : { checkout_message: nextCheckout }
  const accessPatch =
    nextAccess === undefined ? {} : { access_link: nextAccess }
  const patches: Array<Record<string, unknown>> = [
    {
      refund_policy: nextRefund,
      ...checkoutPatch,
      ...accessPatch,
      ...listing,
    },
    { refund_policy: nextRefund, ...accessPatch, ...listing },
    { refund_policy: nextRefund, ...checkoutPatch, ...listing },
    { ...accessPatch, ...checkoutPatch, ...listing },
    { refund_policy: nextRefund, ...listing },
    ...(!checkoutLoaded ? [] : [{ checkout_message: nextCheckout, ...listing }]),
    ...(!accessLoaded ? [] : [{ access_link: nextAccess, ...listing }]),
    ...(!nextVisibility
      ? []
      : [{ visibility: nextVisibility }]),
  ]
  const ignorable =
    /schema cache|PGRST204|42703|access_link|refund_policy|checkout_message|visibility/i
  for (const patch of patches) {
    const written = await input.supabase
      .from("events")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", input.eventId)
      .eq("organizer_id", input.organizerId)
    if (!written.error) {
      revalidatePath("/admin/events")
      revalidatePath(`/admin/events/${input.eventId}`)
      revalidatePublicEventCache({
        eventId: input.eventId,
        slug: input.slug,
      })
      return
    }
    if (!ignorable.test(written.error.message)) return
  }
}

/**
 * Fuente de verdad del switch "Absorber cargos".
 * UPDATE inmediato de events.absorb_fees + espejo en draft_state.
 */
export async function updateEventAbsorbFees(
  eventId: string,
  absorbFees: boolean,
): Promise<UpdateEventAbsorbFeesResult> {
  const id = eventId.trim()
  if (!id) return { success: false, error: "Evento inválido." }

  const gate = await requireDraftWriter()
  if (!gate.ok) return { success: false, error: gate.error }

  const { data: event, error: eventError } = await gate.supabase
    .from("events")
    .select("id, organizer_id, draft_state, slug")
    .eq("id", id)
    .maybeSingle()
  if (eventError) return { success: false, error: formatSupabaseError(eventError) }
  if (!event) return { success: false, error: "Evento no encontrado." }
  if (event.organizer_id !== gate.userId && !gate.isSuperAdmin) {
    return { success: false, error: "No tenés permiso para editar este evento." }
  }

  const next = absorbFees === true
  const { data, error } = await gate.supabase
    .from("events")
    .update({
      absorb_fees: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organizer_id", event.organizer_id)
    .select("id, absorb_fees, draft_state")
    .maybeSingle()

  if (error) return { success: false, error: formatSupabaseError(error) }
  if (!data?.id) {
    return {
      success: false,
      error: formatSupabaseError({
        code: "NO_ROWS",
        message: "events.update absorb_fees no devolvió fila",
        details: id,
      }),
    }
  }

  const mirrored = overlayDraftAbsorbFees(
    parseEventDraftV2(data.draft_state),
    eventAbsorbFeesFromRow(data),
  )
  if (mirrored.changed) {
    await gate.supabase
      .from("events")
      .update({
        draft_state: toEventDraftV2Payload(mirrored.draft) as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("organizer_id", event.organizer_id)
  }

  revalidatePath("/admin/events")
  revalidatePath(`/admin/events/${id}`)
  revalidatePath(`/admin/events/${id}/edit`)
  revalidatePublicEventCache({ eventId: id, slug: event.slug })

  return { success: true, absorbFees: eventAbsorbFeesFromRow(data) }
}

/**
 * Fuente de verdad del catálogo público: settings.isPublic → events.visibility.
 * UPDATE inmediato + espejo en draft_state. No toca guest_list_only.
 */
export async function updateEventCatalogVisibility(
  eventId: string,
  isPublic: boolean,
): Promise<UpdateEventCatalogVisibilityResult> {
  const id = eventId.trim()
  if (!id) return { success: false, error: "Evento inválido." }

  const gate = await requireDraftWriter()
  if (!gate.ok) return { success: false, error: gate.error }

  const { data: event, error: eventError } = await gate.supabase
    .from("events")
    .select("id, organizer_id, draft_state, slug, visibility")
    .eq("id", id)
    .maybeSingle()
  if (eventError) return { success: false, error: formatSupabaseError(eventError) }
  if (!event) return { success: false, error: "Evento no encontrado." }
  if (event.organizer_id !== gate.userId && !gate.isSuperAdmin) {
    return { success: false, error: "No tenés permiso para editar este evento." }
  }

  const nextPublic = isPublic !== false
  if (event.visibility === "guest_list_only") {
    return { success: true, isPublic: false }
  }

  const nextVisibility = catalogVisibilityFromDraft(nextPublic)
  const { data, error } = await gate.supabase
    .from("events")
    .update({
      visibility: nextVisibility,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organizer_id", event.organizer_id)
    .select("id, visibility, draft_state")
    .maybeSingle()

  if (error) return { success: false, error: formatSupabaseError(error) }
  if (!data?.id) {
    return {
      success: false,
      error: formatSupabaseError({
        code: "NO_ROWS",
        message: "events.update visibility no devolvió fila",
        details: id,
      }),
    }
  }

  const mirrored = overlayDraftCatalogVisibility(
    parseEventDraftV2(data.draft_state),
    nextPublic,
  )
  if (mirrored.changed) {
    await gate.supabase
      .from("events")
      .update({
        draft_state: toEventDraftV2Payload(mirrored.draft) as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("organizer_id", event.organizer_id)
  }

  revalidatePath("/admin/events")
  revalidatePath(`/admin/events/${id}`)
  revalidatePath(`/admin/events/${id}/edit`)
  revalidatePublicEventCache({ eventId: id, slug: event.slug })

  return { success: true, isPublic: nextPublic }
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
    /ticket_type|checkout_message|absorb_fees|access_link|schema cache|PGRST204|42703/i.test(
      text,
    )
  )
}

function seatingLayoutJsonFromVenueMap(venueMap: Json | undefined): Json | undefined {
  if (!venueMap) return undefined
  const map = parseVenueMap(venueMap)
  if (
    map.sectors.length === 0 &&
    (map.zones?.length ?? 0) === 0 &&
    (map.elements?.length ?? 0) === 0
  ) {
    return undefined
  }
  return venueMapToSeatingLayout(map) as unknown as Json
}

async function upsertPublishedVenue(input: {
  organizerId: string
  existingVenueId: string | null
  venue: PublishEventV2Payload["venue"]
  venueMap?: Json
  persistVenueLayout?: boolean
}): Promise<string> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const seatingLayout =
    input.persistVenueLayout === false
      ? undefined
      : seatingLayoutJsonFromVenueMap(input.venueMap)
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
    ...(seatingLayout ? { seating_layout: seatingLayout } : {}),
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
    seating_sector_id: ticket.seating_sector_id?.trim() || null,
    day_id: ticket.day_id,
    category: ticket.category as TicketTier["category"],
    sale_starts_at: ticket.sale_starts_at ?? null,
    sale_ends_at: ticket.sale_ends_at ?? null,
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
  const missingCommerce =
    /ticket_type|sale_starts_at|sale_ends_at|schema cache|PGRST204|42703/i
  const { sale_starts_at, sale_ends_at, ticket_type, ...withoutCommerce } =
    input.row
  const withoutSaleWindows = {
    ...withoutCommerce,
    ticket_type,
  }
  const withoutTicketType = {
    ...withoutCommerce,
    sale_starts_at,
    sale_ends_at,
  }
  const fallbacks = [withoutSaleWindows, withoutTicketType, withoutCommerce]
  let written = first
  for (const row of fallbacks) {
    if (!written.error || !missingCommerce.test(written.error.message)) break
    const payload = input.ticketId ? { id: input.ticketId, ...row } : row
    written =
      input.mode === "update"
        ? await admin
            .from("ticket_tiers")
            .update(row)
            .eq("id", input.ticketId ?? "")
            .eq("event_id", input.eventId)
            .select("id")
            .maybeSingle()
        : await admin.from("ticket_tiers").insert(payload).select("id").maybeSingle()
  }
  if (written.error) throw new Error(formatSupabaseError(written.error))
  if (!written.data?.id) {
    throw new Error(
      `ticket_tiers.${input.mode} no devolvió fila (${input.ticketName})`,
    )
  }
  return { id: written.data.id }
}

async function ensurePublishedScheduleRows(
  eventId: string,
  payload: PublishEventV2Payload,
) {
  const rows = publishedScheduleUpsertRows(eventId, payload.schedule_days)
  if (rows.length === 0) return
  const admin = createAdminClient()
  const existing = await admin
    .from("event_schedules")
    .select("id, event_id")
    .in(
      "id",
      rows.map((row) => row.id),
    )
  if (existing.error) throw new Error(formatSupabaseError(existing.error))
  if ((existing.data ?? []).some((row) => row.event_id !== eventId)) {
    throw new Error(
      "Hay una jornada con un identificador que no pertenece a este evento. Recargá e intentá de nuevo.",
    )
  }
  const written = await admin.from("event_schedules").upsert(rows, {
    onConflict: "id",
  })
  if (written.error) throw new Error(formatSupabaseError(written.error))
}

async function syncPublishedTickets(
  eventId: string,
  tickets: PublishEventV2TierPayload[],
  maps?: {
    venueMap?: Json
    seatingMaps?: PublishEventV2Payload["seating_maps"]
  },
): Promise<Array<{ id: string; day_id: string | null }>> {
  const ticketsToPersist = maps
    ? nullifyInvalidTicketSeatingSectors(
        tickets,
        collectValidSectorIdsFromVenueMaps({
          venueMap: maps.venueMap,
          seatingMaps: maps.seatingMaps,
        }),
      )
    : tickets
  const admin = createAdminClient()
  const existing = await admin
    .from("ticket_tiers")
    .select("id, sold, tier_type, event_id")
    .eq("event_id", eventId)
  if (existing.error) throw new Error(formatSupabaseError(existing.error))

  const byId = new Map((existing.data ?? []).map((row) => [row.id, row]))
  const seen = new Set<string>()
  const binds: Array<{ id: string; day_id: string | null }> = []

  for (const ticket of ticketsToPersist) {
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

async function ensurePublishedCatalogListing(
  eventId: string,
  organizerId: string,
  payload: PublishEventV2Payload,
) {
  const admin = createAdminClient()
  const written = await admin
    .from("events")
    .update({
      status: "published" as EventStatus,
      visibility: payload.visibility,
      date: payload.date,
      ends_at: payload.ends_at,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", eventId)
    .eq("organizer_id", organizerId)
  if (written.error) throw new Error(formatSupabaseError(written.error))
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

async function patchPublishedEventPurchaseFields(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  payload: PublishEventV2Payload,
) {
  const mapOff = payload.has_seating_plan
    ? {}
    : { venue_map: null }
  const patches: Array<Record<string, unknown>> = [
    {
      access_link: payload.access_link,
      refund_policy: payload.refund_policy,
      checkout_message: payload.checkout_message,
      absorb_fees: payload.absorb_fees,
      ...mapOff,
    },
    {
      access_link: payload.access_link,
      refund_policy: payload.refund_policy,
      absorb_fees: payload.absorb_fees,
      ...mapOff,
    },
    {
      access_link: payload.access_link,
      absorb_fees: payload.absorb_fees,
      ...mapOff,
    },
    { absorb_fees: payload.absorb_fees, ...mapOff },
    {
      access_link: payload.access_link,
      refund_policy: payload.refund_policy,
      ...mapOff,
    },
    { access_link: payload.access_link, ...mapOff },
    { refund_policy: payload.refund_policy, ...mapOff },
    ...(!payload.has_seating_plan ? [{ venue_map: null }] : []),
  ]
  const ignorable =
    /schema cache|PGRST204|42703|access_link|refund_policy|checkout_message|absorb_fees|venue_map/i
  let lastError: { message: string } | null = null
  for (const patch of patches) {
    const written = await admin
      .from("events")
      .update(patch as never)
      .eq("id", eventId)
    if (!written.error) return
    lastError = written.error
    if (!ignorable.test(written.error.message)) {
      throw new Error(formatSupabaseError(written.error))
    }
  }
  if (lastError && !ignorable.test(lastError.message)) {
    throw new Error(formatSupabaseError(lastError))
  }
}

async function resolveSaleWindowTierId(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  ticket: PublishEventV2TierPayload,
): Promise<string | null> {
  const known = resolvePublishedSaleWindowTierId(ticket, [])
  if (known) return known

  const withType = await applyPublishedTierDayFilter(
    admin
      .from("ticket_tiers")
      .select("id")
      .eq("event_id", eventId)
      .eq("name", ticket.name)
      .eq("ticket_type", ticket.ticket_type),
    ticket.day_id,
  )
  if (!withType.error) {
    const matched = resolvePublishedSaleWindowTierId(ticket, withType.data ?? [])
    if (matched) return matched
  } else if (
    !/ticket_type|schema cache|PGRST204|42703/i.test(withType.error.message)
  ) {
    throw new Error(formatSupabaseError(withType.error))
  }

  const core = await applyPublishedTierDayFilter(
    admin
      .from("ticket_tiers")
      .select("id")
      .eq("event_id", eventId)
      .eq("name", ticket.name),
    ticket.day_id,
  )
  if (core.error) throw new Error(formatSupabaseError(core.error))
  const byDay = resolvePublishedSaleWindowTierId(ticket, core.data ?? [])
  if (byDay) return byDay

  const byName = await admin
    .from("ticket_tiers")
    .select("id")
    .eq("event_id", eventId)
    .eq("name", ticket.name)
  if (byName.error) throw new Error(formatSupabaseError(byName.error))
  return resolvePublishedSaleWindowTierId(ticket, byName.data ?? [])
}

function applyPublishedTierDayFilter<
  T extends { eq: (column: string, value: string) => T; is: (column: string, value: null) => T },
>(query: T, dayId: string | null): T {
  return dayId ? query.eq("day_id", dayId) : query.is("day_id", null)
}

async function applyPublishedPurchaseFields(
  eventId: string,
  payload: PublishEventV2Payload,
) {
  const admin = createAdminClient()
  await patchPublishedEventPurchaseFields(admin, eventId, payload)

  for (const ticket of payload.tickets) {
    const tierId = await resolveSaleWindowTierId(admin, eventId, ticket)
    if (!tierId) {
      throw new Error(
        `No se pudo actualizar la tarifa "${ticket.name}" después de publicar.`,
      )
    }
    const tierPatches: Array<Record<string, unknown>> = [
      {
        sale_starts_at: ticket.sale_starts_at ?? null,
        sale_ends_at: ticket.sale_ends_at ?? null,
        ticket_type: ticket.ticket_type,
        category: ticket.category,
      },
      {
        ticket_type: ticket.ticket_type,
        category: ticket.category,
      },
      {
        sale_starts_at: ticket.sale_starts_at ?? null,
        sale_ends_at: ticket.sale_ends_at ?? null,
      },
    ]
    let lastError: { message: string } | null = null
    let patched = false
    for (const patch of tierPatches) {
      const written = await admin
        .from("ticket_tiers")
        .update(patch as never)
        .eq("event_id", eventId)
        .eq("id", tierId)
      if (!written.error) {
        patched = true
        break
      }
      lastError = written.error
      if (
        !isMissingSaleWindowSchema(written.error.message) &&
        !/ticket_type|category|schema cache|PGRST204|42703/i.test(
          written.error.message,
        )
      ) {
        throw new Error(formatSupabaseError(written.error))
      }
    }
    if (patched) continue
    if (lastError && isMissingSaleWindowSchema(lastError.message)) continue
    if (lastError) throw new Error(formatSupabaseError(lastError))
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
  lineup: EventDraftV2LineupItem[]
  targetStatus?: PublishEventV2Mode
  keepDraftState?: boolean
}) {
  const payload = sanitizePublishPayloadForDatabase(input.payload)
  const venueId = await upsertPublishedVenue({
    organizerId: input.organizerId,
    existingVenueId: input.existingVenueId,
    venue: payload.venue,
    venueMap: payload.venue_map,
    persistVenueLayout: payload.schedule_days.length < 2,
  })
  // Create jornadas first, write tickets already bound to those days,
  // then mirror schedule_days so leftover days can drop without a null
  // day_id window (two map tickets on the same sector would collide).
  await ensurePublishedScheduleRows(input.eventId, payload)
  const ticketDays = await syncPublishedTickets(input.eventId, payload.tickets, {
    venueMap: payload.venue_map,
    seatingMaps: payload.seating_maps,
  })
  await bindPublishedTicketDays(input.eventId, ticketDays)
  await unpackPublishedSchedule(input.eventId, payload)
  await hardReplacePublishedSeatingMaps({
    eventId: input.eventId,
    maps: payload.seating_maps,
  })
  await hardReplacePublishedEventArtists({
    eventId: input.eventId,
    lineup: input.lineup,
  })

  const admin = createAdminClient()
  if (payload.has_seating_plan) {
    const materialized = await admin.rpc("materialize_event_seating_units", {
      p_event_id: input.eventId,
    })
    if (materialized.error) {
      throw new Error(
        seatingPersistUserMessage(materialized.error) ??
          formatSupabaseError(materialized.error),
      )
    }
  }
  const eventPatch = {
    title: payload.title,
    description: payload.description,
    date: payload.date,
    ends_at: payload.ends_at,
    location: payload.location,
    province: payload.venue.province,
    department: payload.venue.city,
    delivery_mode: payload.delivery_mode as EventDeliveryMode,
    refund_policy: payload.refund_policy,
    absorb_fees: payload.absorb_fees,
    checkout_message: payload.checkout_message,
    visibility:
      input.targetStatus === "draft" ? "private" : payload.visibility,
    flyer_url: payload.flyer_url ?? input.existingFlyerUrl,
    image_url:
      payload.image_url ??
      payload.flyer_url ??
      input.existingImageUrl,
    social_share_image_url:
      payload.social_share_image_url ?? input.existingShareUrl,
    venue_id: venueId,
    venue_map: payload.venue_map ?? null,
    has_seating_plan: payload.has_seating_plan,
    status: (input.targetStatus ?? "published") as EventStatus,
    ...(input.keepDraftState ? {} : { draft_state: null }),
    updated_at: new Date().toISOString(),
  }
  let written = await admin
    .from("events")
    .update(eventPatch as never)
    .eq("id", input.eventId)
    .eq("organizer_id", input.organizerId)
    .select("id, slug")
    .maybeSingle()
  if (
    written.error &&
    /checkout_message|schema cache|PGRST204|42703/i.test(written.error.message)
  ) {
    const { checkout_message, ...withoutCheckout } = eventPatch
    void checkout_message
    written = await admin
      .from("events")
      .update(withoutCheckout as never)
      .eq("id", input.eventId)
      .eq("organizer_id", input.organizerId)
      .select("id, slug")
      .maybeSingle()
  }
  if (
    written.error &&
    /absorb_fees|schema cache|PGRST204|42703/i.test(written.error.message)
  ) {
    const { absorb_fees, checkout_message, ...corePatch } = eventPatch
    void absorb_fees
    void checkout_message
    written = await admin
      .from("events")
      .update(corePatch as never)
      .eq("id", input.eventId)
      .eq("organizer_id", input.organizerId)
      .select("id, slug")
      .maybeSingle()
  }
  if (
    written.error &&
    (isPublishEnumMismatch(written.error) ||
      /refund_policy|schema cache|PGRST204|42703/i.test(written.error.message))
  ) {
    const { refund_policy, absorb_fees, checkout_message, ...corePatch } =
      eventPatch
    void refund_policy
    void absorb_fees
    void checkout_message
    written = await admin
      .from("events")
      .update(corePatch as never)
      .eq("id", input.eventId)
      .eq("organizer_id", input.organizerId)
      .select("id, slug")
      .maybeSingle()
  }
  if (written.error) throw new Error(formatSupabaseError(written.error))
  if (!written.data?.id) {
    throw new Error("events.update publish no devolvió fila")
  }
  await unpackPublishedExperience(input.eventId, payload)
  await applyPublishedPurchaseFields(input.eventId, payload)
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

  let eventQuery = await gate.supabase
    .from("events")
    .select(
      "id, organizer_id, venue_id, draft_state, slug, flyer_url, image_url, social_share_image_url, platform_fee_percentage, platform_fixed_fee, absorb_fees, max_free_tickets, is_sponsored_by_tokepass, visibility",
    )
    .eq("id", id)
    .maybeSingle()
  if (
    eventQuery.error &&
    /absorb_fees|schema cache|PGRST204|42703/i.test(eventQuery.error.message)
  ) {
    eventQuery = await gate.supabase
      .from("events")
      .select(
        "id, organizer_id, venue_id, draft_state, slug, flyer_url, image_url, social_share_image_url, platform_fee_percentage, platform_fixed_fee, max_free_tickets, is_sponsored_by_tokepass, visibility",
      )
      .eq("id", id)
      .maybeSingle()
  }
  const { data: event, error: eventError } = eventQuery
  if (eventError) return { success: false, error: formatSupabaseError(eventError) }
  if (!event) return { success: false, error: "Evento no encontrado." }
  if (event.organizer_id !== gate.userId && !gate.isSuperAdmin) {
    return { success: false, error: "No tenés permiso para publicar este evento." }
  }

  try {
    await rematerializeDraftTicketIds(id)
  } catch (error) {
    return {
      success: false,
      error: publishActionError(error),
    }
  }
  const latestDraft = await gate.supabase
    .from("events")
    .select("draft_state")
    .eq("id", id)
    .maybeSingle()
  if (latestDraft.error) {
    return { success: false, error: formatSupabaseError(latestDraft.error) }
  }
  const draftState = latestDraft.data?.draft_state ?? event.draft_state
  const draft = overlayDraftAbsorbFees(
    sanitizeEventDraftForPersist(parseEventDraftV2(draftState)),
    eventAbsorbFeesFromRow(event),
  ).draft

  const parsed = eventPublishSchema.safeParse(draft)
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
    const liveTickets = await loadLiveTicketIdSnapshots(id)
    payload = preparePublishDraftV2({
      draft,
      liveTickets,
      fee: {
        ...eventFeeConfigFromRow(event),
      },
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo armar el payload de publicación.",
    }
  }

  payload = sanitizePublishPayloadForDatabase({
    ...payload,
    visibility: preservePublishedEventVisibility(
      (event as { visibility?: string | null }).visibility,
      payload.visibility === "private" ? "private" : "public",
    ),
  })

  const locked = await assertDraftMapLayoutImmutable({
    eventId: id,
    draft,
  })
  if (!locked.ok) return { success: false, error: locked.error }

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
  const persistPayload: PublishEventV2Payload = {
    ...payload,
    tickets: ticketsWithoutComboScheduleIds(payload.tickets),
  }
  let slug = event.slug
  let postRpcError: unknown = null
  if (targetStatus === "draft") {
    try {
      const written = await unpackPublishEventV2Sequential({
        eventId: id,
        organizerId: event.organizer_id,
        existingVenueId: event.venue_id,
        existingFlyerUrl: event.flyer_url,
        existingImageUrl: event.image_url,
        existingShareUrl: event.social_share_image_url,
        payload: persistPayload,
        lineup,
        targetStatus: "draft",
        keepDraftState: true,
      })
      slug = written.slug
      await rematerializeDraftTicketIds(id)
    } catch (error) {
      return {
        success: false,
        error: publishActionError(error),
      }
    }
  } else {
    if (payload.venue_map) {
      try {
        const venueId = await upsertPublishedVenue({
          organizerId: event.organizer_id,
          existingVenueId: event.venue_id,
          venue: payload.venue,
          venueMap: payload.venue_map,
          persistVenueLayout: payload.schedule_days.length < 2,
        })
        if (venueId !== event.venue_id) {
          const linked = await createAdminClient()
            .from("events")
            .update({
              venue_id: venueId,
              updated_at: new Date().toISOString(),
            } as never)
            .eq("id", id)
          if (linked.error) {
            throw new Error(formatSupabaseError(linked.error))
          }
        }
      } catch (error) {
        return { success: false, error: publishActionError(error) }
      }
    }
    const publishSequentially = shouldPublishEventV2Sequentially(persistPayload)
    let usedRpc = false
    if (!publishSequentially) {
      const rpc = await gate.supabase.rpc("publish_event_v2", {
        p_event_id: id,
        p_payload: persistPayload as unknown as Json,
      })

      if (rpc.error && !shouldFallbackPublishRpc(rpc.error)) {
        return { success: false, error: publishActionError(rpc.error) }
      }

      if (!rpc.error) {
        usedRpc = true
        try {
          // publish_event_v2 already wrote tickets, maps and units in one TX.
          await hardReplacePublishedEventArtists({ eventId: id, lineup })
          await unpackPublishedExperience(id, payload)
          await applyPublishedPurchaseFields(id, payload)
        } catch (error) {
          postRpcError = error
        }
      }
    }

    if (!usedRpc) {
      try {
        const written = await unpackPublishEventV2Sequential({
          eventId: id,
          organizerId: event.organizer_id,
          existingVenueId: event.venue_id,
          existingFlyerUrl: event.flyer_url,
          existingImageUrl: event.image_url,
          existingShareUrl: event.social_share_image_url,
          payload: persistPayload,
          lineup,
        })
        slug = written.slug
      } catch (error) {
        return {
          success: false,
          error: publishActionError(error),
        }
      }
    }
  }

  const comboSync = await syncPublishedComboItems({
    db: gate.supabase as never,
    eventId: id,
    tickets: payload.tickets,
  })
  if (!comboSync.ok) {
    return { success: false, error: publishActionError(comboSync.error) }
  }

  if (targetStatus === "published") {
    try {
      await ensurePublishedCatalogListing(id, event.organizer_id, persistPayload)
    } catch (error) {
      return {
        success: false,
        error: publishActionError(error),
      }
    }
  }

  if (postRpcError) {
    return {
      success: false,
      error: publishActionError(postRpcError),
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
