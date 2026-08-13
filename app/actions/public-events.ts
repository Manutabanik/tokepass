"use server"

import { createClient } from "@/lib/supabase/server"
import { parseScheduleDays } from "@/lib/event-schedule"
import { sortCatalogForHome } from "@/lib/services/events-service"
import type { Event, TicketTier, Venue } from "@/types/database"
import type { ScheduleDay } from "@/types/events"
import type { EventSeatingUnit, VenueSeatingLayout } from "@/types/venues"
import type { EventPixelConfig } from "@/lib/analytics/pixels"

export type CatalogEvent = {
  id: string
  title: string
  description: string | null
  date: string
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
}

export type EventDetails = {
  id: string
  title: string
  description: string | null
  date: string
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
        | "capacity"
        | "seating_background_url"
        | "latitude"
        | "longitude"
      > & {
        seating_layout: VenueSeatingLayout
      })
    | null
  seatingUnits: EventSeatingUnit[]
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
    > & { available: number }
  >
  pixels: EventPixelConfig
}

type EventListRow = {
  id: string
  title: string
  description: string | null
  date: string
  location: string
  image_url: string | null
  flyer_url: string | null
  status: Event["status"]
  visibility: Event["visibility"] | null
  is_featured: boolean | null
  featured_tier: "silver" | "gold" | "platinum" | null
  featured_until: string | null
  is_sponsored_by_tokepass: boolean | null
  venues: { name: string; location: string } | null
  ticket_tiers: { price: number; capacity: number; sold: number }[] | null
  profiles: { full_name: string | null } | null
}

type EventDetailRow = {
  id: string
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
  is_sponsored_by_tokepass?: boolean | null
  max_free_tickets?: number | null
  platform_fee_percentage?: number | null
  platform_fixed_fee?: number | null
  meta_pixel_id?: string | null
  meta_pixel_enabled?: boolean | null
  tiktok_pixel_id?: string | null
  tiktok_pixel_enabled?: boolean | null
  ga4_measurement_id?: string | null
  ga4_enabled?: boolean | null
  venues:
    | (Pick<
        Venue,
        | "id"
        | "name"
        | "location"
        | "capacity"
        | "seating_background_url"
        | "latitude"
        | "longitude"
      > & {
        seating_layout?: unknown
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
    >
  > | null
  profiles?: { full_name: string | null } | null
}

function computeStartingPrice(tiers: { price: number }[] | null): number | null {
  if (!tiers?.length) return null
  return Math.min(...tiers.map((tier) => Number(tier.price)))
}

function computeInventory(tiers: { capacity: number; sold: number }[] | null): {
  soldRatio: number | null
  ticketsLeft: number | null
} {
  if (!tiers?.length) return { soldRatio: null, ticketsLeft: null }
  const capacity = tiers.reduce((sum, tier) => sum + Number(tier.capacity), 0)
  const sold = tiers.reduce((sum, tier) => sum + Number(tier.sold), 0)
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

export async function getPublishedEvents(
  search?: string,
): Promise<CatalogEvent[]> {
  const supabase = await createClient()

  let query = supabase
    .from("events")
    .select(
      "id, title, description, date, location, image_url, flyer_url, status, visibility, is_featured, featured_tier, featured_until, is_sponsored_by_tokepass, venues(name, location), ticket_tiers(price, capacity, sold), profiles!events_organizer_id_fkey(full_name)",
    )
    .eq("status", "published")
    .eq("visibility", "public")
    .gte("date", startOfTodayIso())
    .order("date", { ascending: true })

  if (search?.trim()) {
    const term = `%${search.trim()}%`
    query = query.or(
      `title.ilike.${term},location.ilike.${term},description.ilike.${term}`,
    )
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`No se pudieron cargar los eventos: ${error.message}`)
  }

  const mapped = ((data ?? []) as unknown as EventListRow[]).map((event) => {
    const inventory = computeInventory(event.ticket_tiers)
    const featuredUntil = event.featured_until
    const stillActive =
      Boolean(event.is_featured) &&
      Boolean(featuredUntil) &&
      new Date(String(featuredUntil)).getTime() > Date.now()

    return {
      id: event.id,
      title: event.title,
      description: event.description,
      date: event.date,
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
    }
  })

  return sortCatalogForHome(mapped)
}

export async function getEventDetails(
  eventId: string,
): Promise<EventDetails | null> {
  return loadEventDetails(eventId, { mode: "public" })
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

async function loadEventDetails(
  eventId: string,
  options: { mode: "public" | "preview" },
): Promise<EventDetails | null> {
  const supabase = await createClient()

  let query = supabase
    .from("events")
    .select(
      "id, title, description, date, location, image_url, flyer_url, status, visibility, schedule_days, organizer_id, is_sponsored_by_tokepass, max_free_tickets, platform_fee_percentage, platform_fixed_fee, meta_pixel_id, meta_pixel_enabled, tiktok_pixel_id, tiktok_pixel_enabled, ga4_measurement_id, ga4_enabled, venues(id, name, location, capacity, seating_background_url, seating_layout, latitude, longitude), ticket_tiers(id, name, price, capacity, sold, time_limit, bonus_reward, day_id, visibility, layout_type, seating_sector_id, capacity_per_unit), profiles!events_organizer_id_fkey(full_name)",
    )
    .eq("id", eventId)

  if (options.mode === "public") {
    query = query.eq("status", "published").neq("visibility", "guest_list_only")
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(`No se pudo cargar el evento: ${error.message}`)
  }

  if (!data) return null

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

    const isOwner = data.organizer_id === user.id
    const isSuperAdmin = profile?.role === "super_admin"
    if (!isOwner && !isSuperAdmin) return null
  }

  const { data: seatingRows, error: seatingError } = await supabase.rpc(
    "get_event_seating_availability",
    { p_event_id: eventId },
  )
  if (seatingError) {
    throw new Error(
      `No se pudo cargar la disponibilidad de ubicaciones: ${seatingError.message}`,
    )
  }

  const event = data as unknown as EventDetailRow
  const scheduleDays = parseScheduleDays(event.schedule_days)
  const tiers = [...(event.ticket_tiers ?? [])]
    .filter((tier) => tier.visibility !== "private")
    .sort((a, b) => Number(a.price) - Number(b.price))

  let serviceChargeRate = 0.08
  const { data: rate } = await supabase.rpc("get_event_service_charge_rate", {
    p_event_id: eventId,
  })
  if (typeof rate === "number" && Number.isFinite(rate)) {
    serviceChargeRate = rate
  } else if (rate != null && Number.isFinite(Number(rate))) {
    serviceChargeRate = Number(rate)
  }

  let platformFixedFee = Number(event.platform_fixed_fee ?? 0)
  const { data: fixedFeeRpc } = await supabase.rpc(
    "get_event_platform_fixed_fee",
    { p_event_id: eventId },
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

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    date: event.date,
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
    organizerName,
    organizerBio,
    organizerAvatarUrl,
    venue: event.venues
      ? {
          id: event.venues.id,
          name: event.venues.name,
          location: event.venues.location,
          capacity: event.venues.capacity,
          seating_background_url: event.venues.seating_background_url,
          latitude: event.venues.latitude,
          longitude: event.venues.longitude,
          seating_layout: parsePublicSeatingLayout(
            event.venues.seating_layout,
          ),
        }
      : null,
    seatingUnits: (seatingRows ?? []).map((unit) => ({
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
      layoutType: unit.layout_type,
      capacityPerUnit: Number(unit.capacity_per_unit),
      status: unit.status,
      reservedUntil: unit.reserved_until,
    })),
    tiers: tiers.map((tier) => ({
      ...tier,
      price: Number(tier.price),
      available: Math.max(0, tier.capacity - tier.sold),
    })),
    pixels: {
      metaPixelId: event.meta_pixel_id ?? null,
      metaPixelEnabled: Boolean(event.meta_pixel_enabled),
      tiktokPixelId: event.tiktok_pixel_id ?? null,
      tiktokPixelEnabled: Boolean(event.tiktok_pixel_enabled),
      ga4MeasurementId: event.ga4_measurement_id ?? null,
      ga4Enabled: Boolean(event.ga4_enabled),
    },
  }
}

function parsePublicSeatingLayout(raw: unknown): VenueSeatingLayout {
  if (!Array.isArray(raw)) return []
  return raw as VenueSeatingLayout
}
