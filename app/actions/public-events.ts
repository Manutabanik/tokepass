"use server"

import { listEventSponsors } from "@/app/actions/event-sponsors"
import { logger } from "@/lib/logger"
import { getRequestIp, isRateLimitableIp } from "@/lib/request-ip"
import { consumeNamedRateLimit } from "@/lib/security/distributed-rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import {
  createPublicClient,
  type PublicSupabase,
} from "@/lib/supabase/public"
import { normalizePreviewKey } from "@/lib/preview/sandbox"
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
import {
  parseScheduleDays,
  remapBoundDayId,
  scheduleDaysFromEvent,
} from "@/lib/event-schedule"
import { resolveTicketCommerceType } from "@/lib/events/ticket-commerce-type"
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
import { isSandboxEventStatus } from "@/lib/events/review-status"
import { isHomePriority, sortCatalogForHome } from "@/lib/services/events-service"
import { fetchPublicOrganizerCard } from "@/lib/public-organizer"
import { isEventUuid } from "@/lib/seo/site"
import { decodeEventParam, eventSlugSuffix, uuidPrefixFromSlugSuffix } from "@/lib/seo/event-slug"
import {
  applyActivePhaseToTier,
  isMissingPhasesSchema,
  mapPublicPhaseRow,
  type PublicTicketPhase,
} from "@/lib/inventory/active-phase"
import { parseBundleItems, serializeBundleItems } from "@/lib/inventory/unified-inventory"
import {
  publicCatalogTicketsLeft,
  publicTierAvailable,
} from "@/lib/inventory/public-stock-cap"
import { startingPriceFromSellable } from "@/lib/checkout/sellable-tickets"
import type { Event, TicketTier, Venue } from "@/types/database"
import type { ScheduleDay } from "@/types/events"
import type { EventSeatingUnit, SeatingSectorSummary, VenueSeatingLayout } from "@/types/venues"
import {
  CATALOG_MAX_PAGE_SIZE,
  CATALOG_PAGE_SIZE,
  type PublishedEventsOptions,
} from "@/lib/catalog/constants"
import {
  isSeatingSummaryMinUuidError,
  mapSeatingSectorSummaryRows,
  seatingSummariesFromTicketTiers,
} from "@/lib/seating/seating-sector-summary"
import {
  hasInteractiveVenueMap,
  seatingLayoutToVenueMap,
} from "@/lib/seating/venue-map-geometry"
import { eventNeedsInteractiveCanvas } from "@/lib/seating/venue-map-pricing"
import { parseVenueMap, type InteractiveVenueMap } from "@/types/venue-map"
import { effectiveSeatingUnitStatus } from "@/lib/seating/venue-map-occupancy"
import type { EventPixelConfig } from "@/lib/analytics/pixels"
import type { PublicSponsor } from "@/lib/sponsors"
import type { EventDeliveryMode } from "@/types/database"
import { parseDeliveryMode } from "@/lib/events/delivery-mode"
import {
  eventAcceptsMercadoPago,
  eventAcceptsPosPayments,
} from "@/lib/events/checkout-policy"
import { parseEventRefundPolicy, type EventRefundPolicy } from "@/lib/validations/event-form"

export type CatalogEvent = {
  id: string
  slug: string
  title: string
  description: string | null
  date: string
  endsAt: string | null
  scheduleDays: ScheduleDay[]
  location: string | null
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
  featuredTier: Event["featured_tier"]
  featuredUntil: string | null
  isSponsoredByTokePass: boolean
  /** FK event_categories — taxonomía centralizada. */
  categoryId: string | null
  deliveryMode: EventDeliveryMode
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
  location: string | null
  imageUrl: string | null
  deliveryMode: EventDeliveryMode
  /** 1.91:1 para WhatsApp/Meta. Si falta, el SEO usa el flyer. */
  socialShareImageUrl: string | null
  status: Event["status"]
  visibility: Event["visibility"]
  scheduleDays: ScheduleDay[]
  /** Fracción decimal del cargo TokePass (ej. 0.15) */
  serviceChargeRate: number
  /** Cargo fijo ARS por entrada paga (split All-In). */
  platformFixedFee: number
  isSponsoredByTokePass: boolean
  maxFreeTickets: number
  organizerId: string | null
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
        | "max_capacity"
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
  /** Admission SKUs (`ticket_tiers` / ticket_types) with live stock. */
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
      | "ticket_type"
      | "bundle_items"
      | "bundle_type"
      | "description"
      | "highlight_badge"
      | "sale_starts_at"
      | "sale_ends_at"
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
  /** Borrador abierto con enlace de preview. Nunca incluye preview_key. */
  isDraftPreview: boolean
  /** Paso 3: cobro online Mercado Pago. Default true si la columna no existe. */
  acceptsMercadoPago: boolean
  /** Paso 3: cobro en boletería / POS. Default true si la columna no existe. */
  acceptsPosPayments: boolean
  refundPolicy: EventRefundPolicy
  /** Texto libre de restricciones y edad (ficha pública). */
  restrictions: string | null
  /** Texto libre de qué llevar / qué no llevar (ficha pública). */
  whatToBring: string | null
}

type EventListRow = {
  id: string
  slug: string | null
  title: string
  description: string | null
  date: string
  ends_at: string | null
  schedule_days: unknown
  location: string | null
  image_url: string | null
  flyer_url: string | null
  status: Event["status"]
  visibility: Event["visibility"] | null
  is_featured: boolean | null
  featured_tier: Event["featured_tier"]
  featured_until: string | null
  is_sponsored_by_tokepass: boolean | null
  category_id: string | null
  delivery_mode?: EventDeliveryMode | null
  venues: { name: string; location: string; capacity?: number | null } | null
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
  location: string | null
  image_url: string | null
  flyer_url: string | null
  social_share_image_url?: string | null
  delivery_mode?: EventDeliveryMode | null
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
  has_seating_plan?: boolean | null
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
        | "max_capacity"
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
      | "sale_starts_at"
      | "sale_ends_at"
      | "tier_type"
      | "ticket_type"
      | "bundle_items"
      | "bundle_type"
    >
  > | null
  profiles?: { full_name: string | null } | null
  accepts_mercado_pago?: boolean | null
  accepts_pos_payments?: boolean | null
  refund_policy?: string | null
  restrictions?: string | null
  what_to_bring?: string | null
}

function computeStartingPrice(
  tiers: Array<{
    price: number
    capacity?: number
    sold?: number
    visibility?: string | null
    sale_starts_at?: string | null
    sale_ends_at?: string | null
    category?: string | null
    tier_type?: string | null
    layout_type?: string | null
  }> | null,
): number | null {
  return startingPriceFromSellable(tiers)
}

function computeInventory(
  tiers: { capacity: number; sold: number; visibility?: string | null }[] | null,
  venueCapacity?: number | null,
): {
  soldRatio: number | null
  ticketsLeft: number | null
} {
  return publicCatalogTicketsLeft({
    tiers,
    venueCapacity,
  })
}

const EVENT_LIST_SELECT =
  "id, slug, title, description, date, ends_at, schedule_days, location, image_url, flyer_url, status, visibility, is_featured, featured_tier, featured_until, is_sponsored_by_tokepass, category_id, venues(name, location, capacity), ticket_tiers(price, capacity, sold, visibility, sale_starts_at, sale_ends_at, category, tier_type, layout_type), profiles!events_organizer_id_fkey(full_name)"
const EVENT_LIST_SELECT_MINIMAL =
  "id, slug, title, description, date, ends_at, schedule_days, location, image_url, flyer_url, status, visibility, is_featured, featured_tier, featured_until, is_sponsored_by_tokepass, category_id, venues(name, location, capacity), ticket_tiers(price, capacity, sold, visibility, category, tier_type, layout_type), profiles!events_organizer_id_fkey(full_name)"
const EVENT_LIST_SELECT_WITH_DELIVERY = `${EVENT_LIST_SELECT}, delivery_mode`

function isCatalogListRetryable(message: string): boolean {
  return (
    isMissingArtistSchema(message) ||
    /lineup|delivery_mode|sale_starts_at|sale_ends_at|schedule_days|schema cache|PGRST204|42703/i.test(
      message,
    )
  )
}

const EVENT_ARTISTS_EMBED =
  "event_artists(artist_id, artists(id, name, image_url, spotify_id))"
const EVENT_ARTISTS_EMBED_BASIC =
  "event_artists(artist_id, artists(id, name, image_url))"
const EVENT_ARTISTS_INNER_EMBED =
  "event_artists!inner(artist_id, artists(id, name, image_url, spotify_id))"
const EVENT_ARTISTS_INNER_EMBED_BASIC =
  "event_artists!inner(artist_id, artists(id, name, image_url))"
const EVENT_LIST_SELECT_WITH_LINEUP = `${EVENT_LIST_SELECT_WITH_DELIVERY}, lineup`
const EVENT_LIST_SELECT_WITH_LINEUP_LEGACY = `${EVENT_LIST_SELECT}, lineup`
const EVENT_LIST_SELECT_WITH_ARTISTS = `${EVENT_LIST_SELECT_WITH_LINEUP}, ${EVENT_ARTISTS_EMBED}`
const EVENT_LIST_SELECT_WITH_ARTISTS_BASIC = `${EVENT_LIST_SELECT_WITH_LINEUP}, ${EVENT_ARTISTS_EMBED_BASIC}`
const EVENT_LIST_SELECT_BY_ARTIST = `${EVENT_LIST_SELECT_WITH_LINEUP}, ${EVENT_ARTISTS_INNER_EMBED}`
const EVENT_LIST_SELECT_BY_ARTIST_BASIC = `${EVENT_LIST_SELECT_WITH_LINEUP}, ${EVENT_ARTISTS_INNER_EMBED_BASIC}`

function resolveCatalogLimit(limit?: number) {
  const requested = limit ?? CATALOG_PAGE_SIZE
  return Math.min(CATALOG_MAX_PAGE_SIZE, Math.max(1, Math.floor(requested)))
}

function resolveCatalogOffset(offset?: number) {
  return Math.max(0, Math.floor(offset ?? 0))
}

async function findEventIdsMatchingArtistName(
  needle: string,
): Promise<string[]> {
  if (!needle) return []
  try {
    const supabase = createPublicClient()
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
  options?: PublishedEventsOptions,
): Promise<CatalogEvent[]> {
  const supabase = createPublicClient()
  const needle = sanitizeCatalogSearch(search ?? "")
  const artistId = options?.artistId?.trim() || ""
  const organizerId = options?.organizerId?.trim() || ""
  const filterByArtist = Boolean(artistId) && isEventUuid(artistId)
  const filterByOrganizer = Boolean(organizerId) && isEventUuid(organizerId)
  const limit = resolveCatalogLimit(options?.limit)
  const offset = resolveCatalogOffset(options?.offset)
  const artistEventIds = needle ? await findEventIdsMatchingArtistName(needle) : []
  const orFilter = needle ? buildCatalogSearchOr(needle, artistEventIds) : null

  const selects = filterByArtist
    ? [
        EVENT_LIST_SELECT_BY_ARTIST,
        EVENT_LIST_SELECT_BY_ARTIST_BASIC,
        EVENT_LIST_SELECT_WITH_LINEUP,
        EVENT_LIST_SELECT_WITH_LINEUP_LEGACY,
        EVENT_LIST_SELECT,
        EVENT_LIST_SELECT_MINIMAL,
      ]
    : [
        EVENT_LIST_SELECT_WITH_ARTISTS,
        EVENT_LIST_SELECT_WITH_ARTISTS_BASIC,
        EVENT_LIST_SELECT_WITH_LINEUP,
        EVENT_LIST_SELECT_WITH_LINEUP_LEGACY,
        EVENT_LIST_SELECT,
        EVENT_LIST_SELECT_MINIMAL,
      ]

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
    if (filterByOrganizer) {
      query = query.eq("organizer_id", organizerId)
    }
    if (orFilter) {
      query = query.or(orFilter)
    }

    query = query.range(offset, offset + limit - 1)

    const { data, error } = await query

    if (!error) {
      const mapped = ((data ?? []) as unknown as EventListRow[])
        .map(mapEventListRow)
        .filter((event) => !isPastEvent(event))
      return sortCatalogForHome(mapped)
    }

    if (index < selects.length - 1 && isCatalogListRetryable(error.message)) {
      continue
    }

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

  return []
}

/** Eventos públicos vigentes asociados a un artista (event_artists). */
export async function getPublishedEventsByArtist(
  artistId: string,
): Promise<CatalogEvent[]> {
  if (!isEventUuid(artistId)) return []
  return getPublishedEvents(undefined, {
    artistId,
    limit: CATALOG_MAX_PAGE_SIZE,
  })
}

/** Próximos eventos públicos de una productora. */
export async function getPublishedEventsByOrganizer(
  organizerId: string,
): Promise<CatalogEvent[]> {
  if (!isEventUuid(organizerId)) return []
  const events = await getPublishedEvents(undefined, {
    organizerId,
    limit: CATALOG_MAX_PAGE_SIZE,
  })
  return events.filter((event) => !isPastEvent(event))
}

export async function getPublicOrganizerProfile(organizerId: string) {
  if (!isEventUuid(organizerId)) return null
  const supabase = createPublicClient()
  const card = await fetchPublicOrganizerCard(supabase, organizerId)
  if (!card) return null
  return { id: organizerId, ...card }
}

/** Top artistas con más eventos publicados vigentes. */
export async function getFeaturedDiscoveryArtists(
  limit = FEATURED_DISCOVERY_ARTISTS_LIMIT,
): Promise<FeaturedDiscoveryArtist[]> {
  try {
    const supabase = createPublicClient()
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
  const inventory = computeInventory(
    event.ticket_tiers,
    event.venues?.capacity,
  )
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
    isSponsoredByTokePass: Boolean(event.is_sponsored_by_tokepass),
    categoryId: event.category_id ?? null,
    deliveryMode: parseDeliveryMode(event.delivery_mode),
    artists: mapCatalogEventArtists({
      eventArtists: event.event_artists,
      lineupJson: event.lineup,
    }),
  }
}

/**
 * Eventos para el Hero / Destacados.
 * Incluye auspicio TokePass y boosts activos; Fisher–Yates + tope 6.
 * Un solo elegible también entra al carrusel.
 */
export async function getFeaturedEvents(options?: {
  province?: string | null
}): Promise<FeaturedRotationResult<CatalogEvent>> {
  const supabase = createPublicClient()
  const province = options?.province?.trim().toLowerCase() ?? ""
  const selects = [
    EVENT_LIST_SELECT_WITH_ARTISTS,
    EVENT_LIST_SELECT_WITH_ARTISTS_BASIC,
    EVENT_LIST_SELECT_WITH_LINEUP,
    EVENT_LIST_SELECT_WITH_LINEUP_LEGACY,
    EVENT_LIST_SELECT,
    EVENT_LIST_SELECT_MINIMAL,
  ]

  let data: unknown[] | null = null
  let error: { message?: string } | null = null

  for (const select of selects) {
    const result = await supabase
      .from("events")
      .select(select)
      .eq("status", "published")
      .eq("visibility", "public")
      .or("is_sponsored_by_tokepass.eq.true,is_featured.eq.true")

    if (!result.error) {
      data = result.data
      error = null
      break
    }

    error = result.error
    if (!isCatalogListRetryable(result.error.message)) break
  }

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
        `${event.venueLocation ?? ""} ${event.location ?? ""} ${event.venueName ?? ""}`.toLowerCase()
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
  const supabase = createPublicClient()
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

/**
 * Storefront de borrador para quien tiene el `preview_key`.
 * No usa el cache público ni revela la clave.
 */
export async function getEventDetailsForPreviewKey(
  slugOrId: string,
  previewKey: string,
): Promise<EventDetails | null> {
  const key = normalizePreviewKey(previewKey)
  if (!key) return null

  const admin = createAdminClient()
  const resolvedId = await resolveEventRecordId(admin, slugOrId)
  if (!resolvedId) return null

  const { data: matches, error } = await admin.rpc(
    "event_preview_key_matches",
    {
      p_event_id: resolvedId,
      p_key: key,
    },
  )
  if (error || !matches) return null

  return loadEventDetails(resolvedId, { mode: "preview_share" })
}

type EventReadClient =
  | PublicSupabase
  | Awaited<ReturnType<typeof createClient>>
  | ReturnType<typeof createAdminClient>

type EventLoadMode = "public" | "preview" | "preview_share"

async function resolveEventRecordId(
  supabase: EventReadClient,
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
  supabase: PublicSupabase | Awaited<ReturnType<typeof createClient>>,
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
  supabase: PublicSupabase | Awaited<ReturnType<typeof createClient>>,
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

const MISSING_TICKET_TYPE_COLUMN =
  /ticket_type|schema cache|PGRST204|42703/i

async function loadPublicTicketTierRows(
  supabase: EventReadClient,
  eventId: string,
): Promise<NonNullable<EventDetailRow["ticket_tiers"]>> {
  const withType = await supabase
    .from("ticket_tiers")
    .select(
      "id, name, price, list_price, capacity, sold, time_limit, bonus_reward, day_id, visibility, layout_type, seating_sector_id, capacity_per_unit, category, tier_type, ticket_type, bundle_items, bundle_type, description, highlight_badge, min_purchase_limit, max_purchase_limit, sale_starts_at, sale_ends_at",
    )
    .eq("event_id", eventId)
  if (!withType.error) {
    return (withType.data ?? []) as NonNullable<EventDetailRow["ticket_tiers"]>
  }
  if (!MISSING_TICKET_TYPE_COLUMN.test(withType.error.message)) {
    logger.error({
      context: "public-events",
      message: "load_ticket_tiers_failed",
      event_id: eventId,
      error: withType.error,
    })
    return []
  }
  const core = await supabase
    .from("ticket_tiers")
    .select(
      "id, name, price, list_price, capacity, sold, time_limit, bonus_reward, day_id, visibility, layout_type, seating_sector_id, capacity_per_unit, category, tier_type, bundle_items, bundle_type",
    )
    .eq("event_id", eventId)
  if (core.error) {
    logger.error({
      context: "public-events",
      message: "load_ticket_tiers_core_failed",
      event_id: eventId,
      error: core.error,
    })
    return []
  }
  return (core.data ?? []) as NonNullable<EventDetailRow["ticket_tiers"]>
}

async function loadEventCoreRow(
  supabase: EventReadClient,
  eventId: string,
  mode: EventLoadMode,
) {
  let query = supabase
    .from("events")
    .select(
      "id, slug, created_at, title, description, date, ends_at, location, image_url, flyer_url, status, visibility, schedule_days, organizer_id, category_id, is_sponsored_by_tokepass, max_free_tickets, max_tickets_per_user, platform_fee_percentage, platform_fixed_fee, promo_video_url, gallery_urls, accepts_mercado_pago, accepts_pos_payments, refund_policy, ticket_tiers(id, name, price, list_price, capacity, sold, time_limit, bonus_reward, day_id, visibility, layout_type, seating_sector_id, capacity_per_unit, category, tier_type, bundle_items, bundle_type)",
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

async function allowPublicStockRead(): Promise<boolean> {
  try {
    const ip = await getRequestIp()
    if (!isRateLimitableIp(ip)) return true
    return consumeNamedRateLimit("publicStockIp", ip)
  } catch {
    return true
  }
}

async function loadEventDetails(
  eventId: string,
  options: { mode: EventLoadMode },
): Promise<EventDetails | null> {
  if (options.mode === "public" && !(await allowPublicStockRead())) {
    return null
  }

  const supabase =
    options.mode === "preview"
      ? await createClient()
      : options.mode === "preview_share"
        ? createAdminClient()
        : createPublicClient()
  const resolvedId = await resolveEventRecordId(supabase, eventId)
  if (!resolvedId) return null

  const publicTierSelectWithType =
    "id, name, price, list_price, capacity, sold, time_limit, bonus_reward, day_id, visibility, layout_type, seating_sector_id, capacity_per_unit, category, tier_type, ticket_type, bundle_items, bundle_type, description, highlight_badge, min_purchase_limit, max_purchase_limit, sale_starts_at, sale_ends_at"
  const publicTierSelectCore =
    "id, name, price, list_price, capacity, sold, time_limit, bonus_reward, day_id, visibility, layout_type, seating_sector_id, capacity_per_unit, category, tier_type, bundle_items, bundle_type"
  const eventSelectWithPicker =
    `id, slug, created_at, title, description, date, ends_at, location, image_url, flyer_url, social_share_image_url, status, visibility, schedule_days, organizer_id, category_id, delivery_mode, is_sponsored_by_tokepass, max_free_tickets, max_tickets_per_user, platform_fee_percentage, platform_fixed_fee, meta_pixel_id, meta_pixel_enabled, tiktok_pixel_id, tiktok_pixel_enabled, ga4_measurement_id, ga4_enabled, promo_video_url, gallery_urls, restrictions, what_to_bring, lineup, default_ticket_tab, venue_id, has_seating_plan, venue_map, accepts_mercado_pago, accepts_pos_payments, refund_policy, venues(id, name, location, address, city, capacity, max_capacity, seating_background_url, seating_layout, venue_map, latitude, longitude), ticket_tiers(${publicTierSelectWithType}), profiles!events_organizer_id_fkey(full_name)`
  const eventSelectCore =
    `id, slug, created_at, title, description, date, ends_at, location, image_url, flyer_url, status, visibility, schedule_days, organizer_id, category_id, is_sponsored_by_tokepass, max_free_tickets, max_tickets_per_user, platform_fee_percentage, platform_fixed_fee, meta_pixel_id, meta_pixel_enabled, tiktok_pixel_id, tiktok_pixel_enabled, ga4_measurement_id, ga4_enabled, promo_video_url, gallery_urls, venue_id, has_seating_plan, venue_map, venues(id, name, location, address, city, capacity, max_capacity, seating_background_url, seating_layout, venue_map, latitude, longitude), ticket_tiers(${publicTierSelectCore}), profiles!events_organizer_id_fkey(full_name)`

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
    /default_ticket_tab|highlight_badge|min_purchase_limit|max_purchase_limit|ticket_tiers.*description|sale_starts_at|sale_ends_at|venue_map|lineup|max_capacity|has_seating_plan|social_share_image_url|delivery_mode|access_link|accepts_mercado_pago|accepts_pos_payments|refund_policy|restrictions|what_to_bring|ticket_type|schema cache|PGRST204|42703/i.test(
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
  const { data: scheduleRows } = await supabase
    .from("event_schedules")
    .select("id, title, start_time, end_time")
    .eq("event_id", resolvedId)
    .order("start_time", { ascending: true })
  const scheduleDays = scheduleDaysFromEvent({
    relational: scheduleRows,
    json: event.schedule_days,
  })
  const scheduleIds = scheduleDays.map((day) => day.id)
  const { data: liveStockRows } = await supabase.rpc("get_event_tier_live_stock", {
    p_event_id: resolvedId,
  })
  const liveAvailableByTier = new Map<string, { available: number; sold: number }>()
  for (const stock of liveStockRows ?? []) {
    liveAvailableByTier.set(stock.tier_id, {
      available: Number(stock.available) || 0,
      sold: Number(stock.sold) || 0,
    })
  }
  let ticketRows = Array.isArray(event.ticket_tiers) ? event.ticket_tiers : null
  if (!ticketRows || ticketRows.length === 0) {
    const fetched = await loadPublicTicketTierRows(supabase, resolvedId)
    if (fetched.length > 0) ticketRows = fetched
  }
  const tiers = [...(ticketRows ?? [])]
    .filter((tier) => tier.visibility !== "private")
    .map((tier) => ({
      ...tier,
      day_id: remapBoundDayId(tier.day_id, scheduleIds),
    }))
    .sort((a, b) => Number(a.price) - Number(b.price))
  logger.info({
    context: "public-events",
    message: "public_tickets_loaded",
    event_id: resolvedId,
    ticket_count: tiers.length,
    ticket_ids: tiers.map((tier) => tier.id),
    ticket_types: tiers.map((tier) => tier.ticket_type ?? null),
    day_ids: tiers.map((tier) => tier.day_id ?? null),
  })
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

  const isSponsoredByTokePass = Boolean(event.is_sponsored_by_tokepass)
  if (isSponsoredByTokePass) {
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
  const hasInteractiveMap = eventNeedsInteractiveCanvas(venueMap, tiers, {
    hasSeatingPlan: event.has_seating_plan,
  })

  return {
    id: event.id,
    slug: event.slug?.trim() || event.id,
    title: event.title,
    description: event.description,
    date: event.date,
    endsAt: event.ends_at ?? null,
    location: event.location,
    imageUrl: event.flyer_url ?? event.image_url,
    deliveryMode: parseDeliveryMode(event.delivery_mode),
    socialShareImageUrl: event.social_share_image_url?.trim() || null,
    status: event.status,
    visibility:
      event.visibility === "private" || event.visibility === "guest_list_only"
        ? event.visibility
        : "public",
    scheduleDays,
    serviceChargeRate,
    platformFixedFee,
    isSponsoredByTokePass,
    maxFreeTickets: Number(event.max_free_tickets ?? 100),
    maxTicketsPerUser: (() => {
      const raw = Number(event.max_tickets_per_user)
      if (!Number.isFinite(raw) || raw <= 0) return null
      return Math.floor(raw)
    })(),
    organizerId: event.organizer_id?.trim() || null,
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
          max_capacity:
            Number(event.venues.max_capacity) ||
            Number(event.venues.capacity) ||
            0,
          seating_background_url: event.venues.seating_background_url,
          latitude: event.venues.latitude,
          longitude: event.venues.longitude,
          seating_layout: seatingLayout,
          venue_map: venueMap,
        }
      : hasInteractiveVenueMap(venueMap)
        ? {
            id: event.venue_id ?? event.id,
            name: event.location ?? "Online",
            location: event.location ?? "Online",
            address: null,
            city: null,
            capacity: 0,
            max_capacity: 0,
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
        : seatingSummariesFromTicketTiers(ticketRows ?? []),
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
    tiers: (() => {
      const venueDeclaredCap = Math.max(
        Number(event.venues?.max_capacity) || 0,
        Number(event.venues?.capacity) || 0,
      )
      // Evento simple: no recortar SKU por el default venues.max_capacity = 1.
      const venueCap =
        event.has_seating_plan || venueDeclaredCap > 1 ? venueDeclaredCap : 0
      const stockTiers = tiers.map((tier) => {
        const live = liveAvailableByTier.get(tier.id)
        return {
          id: tier.id,
          capacity: Number(tier.capacity),
          sold: live?.sold ?? Number(tier.sold),
          day_id: tier.day_id,
          visibility: tier.visibility,
          tier_type:
            (tier as { tier_type?: TicketTier["tier_type"] }).tier_type ??
            "general",
          layout_type: tier.layout_type ?? null,
          capacity_per_unit: Number(tier.capacity_per_unit) || 1,
        }
      })
      return tiers.map((tier) => {
      const phases = phasesByTier.get(tier.id) ?? []
      const live = liveAvailableByTier.get(tier.id)
      const stockTier = stockTiers.find((row) => row.id === tier.id) ?? {
        id: tier.id,
        capacity: Number(tier.capacity),
        sold: live?.sold ?? Number(tier.sold),
        day_id: tier.day_id,
        visibility: tier.visibility,
        tier_type: "general" as const,
        layout_type: tier.layout_type ?? null,
        capacity_per_unit: Number(tier.capacity_per_unit) || 1,
      }
      const cappedAvailable = publicTierAvailable({
        tier: stockTier,
        tiers: stockTiers,
        venueCapacity: venueCap,
        skuAvailable: live?.available ?? Math.max(0, tier.capacity - tier.sold),
      })
      const priced = applyActivePhaseToTier(
        {
          price: Number(tier.price),
          available: cappedAvailable,
        },
        phases,
      )
      return {
        ...tier,
        sold: live?.sold ?? Number(tier.sold),
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
        ticket_type: resolveTicketCommerceType({
          ticket_type: (tier as { ticket_type?: TicketTier["ticket_type"] })
            .ticket_type,
          tier_type: (tier as { tier_type?: TicketTier["tier_type"] }).tier_type,
          layout_type: tier.layout_type,
          category: tier.category,
          name: tier.name,
          dayId: tier.day_id,
          bundle_type: (tier as { bundle_type?: TicketTier["bundle_type"] })
            .bundle_type,
          comboItems: parseBundleItems(
            (tier as { bundle_items?: unknown }).bundle_items,
          ),
        }),
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
        sale_starts_at:
          (tier as { sale_starts_at?: string | null }).sale_starts_at ?? null,
        sale_ends_at:
          (tier as { sale_ends_at?: string | null }).sale_ends_at ?? null,
      }
    })
    })(),
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
    isDraftPreview:
      options.mode === "preview_share" ||
      (options.mode === "preview" && isSandboxEventStatus(event.status)),
    acceptsMercadoPago: eventAcceptsMercadoPago(event.accepts_mercado_pago),
    acceptsPosPayments: eventAcceptsPosPayments(event.accepts_pos_payments),
    refundPolicy: parseEventRefundPolicy(event.refund_policy),
    restrictions: event.restrictions?.trim() || null,
    whatToBring: event.what_to_bring?.trim() || null,
  }
}

async function loadEventArtistsLineup(
  supabase: EventReadClient,
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
  supabase: PublicSupabase | Awaited<ReturnType<typeof createClient>>,
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
    status: (() => {
      const live = effectiveSeatingUnitStatus(unit.status, unit.reserved_until)
      if (
        live === "reserved" ||
        live === "sold" ||
        live === "blocked"
      ) {
        return live
      }
      return "available"
    })(),
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
  if (!(await allowPublicStockRead())) return []

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
  if (!(await allowPublicStockRead())) return []

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
      `${event.venueLocation ?? ""} ${event.location ?? ""} ${event.venueName ?? ""}`.toLowerCase()
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
  const supabase = createPublicClient()

  const { data, error } = await supabase
    .from("events")
    .select(
      "id, slug, title, description, date, ends_at, schedule_days, location, image_url, flyer_url, status, visibility, is_featured, featured_tier, featured_until, is_sponsored_by_tokepass, category_id, venues(name, location, capacity), ticket_tiers(price, capacity, sold, visibility, sale_starts_at, sale_ends_at, category, tier_type, layout_type), profiles!events_organizer_id_fkey(full_name)",
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

