"use server"

import { listEventSponsors } from "@/app/actions/event-sponsors"
import { logger } from "@/lib/logger"
import { createClient } from "@/lib/supabase/server"
import {
  buildCatalogSearchOr,
  FEATURED_DISCOVERY_ARTISTS_LIMIT,
  isMissingArtistSchema,
  mapCatalogEventArtists,
  rankFeaturedArtists,
  sanitizeCatalogSearch,
  type CatalogEventArtist,
  type FeaturedDiscoveryArtist,
} from "@/lib/discovery-artists"
import { parseScheduleDays } from "@/lib/event-schedule"
import {
  eventArtistsToLineup,
  hasEventLineup,
  parseEventLineup,
  type EventLineupData,
} from "@/lib/event-lineup"
import {
  parseDefaultTicketTab,
  parseTicketHighlightBadge,
} from "@/lib/checkout/ticket-picker"
import { fisherYatesShuffle, FEATURED_CAROUSEL_LIMIT } from "@/lib/featured-rotation"
import type { FeaturedRotationResult } from "@/lib/featured-rotation"
import { isPastEvent } from "@/lib/event-status"
import { isHomePriority, sortCatalogForHome } from "@/lib/services/events-service"
import { isEventUuid } from "@/lib/seo/site"
import { decodeEventParam, eventSlugSuffix, uuidPrefixFromSlugSuffix } from "@/lib/seo/event-slug"
import {
  applyActivePhaseToTier,
  isMissingPhasesSchema,
  mapPublicPhaseRow,
  type PublicTicketPhase,
} from "@/lib/inventory/active-phase"
import { parseBundleItems, serializeBundleItems } from "@/lib/inventory/unified-inventory"
import type { Event, TicketTier, Venue } from "@/types/database"
import type { ScheduleDay } from "@/types/events"
import type { EventSeatingUnit, SeatingSectorSummary, VenueSeatingLayout } from "@/types/venues"
import {
  isSeatingSummaryMinUuidError,
  mapSeatingSectorSummaryRows,
  seatingSummariesFromTicketTiers,
} from "@/lib/seating/seating-sector-summary"
import {
  hasInteractiveVenueMap,
  seatingLayoutToVenueMap,
} from "@/lib/seating/venue-map-geometry"
import { parseVenueMap, type InteractiveVenueMap } from "@/types/venue-map"
import type { EventPixelConfig } from "@/lib/analytics/pixels"
import type { PublicSponsor } from "@/lib/sponsors"

export type CatalogEvent = {
  id: string
  slug: string
  title: string
  description: string | null
  date: string
  endsAt: string | null
  scheduleDays: ScheduleDay[]
  location: string
  imageUrl: string | null
  status: Event["status"]
  venueName: string | null
  venueLocation: string | null
  organizerName: string | null
  startingPrice: number | null
  /** 0–1 ocupación agregada de tiers (para badges FOMO). */
  soldRatio: number | null
  ticketsLeft: number | null
  isFeatured: boolean
  featuredTier: "silver" | "gold" | "platinum" | null
  featuredUntil: string | null
  isSponsoredByTokepass: boolean
  /** FK event_categories — taxonomía centralizada. */
  categoryId: string | null
  /** Lineup público (`event_artists` o JSON `events.lineup`). */
  artists: CatalogEventArtist[]
}

export type EventDetails = {
  id: string
  slug: string
  title: string
  description: string | null
  date: string
  endsAt: string | null
  location: string
  imageUrl: string | null
  status: Event["status"]
  visibility: Event["visibility"]
  scheduleDays: ScheduleDay[]
  /** Fracción decimal del cargo Tokepass (ej. 0.15) */
  serviceChargeRate: number
  /** Cargo fijo ARS por entrada paga (split All-In). */
  platformFixedFee: number
  isSponsoredByTokepass: boolean
  maxFreeTickets: number
  organizerName: string | null
  organizerBio: string | null
  organizerAvatarUrl: string | null
  venue:
    | (Pick<
        Venue,
        | "id"
        | "name"
        | "location"
        | "address"
        | "city"
        | "capacity"
        | "seating_background_url"
        | "latitude"
        | "longitude"
      > & {
        seating_layout: VenueSeatingLayout
        venue_map: InteractiveVenueMap
      })
    | null
  /** El recinto tiene plano SVG (zonas, fondo o butacas) para el takeover B2C. */
  hasInteractiveMap: boolean
  seatingUnits: EventSeatingUnit[]
  seatingSectorSummaries: SeatingSectorSummary[]
  zoneTierPricing: Array<{
    sectorKey: string
    ticketTierId: string
    price: number
    tableNumberStart: number | null
    tableNumberEnd: number | null
  }>
  comboItemsByTier: Record<string, Array<{ name: string; quantity: number }>>
  tiers: Array<
    Pick<
      TicketTier,
      | "id"
      | "name"
      | "price"
      | "capacity"
      | "sold"
      | "time_limit"
      | "bonus_reward"
      | "day_id"
      | "visibility"
      | "layout_type"
      | "seating_sector_id"
      | "capacity_per_unit"
      | "category"
      | "list_price"
      | "tier_type"
      | "bundle_items"
      | "bundle_type"
      | "description"
      | "highlight_badge"
    > & { available: number; phases: PublicTicketPhase[] }
  >
  /** Tab inicial del picker. auto = el de más stock restante. */
  defaultTicketTab: "auto" | "seated" | "general" | "bundle" | "addon"
  /** Tope por comprador y transacción. null o 0 = sin límite. */
  maxTicketsPerUser: number | null
  pixels: EventPixelConfig
  /** Spot YouTube/Vimeo (URL). */
  promoVideoUrl: string | null
  /** Hasta 4 fotos de galería. */
  galleryUrls: string[]
  lineup: EventLineupData
  sponsors: PublicSponsor[]
  categoryId: string | null
  createdAt: string | null
}

type EventListRow = {
  id: string
  slug: string | null
  title: string
  description: string | null
  date: string
  ends_at: string | null
  schedule_days: unknown
  location: string
  image_url: string | null
  flyer_url: string | null
  status: Event["status"]
  visibility: Event["visibility"] | null
  is_featured: boolean | null
  featured_tier: "silver" | "gold" | "platinum" | null
  featured_until: string | null
  is_sponsored_by_tokepass: boolean | null
  category_id: string | null
  venues: { name: string; location: string } | null
  ticket_tiers: {
    price: number
    capacity: number
    sold: number
    visibility?: string | null
  }[] | null
  profiles: { full_name: string | null } | null
  lineup?: unknown
  event_artists?: unknown
}

type EventDetailRow = {
  id: string
  slug?: string | null
  title: string
  description: string | null
  date: string
  location: string
  image_url: string | null
  flyer_url: string | null
  status: Event["status"]
  visibility: Event["visibility"] | null
  organizer_id?: string
  schedule_days: unknown
  ends_at?: string | null
  is_sponsored_by_tokepass?: boolean | null
  max_free_tickets?: number | null
  max_tickets_per_user?: number | null
  platform_fee_percentage?: number | null
  platform_fixed_fee?: number | null
  meta_pixel_id?: string | null
  meta_pixel_enabled?: boolean | null
  tiktok_pixel_id?: string | null
  tiktok_pixel_enabled?: boolean | null
  ga4_measurement_id?: string | null
  ga4_enabled?: boolean | null
  promo_video_url?: string | null
  gallery_urls?: string[] | null
  lineup?: unknown
  category_id?: string | null
  created_at?: string | null
  default_ticket_tab?: string | null
  venue_id?: string | null
  venue_map?: unknown
  venues:
    | (Pick<
        Venue,
        | "id"
        | "name"
        | "location"
        | "address"
        | "city"
        | "capacity"
        | "seating_background_url"
        | "latitude"
        | "longitude"
      > & {
        seating_layout?: unknown
        venue_map?: unknown
      })
    | null
  ticket_tiers: Array<
    Pick<
      TicketTier,
      | "id"
      | "name"
      | "price"
      | "capacity"
      | "sold"
      | "time_limit"
      | "bonus_reward"
      | "day_id"
      | "visibility"
      | "layout_type"
      | "seating_sector_id"
      | "capacity_per_unit"
      | "category"
      | "list_price"
      | "description"
      | "highlight_badge"
    >
  > | null
  profiles?: { full_name: string | null } | null
}

function computeStartingPrice(tiers: { price: number }[] | null): number | null {
  if (!tiers?.length) return null
  return Math.min(...tiers.map((tier) => Number(tier.price)))
}

function computeInventory(
  tiers: { capacity: number; sold: number; visibility?: string | null }[] | null,
): {
  soldRatio: number | null
  ticketsLeft: number | null
} {
  const publicTiers = (tiers ?? []).filter(
    (tier) => (tier.visibility ?? "public") !== "private",
  )
  if (!publicTiers.length) return { soldRatio: null, ticketsLeft: null }
  const capacity = publicTiers.reduce(
    (sum, tier) => sum + Number(tier.capacity),
    0,
  )
  const sold = publicTiers.reduce((sum, tier) => sum + Number(tier.sold), 0)
  if (capacity <= 0) return { soldRatio: null, ticketsLeft: null }
  return {
    soldRatio: Math.min(1, Math.max(0, sold / capacity)),
    ticketsLeft: Math.max(0, capacity - sold),
  }
}

function startOfTodayIso(): string {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now.toISOString()
}

const EVENT_LIST_SELECT =
  "id, slug, title, description, date, ends_at, schedule_days, location, image_url, flyer_url, status, visibility, is_featured, featured_tier, featured_until, is_sponsored_by_tokepass, category_id, venues(name, location), ticket_tiers(price, capacity, sold, visibility), profiles!events_organizer_id_fkey(full_name)"

const EVENT_ARTISTS_EMBED =
  "event_artists(artist_id, artists(id, name, image_url))"
const EVENT_ARTISTS_INNER_EMBED =
  "event_artists!inner(artist_id, artists(id, name, image_url))"
const EVENT_LIST_SELECT_WITH_LINEUP = `${EVENT_LIST_SELECT}, lineup`
const EVENT_LIST_SELECT_WITH_ARTISTS = `${EVENT_LIST_SELECT_WITH_LINEUP}, ${EVENT_ARTISTS_EMBED}`
const EVENT_LIST_SELECT_BY_ARTIST = `${EVENT_LIST_SELECT_WITH_LINEUP}, ${EVENT_ARTISTS_INNER_EMBED}`

async function findEventIdsMatchingArtistName(
  needle: string,
): Promise<string[]> {
  if (!needle) return []
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("event_artists")
      .select("event_id, artists!inner(name)")
      .ilike("artists.name", `%${needle}%`)
      .limit(200)

    if (error) {
      if (!isMissingArtistSchema(error.message)) {
        logger.error({
          context: "public-events",
          message: "list_published_artist_name_failed",
          error,
        })
      }
      return []
    }

    return [
      ...new Set(
        (data ?? [])
          .map((row) => (row.event_id as string | null)?.trim() || "")
          .filter(Boolean),
      ),
    ]
  } catch (error) {
    logger.error({
      context: "public-events",
      message: "list_published_artist_name_unexpected",
      error,
    })
    return []
  }
}

export async function getPublishedEvents(
  search?: string,
  options?: { artistId?: string },
): Promise<CatalogEvent[]> {
  const supabase = await createClient()
  const needle = sanitizeCatalogSearch(search ?? "")
  const artistId = options?.artistId?.trim() || ""
  const filterByArtist = Boolean(artistId) && isEventUuid(artistId)
  const artistEventIds = needle ? await findEventIdsMatchingArtistName(needle) : []
  const orFilter = needle ? buildCatalogSearchOr(needle, artistEventIds) : null

  const selects = filterByArtist
    ? [EVENT_LIST_SELECT_BY_ARTIST, EVENT_LIST_SELECT_WITH_LINEUP]
    : [EVENT_LIST_SELECT_WITH_ARTISTS, EVENT_LIST_SELECT_WITH_LINEUP]

  for (const [index, select] of selects.entries()) {
    const usingArtistJoin = select.includes("event_artists")
    if (filterByArtist && !usingArtistJoin) return []

    let query = supabase
      .from("events")
      .select(select)
      .eq("status", "published")
      .eq("visibility", "public")
      .order("date", { ascending: true })

    if (filterByArtist) {
      query = query.eq("event_artists.artist_id", artistId)
    }
    if (orFilter) {
      query = query.or(orFilter)
    }

    const { data, error } = await query

    if (!error) {
      const mapped = ((data ?? []) as unknown as EventListRow[]).map(
        mapEventListRow,
      )
      return sortCatalogForHome(mapped)
    }

    const canRetryWithoutJoin =
      usingArtistJoin &&
      index === 0 &&
      isMissingArtistSchema(error.message)

    if (!canRetryWithoutJoin) {
      logger.error({
        context: "public-events",
        message: filterByArtist
          ? "list_published_by_artist_failed"
          : "list_published_failed",
        artist_id: filterByArtist ? artistId : undefined,
        error,
      })
      return []
    }
  }

  return []
}

/** Eventos públicos vigentes asociados a un artista (event_artists). */
export async function getPublishedEventsByArtist(
  artistId: string,
): Promise<CatalogEvent[]> {
  if (!isEventUuid(artistId)) return []
  return getPublishedEvents(undefined, { artistId })
}

/** Top artistas con más eventos publicados vigentes. */
export async function getFeaturedDiscoveryArtists(
  limit = FEATURED_DISCOVERY_ARTISTS_LIMIT,
): Promise<FeaturedDiscoveryArtist[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("event_artists")
      .select(
        "artist_id, artists(id, name, image_url), events!inner(status, visibility)",
      )
      .eq("events.status", "published")
      .eq("events.visibility", "public")

    if (error) {
      if (!isMissingArtistSchema(error.message)) {
        logger.error({
          context: "public-events",
          message: "featured_discovery_artists_failed",
          error,
        })
      }
      return []
    }

    const artists: CatalogEventArtist[] = []
    for (const row of data ?? []) {
      const nested = Array.isArray(row.artists) ? row.artists[0] : row.artists
      const id = String(nested?.id ?? row.artist_id ?? "").trim()
      const name = String(nested?.name ?? "").trim()
      if (!id || !name) continue
      artists.push({
        id,
        name,
        imageUrl: nested?.image_url?.trim() || null,
      })
    }

    return rankFeaturedArtists(artists, limit)
  } catch (error) {
    logger.error({
      context: "public-events",
      message: "featured_discovery_artists_unexpected",
      error,
    })
    return []
  }
}

function mapEventListRow(event: EventListRow): CatalogEvent {
  const inventory = computeInventory(event.ticket_tiers)
  const featuredUntil = event.featured_until
  const stillActive =
    Boolean(event.is_featured) &&
    Boolean(featuredUntil) &&
    new Date(String(featuredUntil)).getTime() > Date.now()
  const scheduleDays = parseScheduleDays(event.schedule_days)

  return {
    id: event.id,
    slug: event.slug?.trim() || event.id,
    title: event.title,
    description: event.description,
    date: event.date,
    endsAt: event.ends_at,
    scheduleDays,
    location: event.location,
    imageUrl: event.flyer_url ?? event.image_url,
    status: event.status,
    venueName: event.venues?.name ?? null,
    venueLocation: event.venues?.location ?? null,
    organizerName: event.profiles?.full_name ?? null,
    startingPrice: computeStartingPrice(event.ticket_tiers),
    soldRatio: inventory.soldRatio,
    ticketsLeft: inventory.ticketsLeft,
    isFeatured: stillActive,
    featuredTier: stillActive ? event.featured_tier : null,
    featuredUntil: stillActive ? featuredUntil : null,
    isSponsoredByTokepass: Boolean(event.is_sponsored_by_tokepass),
    categoryId: event.category_id ?? null,
    artists: mapCatalogEventArtists({
      eventArtists: event.event_artists,
      lineupJson: event.lineup,
    }),
  }
}

/**
 * Eventos para el Hero / Destacados.
 * Incluye auspicio Tokepass y boosts activos; Fisher–Yates + tope 6.
 * Un solo elegible también entra al carrusel.
 */
export async function getFeaturedEvents(options?: {
  province?: string | null
}): Promise<FeaturedRotationResult<CatalogEvent>> {
  const supabase = await createClient()
  const province = options?.province?.trim().toLowerCase() ?? ""

  const { data, error } = await supabase
    .from("events")
    .select(
      "id, slug, title, description, date, ends_at, schedule_days, location, image_url, flyer_url, status, visibility, is_featured, featured_tier, featured_until, is_sponsored_by_tokepass, category_id, venues(name, location), ticket_tiers(price, capacity, sold, visibility), profiles!events_organizer_id_fkey(full_name)",
    )
    .eq("status", "published")
    .eq("visibility", "public")
    .gte("date", startOfTodayIso())
    .or("is_sponsored_by_tokepass.eq.true,is_featured.eq.true")

  if (error) {
    logger.error({
      context: "public-events",
      message: "list_featured_failed",
      error,
    })
    return { pool: [], totalSponsored: 0, events: [] }
  }

  let mapped = ((data ?? []) as unknown as EventListRow[])
    .map(mapEventListRow)
    .filter((event) => isHomePriority(event))
    .filter((event) => !isPastEvent(event))

  if (province && province !== "todas") {
    mapped = mapped.filter((event) => {
      const place =
        `${event.venueLocation ?? ""} ${event.location} ${event.venueName ?? ""}`.toLowerCase()
      return place.includes(province)
    })
  }

  const pool = fisherYatesShuffle(mapped)

  return {
    pool,
    totalSponsored: pool.length,
    events: pool.slice(0, FEATURED_CAROUSEL_LIMIT),
  }
}

export async function getEventDetails(
  eventId: string,
): Promise<EventDetails | null> {
  return loadEventDetails(eventId, { mode: "public" })
}

export type EventAccessGate = {
  eventId: string
  title: string
  status: Event["status"]
}

/**
 * Cuando el detalle público no carga (no published), informa si está
 * pausado/borrador para mostrar mensaje amigable en vez de 404 genérico.
 */
export async function getEventAccessGate(
  eventId: string,
): Promise<EventAccessGate | null> {
  if (!eventId) return null
  const supabase = await createClient()
  const resolvedId = await resolveEventRecordId(supabase, eventId)
  if (!resolvedId) return null
  const { data, error } = await supabase.rpc("get_event_public_access_gate", {
    p_event_id: resolvedId,
  })
  if (error || !data) return null
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    eventId: row.event_id as string,
    title: (row.title as string) || "Evento",
    status: row.status as Event["status"],
  }
}

/**
 * Vista previa privada: organizador dueño (o super_admin) puede abrir borradores
 * y eventos no públicos para probar compra / QR.
 */
export async function getPreviewEventDetails(
  eventId: string,
): Promise<EventDetails | null> {
  return loadEventDetails(eventId, { mode: "preview" })
}

async function resolveEventRecordId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slugOrId: string,
): Promise<string | null> {
  const value = decodeEventParam(slugOrId)
  if (!value) return null
  if (isEventUuid(value)) return value

  const { data: bySlug, error: slugError } = await supabase
    .from("events")
    .select("id")
    .eq("slug", value)
    .maybeSingle()

  if (bySlug?.id) return bySlug.id
  if (slugError) {
    logger.error({
      context: "public-events",
      message: "resolve_slug_failed",
      slug: value,
      error: slugError,
    })
  }

  const suffix = eventSlugSuffix(value)
  if (!suffix) return null

  const { data: bySlugTail } = await supabase
    .from("events")
    .select("id, slug")
    .ilike("slug", `%${suffix}`)
    .limit(8)

  if (bySlugTail && bySlugTail.length > 0) {
    const exact = bySlugTail.find((row) => row.slug === value)
    if (exact?.id) return exact.id
    if (bySlugTail.length === 1) return bySlugTail[0]!.id
  }

  const { data: byPrefix } = await supabase
    .from("events")
    .select("id, slug")
    .like("id", uuidPrefixFromSlugSuffix(suffix))
    .limit(8)

  if (!byPrefix || byPrefix.length === 0) return null
  const slugMatch = byPrefix.find((row) => row.slug === value)
  return slugMatch?.id ?? byPrefix[0]?.id ?? null
}

async function loadVenueMapJson(
  supabase: Awaited<ReturnType<typeof createClient>>,
  venueId: string | null | undefined,
  eventId: string,
): Promise<unknown> {
  if (venueId) {
    const { data, error } = await supabase
      .from("venues")
      .select("venue_map")
      .eq("id", venueId)
      .maybeSingle()
    if (!error && data && "venue_map" in data && data.venue_map) {
      const parsed = parseVenueMap(data.venue_map)
      if (hasInteractiveVenueMap(parsed)) return data.venue_map
    }
  }

  const { data, error } = await supabase
    .from("events")
    .select("venue_map")
    .eq("id", eventId)
    .maybeSingle()
  if (error || !data || !("venue_map" in data)) return null
  return data.venue_map
}

export async function getPublicEventVenueMap(
  eventId: string,
): Promise<InteractiveVenueMap | null> {
  const supabase = await createClient()
  const resolvedId = await resolveEventRecordId(supabase, eventId)
  if (!resolvedId) return null

  const { data: event } = await supabase
    .from("events")
    .select("id, venue_id")
    .eq("id", resolvedId)
    .maybeSingle()
  if (!event) return null

  const raw = await loadVenueMapJson(
    supabase,
    (event as { venue_id?: string | null }).venue_id,
    resolvedId,
  )
  const parsed = parseVenueMap(raw)
  return hasInteractiveVenueMap(parsed) ? parsed : null
}

async function loadPublicTicketPhases(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tierIds: string[],
): Promise<Map<string, PublicTicketPhase[]>> {
  const byTier = new Map<string, PublicTicketPhase[]>()
  if (tierIds.length === 0) return byTier

  const { data, error } = await supabase
    .from("ticket_tier_phases")
    .select(
      "id, tier_id, name, price, capacity_limit, sold, start_time, end_time, status",
    )
    .in("tier_id", tierIds)
    .order("start_time", { ascending: true, nullsFirst: false })

  if (error) {
    if (!isMissingPhasesSchema(error.message)) {
      logger.error({
        context: "public-events",
        message: "ticket_phases_load_failed",
        error,
      })
    }
    return byTier
  }

  for (const row of data ?? []) {
    const list = byTier.get(row.tier_id) ?? []
    list.push(mapPublicPhaseRow(row))
    byTier.set(row.tier_id, list)
  }
  return byTier
}

async function loadEventCoreRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  mode: "public" | "preview",
) {
  let query = supabase
    .from("events")
    .select(
      "id, slug, created_at, title, description, date, ends_at, location, image_url, flyer_url, status, visibility, schedule_days, organizer_id, category_id, is_sponsored_by_tokepass, max_free_tickets, max_tickets_per_user, platform_fee_percentage, platform_fixed_fee, promo_video_url, gallery_urls",
    )
    .eq("id", eventId)

  if (mode === "public") {
    query = query.eq("status", "published").neq("visibility", "guest_list_only")
  }

  const { data, error } = await query.maybeSingle()
  if (error) {
    logger.error({
      context: "public-events",
      message: "load_event_core_failed",
      event_id: eventId,
      error,
    })
    return null
  }
  return data
}

async function loadEventDetails(
  eventId: string,
  options: { mode: "public" | "preview" },
): Promise<EventDetails | null> {
  const supabase = await createClient()
  const resolvedId = await resolveEventRecordId(supabase, eventId)
  if (!resolvedId) return null

  const eventSelectWithPicker =
    "id, slug, created_at, title, description, date, ends_at, location, image_url, flyer_url, status, visibility, schedule_days, organizer_id, category_id, is_sponsored_by_tokepass, max_free_tickets, max_tickets_per_user, platform_fee_percentage, platform_fixed_fee, meta_pixel_id, meta_pixel_enabled, tiktok_pixel_id, tiktok_pixel_enabled, ga4_measurement_id, ga4_enabled, promo_video_url, gallery_urls, lineup, default_ticket_tab, venue_id, venue_map, venues(id, name, location, address, city, capacity, seating_background_url, seating_layout, venue_map, latitude, longitude), ticket_tiers(id, name, price, list_price, capacity, sold, time_limit, bonus_reward, day_id, visibility, layout_type, seating_sector_id, capacity_per_unit, category, tier_type, bundle_items, bundle_type, description, highlight_badge), profiles!events_organizer_id_fkey(full_name)"
  const eventSelectCore =
    "id, slug, created_at, title, description, date, ends_at, location, image_url, flyer_url, status, visibility, schedule_days, organizer_id, category_id, is_sponsored_by_tokepass, max_free_tickets, max_tickets_per_user, platform_fee_percentage, platform_fixed_fee, meta_pixel_id, meta_pixel_enabled, tiktok_pixel_id, tiktok_pixel_enabled, ga4_measurement_id, ga4_enabled, promo_video_url, gallery_urls, venue_id, venue_map, venues(id, name, location, address, city, capacity, seating_background_url, seating_layout, venue_map, latitude, longitude), ticket_tiers(id, name, price, list_price, capacity, sold, time_limit, bonus_reward, day_id, visibility, layout_type, seating_sector_id, capacity_per_unit, category, tier_type, bundle_items, bundle_type), profiles!events_organizer_id_fkey(full_name)"

  let query = supabase
    .from("events")
    .select(eventSelectWithPicker)
    .eq("id", resolvedId)

  if (options.mode === "public") {
    query = query.eq("status", "published").neq("visibility", "guest_list_only")
  }

  let { data, error } = await query.maybeSingle()

  if (
    error &&
    /default_ticket_tab|highlight_badge|ticket_tiers.*description|venue_map|lineup|schema cache|PGRST204|42703/i.test(
      error.message,
    )
  ) {
    let fallback = supabase
      .from("events")
      .select(eventSelectCore)
      .eq("id", resolvedId)
    if (options.mode === "public") {
      fallback = fallback
        .eq("status", "published")
        .neq("visibility", "guest_list_only")
    }
    const retry = await fallback.maybeSingle()
    data = retry.data as typeof data
    error = retry.error
  }

  let row = data as EventDetailRow | null
  if (error || !row) {
    logger.error({
      context: "public-events",
      message: "load_event_failed",
      event_id: resolvedId,
      error,
    })
    row = (await loadEventCoreRow(
      supabase,
      resolvedId,
      options.mode,
    )) as EventDetailRow | null
  }

  if (!row) return null

  if (options.mode === "preview") {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const isOwner = row.organizer_id === user.id
    const isSuperAdmin = profile?.role === "super_admin"
    if (!isOwner && !isSuperAdmin) return null
  }

  const { data: sectorSummaryRows, error: seatingError } = await supabase.rpc(
    "get_event_seating_sector_summary",
    { p_event_id: resolvedId },
  )
  const rpcSummaries =
    !seatingError && Array.isArray(sectorSummaryRows)
      ? mapSeatingSectorSummaryRows(sectorSummaryRows)
      : []
  if (seatingError && !isSeatingSummaryMinUuidError(seatingError)) {
    logger.error({
      context: "public-events",
      message: "seating_summary_failed",
      event_id: resolvedId,
      error: seatingError,
    })
  }

  const { data: zonePricingRows } = await supabase
    .from("zone_tier_pricing")
    .select(
      "sector_key, ticket_tier_id, price, table_number_start, table_number_end",
    )
    .eq("event_id", resolvedId)

  const event = row
  const scheduleDays = parseScheduleDays(event.schedule_days)
  const tiers = [...(event.ticket_tiers ?? [])]
    .filter((tier) => tier.visibility !== "private")
    .sort((a, b) => Number(a.price) - Number(b.price))
  const phasesByTier = await loadPublicTicketPhases(
    supabase,
    tiers.map((tier) => tier.id),
  )

  const { data: comboRows } =
    tiers.length > 0
      ? await supabase
          .from("ticket_tier_combo_items")
          .select("tier_id, quantity, event_items(name)")
          .in(
            "tier_id",
            tiers.map((tier) => tier.id),
          )
      : { data: [] as Array<{
          tier_id: string
          quantity: number
          event_items: { name: string } | null
        }> }

  let serviceChargeRate = 0.08
  const { data: rate } = await supabase.rpc("get_event_service_charge_rate", {
    p_event_id: resolvedId,
  })
  if (typeof rate === "number" && Number.isFinite(rate)) {
    serviceChargeRate = rate
  } else if (rate != null && Number.isFinite(Number(rate))) {
    serviceChargeRate = Number(rate)
  }

  let platformFixedFee = Number(event.platform_fixed_fee ?? 0)
  const { data: fixedFeeRpc } = await supabase.rpc(
    "get_event_platform_fixed_fee",
    { p_event_id: resolvedId },
  )
  if (typeof fixedFeeRpc === "number" && Number.isFinite(fixedFeeRpc)) {
    platformFixedFee = fixedFeeRpc
  } else if (fixedFeeRpc != null && Number.isFinite(Number(fixedFeeRpc))) {
    platformFixedFee = Number(fixedFeeRpc)
  }

  const isSponsoredByTokepass = Boolean(event.is_sponsored_by_tokepass)
  if (isSponsoredByTokepass) {
    serviceChargeRate = 0
    platformFixedFee = 0
  }

  let organizerName = event.profiles?.full_name?.trim() || null
  let organizerBio: string | null = null
  let organizerAvatarUrl: string | null = null

  if (event.organizer_id) {
    const { data: publicProfile } = await supabase.rpc(
      "get_public_organizer_profile",
      { p_organizer_id: event.organizer_id },
    )
    const row = Array.isArray(publicProfile) ? publicProfile[0] : publicProfile
    if (row && typeof row === "object") {
      const profileRow = row as {
        public_name?: string | null
        public_bio?: string | null
        avatar_url?: string | null
        full_name?: string | null
      }
      organizerName =
        profileRow.public_name?.trim() ||
        profileRow.full_name?.trim() ||
        organizerName
      organizerBio = profileRow.public_bio?.trim() || null
      organizerAvatarUrl = profileRow.avatar_url?.trim() || null
    }
  }

  const [sponsors, relationalLineup] = await Promise.all([
    listEventSponsors(event.id).catch(() => []),
    loadEventArtistsLineup(supabase, event.id),
  ])
  const seatingLayout = event.venues
    ? parsePublicSeatingLayout(event.venues.seating_layout)
    : []
  const venueMap = await resolvePublicVenueMap(supabase, event, seatingLayout)
  const hasInteractiveMap =
    hasInteractiveVenueMap(venueMap) ||
    Boolean(event.venues?.seating_background_url?.trim()) ||
    seatingLayout.length > 0

  return {
    id: event.id,
    slug: event.slug?.trim() || event.id,
    title: event.title,
    description: event.description,
    date: event.date,
    endsAt: event.ends_at ?? null,
    location: event.location,
    imageUrl: event.flyer_url ?? event.image_url,
    status: event.status,
    visibility:
      event.visibility === "private" || event.visibility === "guest_list_only"
        ? event.visibility
        : "public",
    scheduleDays,
    serviceChargeRate,
    platformFixedFee,
    isSponsoredByTokepass,
    maxFreeTickets: Number(event.max_free_tickets ?? 100),
    maxTicketsPerUser: (() => {
      const raw = Number(event.max_tickets_per_user)
      if (!Number.isFinite(raw) || raw <= 0) return null
      return Math.floor(raw)
    })(),
    organizerName,
    organizerBio,
    organizerAvatarUrl,
    venue: event.venues
      ? {
          id: event.venues.id,
          name: event.venues.name,
          location: event.venues.location,
          address: event.venues.address ?? null,
          city: event.venues.city ?? null,
          capacity: event.venues.capacity,
          seating_background_url: event.venues.seating_background_url,
          latitude: event.venues.latitude,
          longitude: event.venues.longitude,
          seating_layout: seatingLayout,
          venue_map: venueMap,
        }
      : hasInteractiveVenueMap(venueMap)
        ? {
            id: event.venue_id ?? event.id,
            name: event.location,
            location: event.location,
            address: null,
            city: null,
            capacity: 0,
            seating_background_url: null,
            latitude: null,
            longitude: null,
            seating_layout: seatingLayout,
            venue_map: venueMap,
          }
        : null,
    hasInteractiveMap,
    seatingUnits: [],
    seatingSectorSummaries:
      rpcSummaries.length > 0
        ? rpcSummaries
        : seatingSummariesFromTicketTiers(event.ticket_tiers ?? []),
    zoneTierPricing: (zonePricingRows ?? []).map((row) => ({
      sectorKey: row.sector_key,
      ticketTierId: row.ticket_tier_id,
      price: Number(row.price) || 0,
      tableNumberStart: row.table_number_start,
      tableNumberEnd: row.table_number_end,
    })),
    comboItemsByTier: (() => {
      const map: Record<string, Array<{ name: string; quantity: number }>> = {}
      for (const row of comboRows ?? []) {
        const item = row.event_items as unknown as { name: string } | null
        const list = map[row.tier_id] ?? []
        list.push({
          name: item?.name ?? "Extra",
          quantity: Number(row.quantity) || 1,
        })
        map[row.tier_id] = list
      }
      for (const tier of tiers) {
        if ((map[tier.id]?.length ?? 0) > 0) continue
        const bundled = parseBundleItems(
          (tier as { bundle_items?: unknown }).bundle_items,
        )
        if (bundled.length === 0) continue
        map[tier.id] = bundled.map((item) => {
          const child = tiers.find((candidate) => candidate.id === item.tierId)
          return {
            name: child?.name ?? "Ítem",
            quantity: item.quantity,
          }
        })
      }
      return map
    })(),
    tiers: tiers.map((tier) => {
      const phases = phasesByTier.get(tier.id) ?? []
      const priced = applyActivePhaseToTier(
        {
          price: Number(tier.price),
          available: Math.max(0, tier.capacity - tier.sold),
        },
        phases,
      )
      return {
        ...tier,
        category: tier.category ?? "standard",
        list_price: tier.list_price == null ? null : Number(tier.list_price),
        price: priced.price,
        available: priced.available,
        phases,
        tier_type:
          (tier as { tier_type?: TicketTier["tier_type"] }).tier_type ??
          (tier.layout_type === "numbered_seat" ||
          tier.layout_type === "table_combo"
            ? "seated"
            : tier.category === "bundle"
              ? "bundle"
              : "general"),
        bundle_items: serializeBundleItems(
          parseBundleItems(
            (tier as { bundle_items?: unknown }).bundle_items,
          ),
        ) as TicketTier["bundle_items"],
        bundle_type:
          (tier as { bundle_type?: TicketTier["bundle_type"] }).bundle_type ??
          null,
        description:
          typeof (tier as { description?: string | null }).description === "string"
            ? String((tier as { description?: string | null }).description).trim() ||
              null
            : null,
        highlight_badge: parseTicketHighlightBadge(
          (tier as { highlight_badge?: string | null }).highlight_badge,
        ),
      }
    }),
    defaultTicketTab: parseDefaultTicketTab(
      (event as { default_ticket_tab?: string | null }).default_ticket_tab,
    ),
    pixels: {
      metaPixelId: event.meta_pixel_id ?? null,
      metaPixelEnabled: Boolean(event.meta_pixel_enabled),
      tiktokPixelId: event.tiktok_pixel_id ?? null,
      tiktokPixelEnabled: Boolean(event.tiktok_pixel_enabled),
      ga4MeasurementId: event.ga4_measurement_id ?? null,
      ga4Enabled: Boolean(event.ga4_enabled),
    },
    promoVideoUrl: event.promo_video_url?.trim() || null,
    galleryUrls: Array.isArray(event.gallery_urls)
      ? event.gallery_urls.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        ).slice(0, 4)
      : [],
    lineup: hasEventLineup(relationalLineup)
      ? relationalLineup
      : parseEventLineup(event.lineup),
    sponsors,
    categoryId: event.category_id ?? null,
    createdAt: event.created_at ?? null,
  }
}

async function loadEventArtistsLineup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
): Promise<EventLineupData> {
  const empty: EventLineupData = { artists: [], slots: [] }
  const selects = [
    "id, performance_time, stage, sort_order, is_headliner, artists(id, name, image_url, bio, spotify_id, top_track_preview_url, top_track_name)",
    "id, performance_time, stage, sort_order, is_headliner, artists(id, name, image_url, bio, top_track_preview_url, top_track_name)",
    "id, performance_time, stage, sort_order, is_headliner, artists(id, name, image_url, bio)",
    "id, performance_time, stage, sort_order, artists(id, name, image_url, bio, spotify_id, top_track_preview_url, top_track_name)",
    "id, performance_time, stage, sort_order, artists(id, name, image_url, bio, top_track_preview_url, top_track_name)",
    "id, performance_time, stage, sort_order, artists(id, name, image_url, bio)",
  ]

  let lastError: { message: string } | null = null
  for (const columns of selects) {
    const query = await supabase
      .from("event_artists")
      .select(columns)
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })
    if (!query.error) {
      return eventArtistsToLineup(query.data ?? [])
    }
    lastError = query.error
  }

  if (lastError && !/event_artists|schema cache|PGRST204|42703/i.test(lastError.message)) {
    logger.error({
      context: "public-events",
      message: "event_artists_load_failed",
      event_id: eventId,
      error: lastError,
    })
  }
  return empty
}

async function resolvePublicVenueMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  event: EventDetailRow,
  seatingLayout: VenueSeatingLayout,
): Promise<InteractiveVenueMap> {
  const candidates = [
    parseVenueMap(event.venues?.venue_map),
    parseVenueMap(event.venue_map),
    parseVenueMap(
      Array.isArray(event.venues?.seating_layout)
        ? null
        : event.venues?.seating_layout,
    ),
    parseVenueMap(
      await loadVenueMapJson(
        supabase,
        event.venue_id ?? event.venues?.id,
        event.id,
      ),
    ),
    seatingLayout.length > 0
      ? seatingLayoutToVenueMap(seatingLayout)
      : parseVenueMap(null),
  ]
  const interactive = candidates.find((map) => hasInteractiveVenueMap(map))
  return interactive ?? parseVenueMap(null)
}

function parsePublicSeatingLayout(raw: unknown): VenueSeatingLayout {
  if (!Array.isArray(raw)) return []
  return (raw as VenueSeatingLayout).map((sector) => ({
    id: sector.id,
    sector_name: sector.sector_name,
    color: sector.color,
    pricing_tier_id: sector.pricing_tier_id ?? null,
    layout_type: sector.layout_type,
    capacity_per_unit: Number(sector.capacity_per_unit) || 1,
    items: [],
    rows: [],
  }))
}

function mapAvailabilityUnit(unit: {
  id: string
  tier_id: string
  sector_id: string
  sector_name: string
  layout_item_id: string
  label: string
  row_id: string | null
  row_number: number | null
  row_label: string | null
  color: string
  layout_type: string
  capacity_per_unit: number
  status: string
  reserved_until: string | null
}): EventSeatingUnit {
  return {
    id: unit.id,
    tierId: unit.tier_id,
    sectorId: unit.sector_id,
    sectorName: unit.sector_name,
    layoutItemId: unit.layout_item_id,
    label: unit.label,
    rowId: unit.row_id,
    rowNumber: unit.row_number,
    rowLabel: unit.row_label,
    color: unit.color,
    layoutType:
      unit.layout_type === "table_combo" ? "table_combo" : "numbered_seat",
    capacityPerUnit: Number(unit.capacity_per_unit),
    status:
      unit.status === "reserved" ||
      unit.status === "sold" ||
      unit.status === "blocked"
        ? unit.status
        : "available",
    reservedUntil: unit.reserved_until,
  }
}

/** Inventario de un sector (lazy). No usar para el evento completo. */
export async function getEventSeatingUnitsForSector(
  eventId: string,
  sectorId: string,
): Promise<EventSeatingUnit[]> {
  const cleanEvent = eventId.trim()
  const cleanSector = sectorId.trim()
  if (!cleanEvent || !cleanSector) return []

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    "get_event_seating_units_by_sector",
    {
      p_event_id: cleanEvent,
      p_sector_id: cleanSector,
    },
  )

  if (error || !data) return []
  return data.map(mapAvailabilityUnit)
}

/** Ocupación de todo el evento (teatros). Evitar en festivales de miles de unidades. */
export async function getEventSeatingAvailability(
  eventId: string,
): Promise<EventSeatingUnit[]> {
  const cleanEvent = eventId.trim()
  if (!cleanEvent) return []

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_event_seating_availability", {
    p_event_id: cleanEvent,
  })

  if (error || !data) return []
  return data.map(mapAvailabilityUnit)
}

const RELATED_POOL_LIMIT = 48

function relatedMatchScore(
  event: CatalogEvent,
  category: string | null,
  province: string | null,
): number {
  let score = 0
  if (category && event.categoryId === category) score += 2
  const needle = province?.trim().toLowerCase() ?? ""
  if (needle) {
    const place =
      `${event.venueLocation ?? ""} ${event.location} ${event.venueName ?? ""}`.toLowerCase()
    if (place.includes(needle)) score += 1
  }
  return score
}

/** Recomendaciones para la ficha pública: categoría/provincia, luego fecha más próxima. */
export async function getRelatedEvents(input: {
  currentEventId: string
  category?: string | null
  province?: string | null
  limit?: number
}): Promise<CatalogEvent[]> {
  const currentEventId = input.currentEventId.trim()
  if (!currentEventId) return []

  const limit = Math.min(Math.max(input.limit ?? 4, 1), 6)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("events")
    .select(
      "id, slug, title, description, date, ends_at, schedule_days, location, image_url, flyer_url, status, visibility, is_featured, featured_tier, featured_until, is_sponsored_by_tokepass, category_id, venues(name, location), ticket_tiers(price, capacity, sold, visibility), profiles!events_organizer_id_fkey(full_name)",
    )
    .eq("status", "published")
    .eq("visibility", "public")
    .neq("id", currentEventId)
    .order("date", { ascending: true })
    .limit(RELATED_POOL_LIMIT)

  if (error || !data) return []

  const now = new Date()
  const upcoming = ((data ?? []) as unknown as EventListRow[])
    .map(mapEventListRow)
    .filter((event) => !isPastEvent(event, now))

  const category = input.category?.trim() || null
  const province = input.province?.trim() || null

  return [...upcoming]
    .sort((a, b) => {
      const scoreDelta =
        relatedMatchScore(b, category, province) -
        relatedMatchScore(a, category, province)
      if (scoreDelta !== 0) return scoreDelta
      return new Date(a.date).getTime() - new Date(b.date).getTime()
    })
    .slice(0, limit)
}

