"use server"

import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { isPlatformOwnerRole } from "@/lib/auth/platform-owner"
import { parseScheduleDays } from "@/lib/event-schedule"
import {
  parseDefaultTicketTab,
  parseTicketHighlightBadge,
  TICKET_DESCRIPTION_MAX,
} from "@/lib/checkout/ticket-picker"
import {
  inferBundleType,
  parseBundleType,
} from "@/lib/inventory/flexible-bundles"
import {
  inferInventoryTierType,
  layoutTypeForInventory,
  parseBundleItems,
  serializeBundleItems,
  ticketCategoryForInventory,
} from "@/lib/inventory/unified-inventory"
import { allInBreakdown } from "@/lib/pricing/all-in"
import {
  defaultEventFeeConfig,
  eventFeeRate,
  eventFixedFee,
  sumFreeTicketCapacity,
  type EventFeeConfig,
} from "@/lib/pricing/event-fees"
import {
  AGE_RESTRICTION_VALUES,
  MAX_EVENT_FLYER_BYTES,
  coerceDraftEventForm,
  draftEventSchema,
  publishEventSchema,
  type AgeRestriction,
  type EventFormValues,
} from "@/lib/validations/event-form"
import type { Database, Event, EventStatus, Json, Venue } from "@/types/database"
import { parseVenueMap, serializeVenueMap } from "@/types/venue-map"
import { composeVenuePlace } from "@/lib/venues/compose-location"
import { logger } from "@/lib/logger"
import {
  reconcileTicketTierIds,
  sanitizeTicketTiersForPersist,
} from "@/lib/events/sanitize-ticket-tiers"

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
  | "is_featured"
  | "featured_tier"
  | "featured_until"
> & {
  venues: Pick<Venue, "id" | "name" | "location"> | null
  ticketsSold: number
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

export async function getOrganizerEvents(): Promise<OrganizerEvent[]> {
  const { supabase, user } = await requireAuthenticatedUser()
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, description, date, location, image_url, status, venue_id, created_at, is_featured, featured_tier, featured_until, venues(id, name, location)",
    )
    .eq("organizer_id", user.id)
    .order("date", { ascending: true })

  if (error) {
    throw new Error(`No se pudieron cargar los eventos: ${error.message}`)
  }

  const events = data ?? []
  if (events.length === 0) return []

  const eventIds = events.map((event) => event.id)
  const { data: ticketRows, error: ticketsError } = await supabase
    .from("tickets")
    .select("event_id, status")
    .in("event_id", eventIds)
    .in("status", ["valid", "used", "scanned", "pending_payment"])

  if (ticketsError) {
    throw new Error(
      `No se pudo calcular ventas por evento: ${ticketsError.message}`,
    )
  }

  const soldByEvent = new Map<string, number>()
  for (const row of ticketRows ?? []) {
    soldByEvent.set(row.event_id, (soldByEvent.get(row.event_id) ?? 0) + 1)
  }

  return events.map((event) => ({
    ...event,
    ticketsSold: soldByEvent.get(event.id) ?? 0,
  }))
}

/** JSON contract expected by the atomic event + seating RPC wrappers. */
export type CreateCompleteEventRpcPayload = {
  title: string
  description: string
  date: string
  ends_at: string | null
  location: string
  image_url: string | null
  flyer_url: string | null
  visibility: "public" | "private" | "guest_list_only"
  category_id: string
  age_restriction: AgeRestriction
  schedule_days: Array<{
    id: string
    title: string
    start_time: string
    end_time: string
  }>
  venue_id?: string | null
  venue: {
    name: string
    location: string
    city?: string | null
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
    id?: string
    name: string
    price: number
    base_price: number
    platform_fee: number
    capacity: number
    time_limit: string | null
    bonus_reward: string | null
    zone_index: number
    day_id: string | null
    visibility: "public" | "private"
    layout_type: "general" | "table_combo" | "numbered_seat"
    seating_sector_id: string | null
    capacity_per_unit: number
    admit_count?: number
    total_capacity?: number
  }>
  rrpp_commission: number | null
  addons_enabled: boolean
}

function assertFreeTicketCapacityAllowed(
  tickets: EventFormValues["tickets"],
  maxFreeTickets: number,
  isSuperAdmin: boolean,
): string | null {
  if (isSuperAdmin) return null
  const freeCapacity = sumFreeTicketCapacity(tickets)
  if (freeCapacity <= maxFreeTickets) return null
  return `El cupo total de entradas gratuitas (${freeCapacity}) supera el máximo permitido (${maxFreeTickets}). Pedile a Tokepass que amplíe el límite o bajá la capacidad de los tiers a $0.`
}

async function loadEventFeeConfig(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
): Promise<EventFeeConfig> {
  const { data } = await supabase
    .from("events")
    .select(
      "platform_fee_percentage, platform_fixed_fee, max_free_tickets, is_sponsored_by_tokepass",
    )
    .eq("id", eventId)
    .maybeSingle()

  if (!data) return defaultEventFeeConfig()

  return {
    platformFeePercentage: Number(data.platform_fee_percentage ?? 8),
    platformFixedFee: Number(data.platform_fixed_fee ?? 0),
    maxFreeTickets: Number(data.max_free_tickets ?? 100),
    isSponsoredByTokepass: Boolean(data.is_sponsored_by_tokepass),
  }
}

function mapEventFormToRpcPayload(
  data: EventFormValues,
  feeConfig: EventFeeConfig,
  flyerUrl: string | null = null,
): CreateCompleteEventRpcPayload {
  const blueprintZones = data.venue.zones ?? []
  const includesMap = Boolean(data.venue.includesSeatingMap)
  const ticketCapacity = data.tickets.reduce(
    (sum, tier) => sum + (Number(tier.capacity) || 0),
    0,
  )
  const isGeneralAdmission =
    !includesMap && data.venue.zoneType === "general_admission"
  const capacity = isGeneralAdmission
    ? (data.venue.capacity ?? ticketCapacity)
    : includesMap
      ? Math.max(data.venue.capacity ?? 0, ticketCapacity, 1)
      : (data.venue.rows ?? 0) * (data.venue.seatsPerRow ?? 0)

  const zones =
    blueprintZones.length > 0
      ? blueprintZones.map((zone) => {
          if (zone.type === "reserved_seating" && !includesMap) {
            const rows = zone.rows ?? null
            const seatsPerRow = zone.seatsPerRow ?? null
            if (
              !rows ||
              !seatsPerRow ||
              rows * seatsPerRow !== zone.capacity
            ) {
              throw new Error(
                `La zona "${zone.name}" requiere filas y asientos por fila que coincidan con la capacidad (sin inventar √capacidad).`,
              )
            }
            return {
              name: zone.name,
              type: zone.type,
              capacity: zone.capacity,
              rows,
              seats_per_row: seatsPerRow,
            }
          }
          return {
            name: zone.name,
            type: zone.type,
            capacity: zone.capacity,
            rows: zone.rows ?? null,
            seats_per_row: zone.seatsPerRow ?? null,
          }
        })
      : [
          {
            name: isGeneralAdmission ? "General" : "Platea",
            type: includesMap ? "reserved_seating" : data.venue.zoneType,
            capacity: Math.max(capacity, 1),
            rows: isGeneralAdmission ? null : (data.venue.rows ?? null),
            seats_per_row: isGeneralAdmission
              ? null
              : (data.venue.seatsPerRow ?? null),
          },
        ]

  const venueCapacity =
    Math.max(
      zones.reduce((sum, zone) => sum + zone.capacity, 0),
      ticketCapacity,
      capacity,
      1,
    )

  const place = composeVenuePlace({
    street: data.venue.venueLocation,
    department: data.venue.department,
    province: data.venue.province,
    city: data.venue.venueCity,
  })
  const location = place.display || data.venue.venueName

  const scheduleDays = data.basics.isMultiDay
    ? data.basics.scheduleDays.map((day) => ({
        id: day.id,
        title: day.title.trim(),
        start_time: new Date(day.startTime).toISOString(),
        end_time: new Date(day.endTime).toISOString(),
      }))
    : []

  const anchorDate = data.basics.isMultiDay
    ? scheduleDays[0]?.start_time ?? new Date().toISOString()
    : new Date(data.basics.date).toISOString()

  const endsAt =
    !data.basics.isMultiDay && data.basics.endDate?.trim()
      ? new Date(data.basics.endDate).toISOString()
      : data.basics.isMultiDay
        ? scheduleDays[scheduleDays.length - 1]?.end_time ?? null
        : null

  return {
    title: data.basics.title,
    description: data.basics.description,
    date: anchorDate,
    ends_at: endsAt,
    location,
    image_url: flyerUrl,
    flyer_url: flyerUrl,
    visibility: data.basics.visibility,
    category_id: data.basics.categoryId?.trim() || "",
    age_restriction: AGE_RESTRICTION_VALUES.includes(data.basics.ageRestriction)
      ? data.basics.ageRestriction
      : "atp",
    schedule_days: scheduleDays,
    venue_id: data.venue.existingVenueId?.trim() || null,
    venue: {
      name: data.venue.venueName,
      location: place.street || location,
      city: place.city,
      capacity: venueCapacity,
    },
    zones,
    tiers: data.tickets.map((tier) => {
      // Form `price` is the public All-In price. Split uses event fee config.
      const breakdown = allInBreakdown(
        tier.price,
        eventFeeRate(feeConfig),
        eventFixedFee(feeConfig),
      )
      const dayIdRaw = tier.dayId?.trim()
      const dayId =
        !data.basics.isMultiDay ||
        !dayIdRaw ||
        dayIdRaw === "all"
          ? null
          : dayIdRaw
      const tierType = inferInventoryTierType({
        tierType: tier.tierType,
        layoutType: tier.layoutType,
        bundleItems: tier.bundleItems,
      })
      const layoutType = layoutTypeForInventory(tierType, tier.layoutType)
      return {
        ...(tier.id ? { id: tier.id } : {}),
        name: tier.name,
        price: breakdown.publicPrice,
        base_price: breakdown.basePrice,
        platform_fee: breakdown.platformFee,
        capacity: tier.capacity,
        time_limit: tier.timeLimit?.trim() ? tier.timeLimit : null,
        bonus_reward: tier.bonusReward?.trim() ? tier.bonusReward : null,
        zone_index: 0,
        day_id: dayId,
        visibility: tier.visibility ?? "public",
        layout_type: layoutType,
        seating_sector_id:
          layoutType === "general" ? null : tier.seatingSectorId ?? null,
        capacity_per_unit:
          layoutType === "general" ? 1 : tier.capacityPerUnit,
        admit_count:
          layoutType === "general"
            ? Math.max(1, Math.min(50, tier.admitCount ?? 1))
            : 1,
        total_capacity: tier.capacity,
      }
    }),
    rrpp_commission: null,
    addons_enabled: false,
  }
}

async function persistEventVenueFields(
  client: SupabaseClient<Database>,
  eventId: string,
  data: EventFormValues,
): Promise<string | null> {
  const { data: eventRow } = await client
    .from("events")
    .select("id, venue_id, organizer_id")
    .eq("id", eventId)
    .maybeSingle()

  const place = composeVenuePlace({
    street: data.venue.venueLocation,
    department: data.venue.department,
    province: data.venue.province,
    city: data.venue.venueCity,
  })
  const province = data.venue.province?.trim() || null
  const department = data.venue.department?.trim() || null
  const location = place.display || data.venue.venueName
  const venueMap = serializeVenueMap(parseVenueMap(data.venue.venueMap)) as unknown as Json
  const seatingLayout = (data.venue.seatingLayout ?? []) as unknown as Json
  const now = new Date().toISOString()

  let venueId =
    data.venue.existingVenueId?.trim() || eventRow?.venue_id || null

  const venuePatch = {
    name: data.venue.venueName.trim() || undefined,
    location: place.street || location,
    address: place.street || location,
    city: place.city,
    latitude: data.venue.latitude ?? null,
    longitude: data.venue.longitude ?? null,
    venue_map: venueMap,
    seating_layout: seatingLayout,
    seating_background_url: data.venue.seatingBackgroundUrl ?? null,
    updated_at: now,
  }

  if (venueId) {
    const { data: owned } = await client
      .from("venues")
      .select("id")
      .eq("id", venueId)
      .maybeSingle()
    if (!owned) venueId = eventRow?.venue_id ?? null
  }

  if (venueId) {
    const withMax = {
      ...venuePatch,
      capacity: Math.max(1, Number(data.venue.capacity) || 1),
      max_capacity: Math.max(1, Number(data.venue.capacity) || 1),
    }
    const updated = await client
      .from("venues")
      .update(withMax as never)
      .eq("id", venueId)
    if (
      updated.error &&
      /max_capacity|schema cache|PGRST204|42703/i.test(updated.error.message)
    ) {
      await client.from("venues").update(venuePatch as never).eq("id", venueId)
    }
  } else if (data.venue.venueName.trim() && eventRow?.organizer_id) {
    const insertPayload = {
      organizer_id: eventRow.organizer_id,
      name: data.venue.venueName.trim(),
      location: place.street || location,
      address: place.street || location,
      city: place.city,
      latitude: data.venue.latitude ?? null,
      longitude: data.venue.longitude ?? null,
      capacity: Math.max(1, Number(data.venue.capacity) || 1),
      max_capacity: Math.max(1, Number(data.venue.capacity) || 1),
      venue_map: venueMap,
      seating_layout: seatingLayout,
      seating_background_url: data.venue.seatingBackgroundUrl ?? null,
    }
    let created = await client
      .from("venues")
      .insert(insertPayload as never)
      .select("id")
      .maybeSingle()
    if (
      created.error &&
      /max_capacity|schema cache|PGRST204|42703/i.test(created.error.message)
    ) {
      const { max_capacity: _max, ...withoutMax } = insertPayload
      created = await client
        .from("venues")
        .insert(withoutMax as never)
        .select("id")
        .maybeSingle()
    }
    venueId = created.data?.id ?? null
  }

  const eventCore = {
    venue_id: venueId,
    location,
    venue_map: venueMap,
    updated_at: now,
  }
  const defaultTicketTab = parseDefaultTicketTab(data.ticketsDefaultTab)
  const withPicker = await client
    .from("events")
    .update({
      ...eventCore,
      province,
      department,
      default_ticket_tab: defaultTicketTab,
    } as never)
    .eq("id", eventId)

  if (
    withPicker.error &&
    /default_ticket_tab|schema cache|PGRST204|42703/i.test(
      withPicker.error.message,
    )
  ) {
    const withPlace = await client
      .from("events")
      .update({
        ...eventCore,
        province,
        department,
      } as never)
      .eq("id", eventId)
    if (
      withPlace.error &&
      /province|department|schema cache|PGRST204|42703/i.test(
        withPlace.error.message,
      )
    ) {
      await client.from("events").update(eventCore as never).eq("id", eventId)
    }
  } else if (
    withPicker.error &&
    /province|department|schema cache|PGRST204|42703/i.test(
      withPicker.error.message,
    )
  ) {
    await client.from("events").update(eventCore as never).eq("id", eventId)
  }

  return venueId
}

async function materializeEventSeatingUnits(
  client: SupabaseClient<Database>,
  eventId: string,
): Promise<string | null> {
  const { error } = await client.rpc("materialize_event_seating_units", {
    p_event_id: eventId,
  })
  if (!error) return null
  logger.error({
    context: "materialize_event_seating_units",
    event_id: eventId,
    error,
  })
  return error.message.replace(/^materialize_event_seating_units:\s*/i, "")
}

async function syncTierAdmitCounts(
  eventId: string,
  tickets: EventFormValues["tickets"],
) {
  const admin = createAdminClient()
  const { data: tiers } = await admin
    .from("ticket_tiers")
    .select("id, name")
    .eq("event_id", eventId)

  if (!tiers?.length) return

  for (const tier of tiers) {
    const match =
      tickets.find((t) => t.id && t.id === tier.id) ??
      tickets.find((t) => t.name.trim() === tier.name.trim())
    if (!match) continue
    const tierType = inferInventoryTierType({
      tierType: match.tierType,
      layoutType: match.layoutType,
      bundleItems: match.bundleItems,
    })
    const admit =
      match.layoutType === "general"
        ? Math.max(1, Math.min(50, match.admitCount ?? 1))
        : 1
    const resolvedBundle = (match.bundleItems ?? [])
      .map((item) => {
        const target =
          tickets.find((candidate) => candidate.id === item.tierId) ??
          tickets.find((candidate) => candidate.name.trim() === item.tierId)
        return {
          tierId: target?.id ?? item.tierId,
          quantity: item.quantity,
        }
      })
      .filter((item) => item.tierId.length > 0)
    const patch = {
      admit_count: admit,
      tier_type: tierType,
      category: ticketCategoryForInventory(tierType),
      list_price:
        tierType === "bundle" && match.listPrice != null
          ? match.listPrice
          : null,
      bundle_items: serializeBundleItems(resolvedBundle) as unknown as Json,
      bundle_type:
        tierType === "bundle"
          ? inferBundleType({
              bundleType: match.bundleType,
              dayId: match.dayId,
              items: resolvedBundle,
            })
          : null,
      updated_at: new Date().toISOString(),
    }
    const description =
      match.description?.trim().slice(0, TICKET_DESCRIPTION_MAX) || null
    const highlightBadge =
      match.highlightBadge === "bestseller" ? "bestseller" : null
    const withCopy = await admin
      .from("ticket_tiers")
      .update({
        ...patch,
        description,
        highlight_badge: highlightBadge,
      })
      .eq("id", tier.id)
    if (
      withCopy.error &&
      /description|highlight_badge|schema cache|PGRST204|42703/i.test(
        withCopy.error.message,
      )
    ) {
      await admin.from("ticket_tiers").update(patch).eq("id", tier.id)
    }
  }
}

function isMissingPhasesTable(message: string) {
  return /ticket_tier_phases|schema cache|PGRST204|42703/i.test(message)
}

async function syncTicketTierPhases(
  eventId: string,
  tickets: EventFormValues["tickets"],
) {
  const admin = createAdminClient()
  const { data: tiers, error: tiersError } = await admin
    .from("ticket_tiers")
    .select("id, name")
    .eq("event_id", eventId)

  if (tiersError || !tiers?.length) return

  const { data: existing, error: existingError } = await admin
    .from("ticket_tier_phases")
    .select("id, tier_id, sold")
    .in(
      "tier_id",
      tiers.map((tier) => tier.id),
    )

  if (existingError) {
    if (isMissingPhasesTable(existingError.message)) return
    return
  }

  const keepIds = new Set<string>()

  for (const tier of tiers) {
    const match =
      tickets.find((item) => item.id && item.id === tier.id) ??
      tickets.find((item) => item.name.trim() === tier.name.trim())
    const phases = match?.phases ?? []
    const parentCapacity = Math.max(1, Number(match?.capacity) || 1)

    for (const [index, phase] of phases.entries()) {
      const name = phase.name.trim() || `Lote ${index + 1}`
      const price = Math.max(0, Number(phase.price) || 0)
      const limit = Math.min(
        parentCapacity,
        Math.max(1, Number(phase.capacityLimit) || 1),
      )
      const status =
        index === 0
          ? ("active" as const)
          : phase.status === "sold_out"
            ? ("sold_out" as const)
            : ("scheduled" as const)
      const patch = {
        name,
        price,
        capacity_limit: limit,
        start_time: phase.startTime || null,
        end_time: phase.endTime || null,
        status,
      }

      if (phase.id) {
        const { error } = await admin
          .from("ticket_tier_phases")
          .update(patch)
          .eq("id", phase.id)
          .eq("tier_id", tier.id)
        if (!error) keepIds.add(phase.id)
        continue
      }

      const { data: created, error } = await admin
        .from("ticket_tier_phases")
        .insert({ ...patch, tier_id: tier.id })
        .select("id")
        .maybeSingle()
      if (!error && created?.id) keepIds.add(created.id)
    }
  }

  const stale = (existing ?? []).filter((row) => {
    if (keepIds.has(row.id)) return false
    return Number(row.sold) === 0
  })
  if (stale.length > 0) {
    await admin
      .from("ticket_tier_phases")
      .delete()
      .in(
        "id",
        stale.map((row) => row.id),
      )
  }
}

function parseAgeRestriction(raw: unknown): AgeRestriction {
  const value = String(raw ?? "").trim()
  if ((AGE_RESTRICTION_VALUES as readonly string[]).includes(value)) {
    return value as AgeRestriction
  }
  return "atp"
}

const ALLOWED_FLYER_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
])
const MAX_FLYER_BYTES = MAX_EVENT_FLYER_BYTES

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
  | { success: true; eventId: string; venueId: string | null }
  | { success: false; error: string }

export type EditableEventData = {
  id: string
  organizerId: string
  title: string
  flyerUrl: string | null
  values: EventFormValues
  zoneTierPricing: Array<{
    id: string
    sectorKey: string
    sectorName: string
    ticketTierId: string
    ticketTierName: string
    price: number
    tableNumberStart: number | null
    tableNumberEnd: number | null
  }>
}

function toLocalDateTimeInput(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(date)
    .replace(" ", "T")
}

function parseVenueZones(raw: unknown): EventFormValues["venue"]["zones"] {
  if (!Array.isArray(raw)) return undefined
  const zones = raw.flatMap((item) => {
    const zone = item as Record<string, unknown>
    const name = String(zone.name ?? "").trim()
    const capacity = Number(zone.capacity ?? 0)
    if (!name || !Number.isFinite(capacity) || capacity < 1) return []
    const reserved = zone.type === "reserved_seating"
    return [
      {
        name,
        type: reserved
          ? ("reserved_seating" as const)
          : ("general_admission" as const),
        capacity,
        rows: reserved ? Number(zone.rows ?? 0) || null : null,
        seatsPerRow: reserved
          ? Number(zone.seatsPerRow ?? zone.seats_per_row ?? 0) || null
          : null,
      },
    ]
  })
  return zones.length > 0 ? zones : undefined
}

export async function getEventForEditing(
  eventId: string,
): Promise<EditableEventData | null> {
  if (!eventId?.trim()) return null

  try {
    const { supabase, user } = await requireAuthenticatedUser()
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, organizer_approval_status")
      .eq("id", user.id)
      .maybeSingle()

    const eventSelectWithPicker =
      "id, organizer_id, title, description, date, ends_at, location, image_url, flyer_url, venue_id, visibility, schedule_days, category_id, age_restriction, province, department, venue_map, default_ticket_tab"
    const eventSelectWithPlace =
      "id, organizer_id, title, description, date, ends_at, location, image_url, flyer_url, venue_id, visibility, schedule_days, category_id, age_restriction, province, department, venue_map"
    const eventSelectCore =
      "id, organizer_id, title, description, date, ends_at, location, image_url, flyer_url, venue_id, visibility, schedule_days, category_id, age_restriction, venue_map"

    let eventQuery = await supabase
      .from("events")
      .select(eventSelectWithPicker)
      .eq("id", eventId)
      .maybeSingle()

    if (
      eventQuery.error &&
      /default_ticket_tab|schema cache|PGRST204|42703/i.test(
        eventQuery.error.message,
      )
    ) {
      eventQuery = await supabase
        .from("events")
        .select(eventSelectWithPlace)
        .eq("id", eventId)
        .maybeSingle()
    }

    if (
      eventQuery.error &&
      /province|department|schema cache|PGRST204|42703/i.test(
        eventQuery.error.message,
      )
    ) {
      eventQuery = await supabase
        .from("events")
        .select(eventSelectCore)
        .eq("id", eventId)
        .maybeSingle()
    }

    const { data: event, error: eventError } = eventQuery

    if (eventError || !event) return null
    if (event.organizer_id !== user.id && profile?.role !== "super_admin") {
      return null
    }

    const ticketSelectWithCopy =
      "id, name, price, base_price, platform_fee, capacity, sold, time_limit, bonus_reward, day_id, visibility, layout_type, seating_sector_id, capacity_per_unit, admit_count, category, list_price, tier_type, bundle_items, bundle_type, description, highlight_badge"
    const ticketSelectCore =
      "id, name, price, base_price, platform_fee, capacity, sold, time_limit, bonus_reward, day_id, visibility, layout_type, seating_sector_id, capacity_per_unit, admit_count, category, list_price, tier_type, bundle_items, bundle_type"

    const [{ data: tiers, error: tiersError }, venueResult] = await Promise.all([
      (async () => {
        const rich = await supabase
          .from("ticket_tiers")
          .select(ticketSelectWithCopy)
          .eq("event_id", eventId)
          .order("created_at")
        if (
          rich.error &&
          /description|highlight_badge|schema cache|PGRST204|42703/i.test(
            rich.error.message,
          )
        ) {
          return supabase
            .from("ticket_tiers")
            .select(ticketSelectCore)
            .eq("event_id", eventId)
            .order("created_at")
        }
        return rich
      })(),
      event.venue_id
        ? supabase
            .from("venues")
            .select(
              "id, name, location, address, city, capacity, zone_blueprint, latitude, longitude, seating_background_url, seating_layout, venue_map",
            )
            .eq("id", event.venue_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

    if (tiersError || !tiers?.length) return null

    let venue = venueResult.data
    if (event.venue_id && (venueResult.error || !venue)) {
      const fallback = await supabase
        .from("venues")
        .select("id, name, location, address, city, capacity, zone_blueprint, seating_layout, venue_map")
        .eq("id", event.venue_id)
        .maybeSingle()
      venue = fallback.data
        ? {
            ...fallback.data,
            latitude: null,
            longitude: null,
            seating_background_url: null,
            seating_layout: fallback.data.seating_layout ?? null,
          }
        : null
    }

    const venueZones = parseVenueZones(venue?.zone_blueprint)
    const firstZone = venueZones?.[0]
    const venueCapacity = Number(venue?.capacity ?? 0) || 1
    const scheduleDays = parseScheduleDays(event.schedule_days).map((day) => ({
      id: day.id,
      title: day.title,
      startTime: toLocalDateTimeInput(day.start_time),
      endTime: toLocalDateTimeInput(day.end_time),
    }))
    const isMultiDay = scheduleDays.length > 1
    const visibility =
      event.visibility === "private" || event.visibility === "guest_list_only"
        ? event.visibility
        : "public"

    const latitude =
      venue?.latitude == null || !Number.isFinite(Number(venue.latitude))
        ? null
        : Number(venue.latitude)
    const longitude =
      venue?.longitude == null || !Number.isFinite(Number(venue.longitude))
        ? null
        : Number(venue.longitude)

    const ticketValues: EventFormValues["tickets"] = tiers.map((tier) => ({
      id: tier.id,
      name: String(tier.name ?? "Entrada"),
      price: Number(tier.price) || 0,
      capacity: Math.max(1, Number(tier.capacity) || 1),
      sold: Math.max(0, Number(tier.sold) || 0),
      timeLimit: tier.time_limit ?? "",
      bonusReward: tier.bonus_reward ?? "",
      description:
        typeof (tier as { description?: string | null }).description === "string"
          ? String((tier as { description?: string | null }).description).slice(
              0,
              TICKET_DESCRIPTION_MAX,
            )
          : "",
      highlightBadge: parseTicketHighlightBadge(
        (tier as { highlight_badge?: string | null }).highlight_badge,
      ),
      dayId: tier.day_id ?? null,
      visibility:
        tier.visibility === "private"
          ? ("private" as const)
          : ("public" as const),
      layoutType:
        tier.layout_type === "table_combo" ||
        tier.layout_type === "numbered_seat"
          ? tier.layout_type
          : ("general" as const),
      seatingSectorId: tier.seating_sector_id ?? null,
      capacityPerUnit: Math.max(1, Number(tier.capacity_per_unit ?? 1) || 1),
      admitCount: Math.max(
        1,
        Number((tier as { admit_count?: number }).admit_count ?? 1) || 1,
      ),
      tierType: inferInventoryTierType({
        tierType: (tier as { tier_type?: string }).tier_type,
        layoutType: tier.layout_type,
        category: (tier as { category?: string }).category,
        bundleItems: parseBundleItems(
          (tier as { bundle_items?: unknown }).bundle_items,
        ),
      }),
      listPrice:
        (tier as { list_price?: number | null }).list_price == null
          ? null
          : Number((tier as { list_price?: number | null }).list_price),
      bundleItems: parseBundleItems(
        (tier as { bundle_items?: unknown }).bundle_items,
      ),
      bundleType: parseBundleType(
        (tier as { bundle_type?: string | null }).bundle_type,
      ),
      phases: [],
    }))

    const tierIds = tiers.map((tier) => tier.id)
    if (tierIds.length > 0) {
      const phasesQuery = await supabase
        .from("ticket_tier_phases")
        .select(
          "id, tier_id, name, price, capacity_limit, start_time, end_time, status, sold, created_at",
        )
        .in("tier_id", tierIds)
        .order("created_at")
      if (!phasesQuery.error && phasesQuery.data) {
        const byTier = new Map<string, EventFormValues["tickets"][number]["phases"]>()
        for (const row of phasesQuery.data) {
          const list = byTier.get(row.tier_id) ?? []
          list.push({
            id: row.id,
            name: String(row.name ?? "Lote"),
            price: Number(row.price) || 0,
            capacityLimit: Math.max(1, Number(row.capacity_limit) || 1),
            startTime: row.start_time,
            endTime: row.end_time,
            status: row.status,
            sold: Math.max(0, Number(row.sold) || 0),
          })
          byTier.set(row.tier_id, list)
        }
        for (const ticket of ticketValues) {
          if (ticket.id) {
            ticket.phases = byTier.get(ticket.id) ?? []
          }
        }
      }
    }

    const { data: pricingRows } = await supabase
      .from("zone_tier_pricing")
      .select(
        "id, sector_key, ticket_tier_id, price, table_number_start, table_number_end",
      )
      .eq("event_id", eventId)

    const tierNameById = new Map(
      tiers.map((tier) => [tier.id, String(tier.name ?? "Entrada")]),
    )
    const sectorNameById = new Map<string, string>()
    for (const tier of ticketValues) {
      if (tier.seatingSectorId) {
        sectorNameById.set(tier.seatingSectorId, tier.name)
      }
    }
    if (venue?.seating_layout && Array.isArray(venue.seating_layout)) {
      for (const sector of venue.seating_layout as Array<
        Record<string, unknown>
      >) {
        const id = String(sector.id ?? "")
        const name = String(sector.sector_name ?? sector.name ?? "")
        if (id && name) sectorNameById.set(id, name)
      }
    }

    return {
      id: event.id,
      organizerId: event.organizer_id,
      title: event.title,
      flyerUrl: event.flyer_url ?? event.image_url,
      values: {
        basics: {
          title: event.title,
          date: toLocalDateTimeInput(event.date),
          endDate: event.ends_at ? toLocalDateTimeInput(event.ends_at) : "",
          description: event.description ?? "",
          flyerName: event.flyer_url || event.image_url ? "Flyer actual" : null,
          visibility,
          isMultiDay,
          scheduleDays,
          categoryId: event.category_id ?? "",
          ageRestriction: parseAgeRestriction(event.age_restriction),
        },
        venue: {
          mode: event.venue_id ? "existing" : "new",
          existingVenueId: event.venue_id,
          zoneType: firstZone?.type ?? "general_admission",
          venueName: venue?.name ?? event.location,
          venueLocation: composeVenuePlace({
            street:
              (typeof venue?.address === "string" && venue.address.trim()) ||
              venue?.location ||
              event.location,
            city: venue?.city,
            department: (event as { department?: string | null }).department,
            province: (event as { province?: string | null }).province,
          }).street,
          venueCity:
            composeVenuePlace({
              street: venue?.location,
              city: venue?.city,
              department: (event as { department?: string | null }).department,
              province: (event as { province?: string | null }).province,
            }).city ??
            [(event as { department?: string | null }).department, (event as { province?: string | null }).province].filter(Boolean).join(", "),
          province:
            (event as { province?: string | null }).province ??
            (typeof venue?.city === "string" && venue.city.includes(",")
              ? venue.city.split(",").slice(1).join(",").trim()
              : ""),
          department: (event as { department?: string | null }).department ?? (typeof venue?.city === "string"
            ? venue.city.split(",")[0]?.trim()
            : ""),
          provinceId: null,
          departmentId: null,
          capacity: firstZone?.capacity ?? venueCapacity,
          rows: firstZone?.rows ?? undefined,
          seatsPerRow: firstZone?.seatsPerRow ?? undefined,
          latitude,
          longitude,
          seatingBackgroundUrl:
            typeof venue?.seating_background_url === "string"
              ? venue.seating_background_url
              : null,
          venueMap: event.venue_map ?? venue?.venue_map ?? null,
          seatingLayout: venue?.seating_layout,
          includesSeatingMap: Boolean(
            firstZone?.type === "reserved_seating" ||
              (Array.isArray(venue?.seating_layout) &&
                venue.seating_layout.length > 0) ||
              (venue?.venue_map &&
                typeof venue.venue_map === "object" &&
                ((Array.isArray(
                  (venue.venue_map as { elements?: unknown[] }).elements,
                ) &&
                  ((venue.venue_map as { elements?: unknown[] }).elements
                    ?.length ?? 0) > 0) ||
                  (Array.isArray(
                    (venue.venue_map as { zones?: unknown[] }).zones,
                  ) &&
                    ((venue.venue_map as { zones?: unknown[] }).zones?.length ??
                      0) > 0))),
          ),
          saveVenueForReuse: false,
          zones: venueZones,
        },
        tickets: ticketValues,
        ticketsDefaultTab: parseDefaultTicketTab(
          (event as { default_ticket_tab?: string | null }).default_ticket_tab,
        ),
      },
      zoneTierPricing: (pricingRows ?? []).map((row) => ({
        id: row.id,
        sectorKey: row.sector_key,
        sectorName: sectorNameById.get(row.sector_key) ?? row.sector_key,
        ticketTierId: row.ticket_tier_id,
        ticketTierName: tierNameById.get(row.ticket_tier_id) ?? "Entrada",
        price: Number(row.price) || 0,
        tableNumberStart: row.table_number_start,
        tableNumberEnd: row.table_number_end,
      })),
    }
  } catch (error) {
    console.error("[getEventForEditing]", eventId, error)
    return null
  }
}

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

  const draftMode = formData.get("draftMode") === "1"
  const parsed = draftMode
    ? draftEventSchema.safeParse(parsedJson)
    : publishEventSchema.safeParse(parsedJson)

  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        "La configuración del evento no es válida.",
    }
  }

  const formValues = {
    ...coerceDraftEventForm(parsed.data),
  }
  formValues.tickets = sanitizeTicketTiersForPersist(formValues.tickets, {
    mode: "create",
  })

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
    .select("role, organizer_approval_status")
    .eq("id", userId)
    .maybeSingle()

  const actorRole = actorProfile?.role ?? null
  const actorCanCreate =
    actorRole === "super_admin" ||
    (actorRole === "admin" &&
      actorProfile?.organizer_approval_status === "approved")
  if (!actorCanCreate) {
    return {
      success: false,
      error: "Tu cuenta de organizador no está habilitada para crear eventos.",
    }
  }

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
      .select("id, role, organizer_approval_status")
      .eq("id", targetOrganizerId)
      .maybeSingle()

    if (
      targetError ||
      !targetProfile ||
      targetProfile.role !== "admin" ||
      targetProfile.organizer_approval_status !== "approved"
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

  let rpcPayload: CreateCompleteEventRpcPayload
  try {
    const feeConfig = defaultEventFeeConfig()
    if (!draftMode) {
      const freeCapError = assertFreeTicketCapacityAllowed(
        formValues.tickets,
        feeConfig.maxFreeTickets,
        actorRole === "super_admin",
      )
      if (freeCapError) {
        return { success: false, error: freeCapError }
      }
    }
    rpcPayload = mapEventFormToRpcPayload(formValues, feeConfig, flyerUrl)
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo armar el payload del evento.",
    }
  }

  const { data: eventId, error } = await rpcClient.rpc(
    "create_complete_event_with_seating_tx",
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
      error: error.message.replace(
        /^create_complete_event_with_seating_tx:\s*/i,
        "",
      ),
    }
  }

  if (!eventId) {
    return {
      success: false,
      error: "La base de datos no devolvió el ID del evento.",
    }
  }

  await syncTierAdmitCounts(String(eventId), formValues.tickets)
  await syncTicketTierPhases(String(eventId), formValues.tickets)
  const venueId = await persistEventVenueFields(
    rpcClient,
    String(eventId),
    formValues,
  )

  if (!draftMode) {
    const { data: created } = await rpcClient
      .from("events")
      .select("status")
      .eq("id", eventId)
      .maybeSingle()
    if (created?.status === "published" || created?.status === "paused") {
      const materializeError = await materializeEventSeatingUnits(
        rpcClient,
        String(eventId),
      )
      if (materializeError) {
        return { success: false, error: materializeError }
      }
    }
    revalidatePath("/admin")
    revalidatePath("/admin/events")
    revalidatePath(`/admin/events/${eventId}`)
    revalidatePath("/events")
    revalidatePath("/")
    revalidatePath("/superadmin")
    revalidatePath("/super-admin")
    revalidatePath("/superadmin/events")
  }

  return { success: true, eventId, venueId }
}

/**
 * Updates event identity, venue and ticket tiers through one database
 * transaction. Tier prices in the form are public All-In values.
 */
export async function updateCompleteEvent(
  formData: FormData,
): Promise<CreateCompleteEventResult> {
  const eventId = String(formData.get("eventId") ?? "").trim()
  const rawPayload = formData.get("payload")

  if (!eventId || typeof rawPayload !== "string") {
    return { success: false, error: "Evento o payload inválido." }
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

  const draftMode = formData.get("draftMode") === "1"
  const parsed = draftMode
    ? draftEventSchema.safeParse(parsedJson)
    : publishEventSchema.safeParse(parsedJson)
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        "La configuración del evento no es válida.",
    }
  }

  const formValues = {
    ...coerceDraftEventForm(parsed.data),
  }

  let supabase: Awaited<ReturnType<typeof createClient>>
  let userId: string
  try {
    const session = await requireAuthenticatedUser()
    supabase = session.supabase
    userId = session.user.id
  } catch {
    return { success: false, error: "Debes iniciar sesión para editar." }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", userId)
    .maybeSingle()

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, organizer_id, image_url, flyer_url")
    .eq("id", eventId)
    .maybeSingle()

  if (eventError || !event) {
    return { success: false, error: "Evento no encontrado." }
  }

  const isSuperAdmin = profile?.role === "super_admin"
  const isApprovedOrganizer =
    profile?.role === "admin" &&
    profile.organizer_approval_status === "approved"
  if (!isSuperAdmin && !isApprovedOrganizer) {
    return {
      success: false,
      error: "Tu cuenta de organizador no está habilitada para editar eventos.",
    }
  }

  if (event.organizer_id !== userId && !isSuperAdmin) {
    return { success: false, error: "No tenés permiso para editar este evento." }
  }

  const mutationClient =
    event.organizer_id !== userId ? createAdminClient() : supabase

  const { data: existingTiers, error: existingTiersError } =
    await mutationClient
      .from("ticket_tiers")
      .select("id")
      .eq("event_id", eventId)

  if (existingTiersError) {
    return { success: false, error: existingTiersError.message }
  }

  formValues.tickets = reconcileTicketTierIds(
    formValues.tickets,
    (existingTiers ?? []).map((row) => row.id),
  )

  const flyerEntry = formData.get("flyer")
  let uploadedFlyerUrl: string | null = null

  if (flyerEntry instanceof File && flyerEntry.size > 0) {
    const uploaded = await uploadEventFlyer(
      mutationClient,
      event.organizer_id,
      flyerEntry,
    )
    if ("error" in uploaded) return { success: false, error: uploaded.error }
    uploadedFlyerUrl = uploaded.url
  }

  let rpcPayload: CreateCompleteEventRpcPayload
  try {
    const feeConfig = await loadEventFeeConfig(supabase, eventId)
    if (!draftMode) {
      const freeCapError = assertFreeTicketCapacityAllowed(
        formValues.tickets,
        feeConfig.maxFreeTickets,
        isSuperAdmin,
      )
      if (freeCapError) {
        return { success: false, error: freeCapError }
      }
    }
    rpcPayload = mapEventFormToRpcPayload(
      formValues,
      feeConfig,
      uploadedFlyerUrl ?? event.flyer_url ?? event.image_url,
    )
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo armar la actualización.",
    }
  }

  const { data: updatedId, error } = await mutationClient.rpc(
    "update_complete_event_with_seating_tx",
    {
      p_event_id: eventId,
      payload: rpcPayload as unknown as Json,
    },
  )

  if (error) {
    if (uploadedFlyerUrl) {
      const path = uploadedFlyerUrl.split("/event-flyers/")[1]
      if (path) {
        await mutationClient.storage.from("event-flyers").remove([path])
      }
    }
    return {
      success: false,
      error: error.message.replace(
        /^update_complete_event_with_seating_tx:\s*/i,
        "",
      ),
    }
  }

  await syncTierAdmitCounts(eventId, formValues.tickets)
  await syncTicketTierPhases(eventId, formValues.tickets)
  const venueId = await persistEventVenueFields(
    mutationClient,
    eventId,
    formValues,
  )

  if (!draftMode) {
    const { data: live } = await mutationClient
      .from("events")
      .select("status")
      .eq("id", eventId)
      .maybeSingle()
    if (live?.status === "published" || live?.status === "paused") {
      const materializeError = await materializeEventSeatingUnits(
        mutationClient,
        eventId,
      )
      if (materializeError) {
        return { success: false, error: materializeError }
      }
    }
    revalidatePath("/admin")
    revalidatePath("/admin/events")
    revalidatePath(`/admin/events/${eventId}`)
    revalidatePath(`/admin/events/${eventId}/edit`)
    revalidatePath("/events")
    revalidatePath(`/events/${eventId}`)
    revalidatePath("/")
  }

  return {
    success: true,
    eventId: String(updatedId ?? eventId),
    venueId,
  }
}

export type PublishEventResult =
  | { success: true; purgedTestTickets?: number }
  | { success: false; error: string }

/**
 * Publica un borrador del organizador cuando cumple requisitos mínimos.
 * Featured/Boost no se toca aquí (solo service_role vía webhook).
 */
export async function publishEvent(
  eventId: string,
  options: { purgeTestTickets?: boolean } = {},
): Promise<PublishEventResult> {
  if (!eventId?.trim()) {
    return { success: false, error: "Evento inválido." }
  }

  const { supabase, user } = await requireAuthenticatedUser()

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", user.id)
    .maybeSingle()

  const approval = (profile as { organizer_approval_status?: string } | null)
    ?.organizer_approval_status
  const isApprovedOrganizer =
    profile?.role === "super_admin" ||
    (profile?.role === "admin" && approval === "approved")

  if (!isApprovedOrganizer) {
    return {
      success: false,
      error: "Tu cuenta de organizador aún no está aprobada.",
    }
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select(
      "id, organizer_id, status, date, location, venue_id, venues(id, name, location)",
    )
    .eq("id", eventId)
    .maybeSingle()

  if (eventError) {
    return { success: false, error: eventError.message }
  }

  if (!event || event.organizer_id !== user.id) {
    return { success: false, error: "No tenés permiso para publicar este evento." }
  }

  if (event.status === "published") {
    return { success: true, purgedTestTickets: 0 }
  }

  if (event.status !== "draft") {
    return {
      success: false,
      error: "Solo se pueden publicar eventos en borrador.",
    }
  }

  const startsAt = new Date(event.date)
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
    return {
      success: false,
      error: "La fecha de inicio debe ser futura.",
    }
  }

  const venue = event.venues as { id: string; name: string; location: string } | null
  const hasVenue =
    Boolean(event.venue_id && venue?.name?.trim() && venue?.location?.trim()) ||
    Boolean(event.location?.trim() && event.location.trim().length >= 3)

  if (!hasVenue) {
    return {
      success: false,
      error: "Completá los datos del lugar / ubicación antes de publicar.",
    }
  }

  const { data: tiers, error: tiersError } = await supabase
    .from("ticket_tiers")
    .select("id, name, price, capacity")
    .eq("event_id", eventId)

  if (tiersError) {
    return { success: false, error: tiersError.message }
  }

  const sellable = (tiers ?? []).filter((tier) => Number(tier.capacity) > 0)
  if (sellable.length === 0) {
    return {
      success: false,
      error: "Configurá al menos un tipo de entrada (paga o gratis) con stock > 0.",
    }
  }

  let purgedTestTickets = 0
  if (options.purgeTestTickets !== false) {
    const { data: purged, error: purgeError } = await supabase.rpc(
      "purge_event_test_tickets",
      { p_event_id: eventId },
    )
    if (purgeError) {
      return {
        success: false,
        error: `No se pudieron purgar las entradas de prueba: ${purgeError.message}`,
      }
    }
    purgedTestTickets = Number(purged ?? 0)
  }

  const { data: updated, error: updateError } = await supabase
    .from("events")
    .update({ status: "published", updated_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("organizer_id", user.id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle()

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  if (!updated) {
    return {
      success: false,
      error: "No se pudo publicar el evento. Recargá e intentá de nuevo.",
    }
  }

  const materializeError = await materializeEventSeatingUnits(supabase, eventId)
  if (materializeError) {
    return {
      success: false,
      error: `El evento se publicó pero no se pudo generar el inventario de asientos: ${materializeError}`,
    }
  }

  revalidatePath("/admin")
  revalidatePath("/admin/events")
  revalidatePath("/events")
  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/events/preview/${eventId}`)
  revalidatePath("/")
  revalidatePath("/superadmin/events")
  revalidatePath("/cuenta/entradas")

  return { success: true, purgedTestTickets }
}

export type UpdateEventSalesStatusResult =
  | { success: true; status: EventStatus }
  | { success: false; error: string }

/**
 * Control de venta del organizador: publicar / pausar / volver a borrador.
 * No toca cancelled/archived/completed.
 */
export async function updateEventSalesStatus(
  eventId: string,
  nextStatus: "published" | "paused" | "draft",
): Promise<UpdateEventSalesStatusResult> {
  if (!eventId?.trim()) {
    return { success: false, error: "Evento inválido." }
  }

  const { supabase, user } = await requireAuthenticatedUser()

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", user.id)
    .maybeSingle()

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, organizer_id, status")
    .eq("id", eventId)
    .maybeSingle()

  if (eventError) return { success: false, error: eventError.message }
  if (!event) return { success: false, error: "Evento no encontrado." }

  const isOwner = event.organizer_id === user.id
  const isSuper = profile?.role === "super_admin"
  if (!isOwner && !isSuper) {
    return { success: false, error: "No tenés permiso para cambiar el estado." }
  }

  const current = event.status as EventStatus

  if (nextStatus === "published") {
    if (current === "published") {
      return { success: true, status: "published" }
    }
    if (current === "paused") {
      const { error } = await supabase
        .from("events")
        .update({ status: "published", updated_at: new Date().toISOString() })
        .eq("id", eventId)
      if (error) return { success: false, error: error.message }
      revalidateEventSalesPaths(eventId)
      return { success: true, status: "published" }
    }
    // draft → published: reutilizar validaciones de publishEvent
    const published = await publishEvent(eventId, { purgeTestTickets: true })
    if (!published.success) return published
    return { success: true, status: "published" }
  }

  if (nextStatus === "paused") {
    if (current !== "published" && current !== "paused") {
      return {
        success: false,
        error: "Solo podés pausar un evento publicado.",
      }
    }
    const { error } = await supabase
      .from("events")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", eventId)
    if (error) return { success: false, error: error.message }
    revalidateEventSalesPaths(eventId)
    return { success: true, status: "paused" }
  }

  // draft
  if (current !== "paused" && current !== "draft" && current !== "published") {
    return {
      success: false,
      error: "No se puede pasar este evento a borrador.",
    }
  }
  const { error } = await supabase
    .from("events")
    .update({ status: "draft", updated_at: new Date().toISOString() })
    .eq("id", eventId)
  if (error) return { success: false, error: error.message }
  revalidateEventSalesPaths(eventId)
  return { success: true, status: "draft" }
}

function revalidateEventSalesPaths(eventId: string) {
  revalidatePath("/admin")
  revalidatePath("/admin/events")
  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath("/events")
  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/events/preview/${eventId}`)
  revalidatePath("/")
  revalidatePath("/superadmin/events")
}

export async function countEventTestTickets(
  eventId: string,
): Promise<number> {
  if (!eventId?.trim()) return 0
  const { supabase, user } = await requireAuthenticatedUser()

  const { data: event } = await supabase
    .from("events")
    .select("organizer_id")
    .eq("id", eventId)
    .maybeSingle()

  if (!event || event.organizer_id !== user.id) return 0

  const { count, error } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("is_test", true)

  if (error) return 0
  return count ?? 0
}

export type DeleteOrArchiveEventResult =
  | { success: true; mode: "deleted" | "cancelled" | "archived" }
  | { success: false; error: string }

/**
 * Borrado seguro:
 * - Sin entradas vendidas/comprometidas → DELETE físico
 * - Con ventas → soft delete (`cancelled`) para preservar auditoría
 */
export async function deleteOrArchiveEvent(
  eventId: string,
): Promise<DeleteOrArchiveEventResult> {
  if (!eventId?.trim()) {
    return { success: false, error: "Evento inválido." }
  }

  const { supabase, user } = await requireAuthenticatedUser()

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, organizer_id, status, title")
    .eq("id", eventId)
    .maybeSingle()

  if (eventError) {
    return { success: false, error: eventError.message }
  }
  if (!event || event.organizer_id !== user.id) {
    return { success: false, error: "No tenés permiso sobre este evento." }
  }

  if (event.status === "cancelled") {
    return { success: false, error: "El evento ya está cancelado." }
  }

  const { count, error: countError } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .in("status", ["valid", "used", "scanned", "pending_payment"])

  if (countError) {
    return { success: false, error: countError.message }
  }

  const ticketsSold = count ?? 0

  if (ticketsSold === 0) {
    const { error: deleteError } = await supabase
      .from("events")
      .delete()
      .eq("id", eventId)
      .eq("organizer_id", user.id)

    if (deleteError) {
      return { success: false, error: deleteError.message }
    }

    revalidatePath("/admin")
    revalidatePath("/admin/events")
    revalidatePath("/events")
    revalidatePath("/")
    revalidatePath("/superadmin/events")
    return { success: true, mode: "deleted" }
  }

  const { data: updated, error: updateError } = await supabase
    .from("events")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .eq("organizer_id", user.id)
    .select("id")
    .maybeSingle()

  if (updateError) {
    return { success: false, error: updateError.message }
  }
  if (!updated) {
    return {
      success: false,
      error: "No se pudo cancelar el evento. Recargá e intentá de nuevo.",
    }
  }

  revalidatePath("/admin")
  revalidatePath("/admin/events")
  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath(`/events/${eventId}`)
  revalidatePath("/events")
  revalidatePath("/")
  revalidatePath("/superadmin/events")

  return { success: true, mode: "cancelled" }
}

export async function archiveEvent(
  eventId: string,
): Promise<DeleteOrArchiveEventResult> {
  if (!eventId?.trim()) {
    return { success: false, error: "Evento inválido." }
  }

  const { supabase, user } = await requireAuthenticatedUser()

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, organizer_id, status")
    .eq("id", eventId)
    .maybeSingle()

  if (eventError) {
    return { success: false, error: eventError.message }
  }
  if (!event || event.organizer_id !== user.id) {
    return { success: false, error: "No tenés permiso sobre este evento." }
  }

  if (event.status === "archived") {
    return { success: true, mode: "archived" }
  }

  if (event.status === "cancelled") {
    return {
      success: false,
      error: "Un evento cancelado no se puede archivar.",
    }
  }

  const { count, error: countError } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .in("status", ["valid", "used", "scanned", "pending_payment"])

  if (countError) {
    return { success: false, error: countError.message }
  }

  if ((count ?? 0) > 0 && event.status === "published") {
    return {
      success: false,
      error:
        "Hay entradas vendidas. Usá Eliminar para cancelar el evento y preservar la auditoría.",
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("events")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .eq("organizer_id", user.id)
    .select("id")
    .maybeSingle()

  if (updateError) {
    return { success: false, error: updateError.message }
  }
  if (!updated) {
    return { success: false, error: "No se pudo archivar el evento." }
  }

  revalidatePath("/admin")
  revalidatePath("/admin/events")
  revalidatePath(`/events/${eventId}`)
  revalidatePath("/events")
  revalidatePath("/")

  return { success: true, mode: "archived" }
}

export type EventCommercialSettings = EventFeeConfig & {
  eventId: string
  title: string
}

export async function getEventCommercialSettings(
  eventId: string,
): Promise<EventCommercialSettings | null> {
  if (!eventId?.trim()) return null
  const { supabase, user } = await requireAuthenticatedUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (!isPlatformOwnerRole(profile?.role)) return null

  const admin = createAdminClient()
  const { data: event } = await admin
    .from("events")
    .select(
      "id, title, platform_fee_percentage, platform_fixed_fee, max_free_tickets, is_sponsored_by_tokepass",
    )
    .eq("id", eventId)
    .maybeSingle()

  if (!event) return null

  return {
    eventId: event.id,
    title: event.title,
    platformFeePercentage: Number(event.platform_fee_percentage ?? 8),
    platformFixedFee: Number(event.platform_fixed_fee ?? 0),
    maxFreeTickets: Number(event.max_free_tickets ?? 100),
    isSponsoredByTokepass: Boolean(event.is_sponsored_by_tokepass),
  }
}

export type UpdateEventCommercialSettingsResult =
  | { success: true; recalculatedTiers: number }
  | { success: false; error: string }

/**
 * Platform owner only (super_admin / PLATFORM_OWNER): fees, free-ticket cap,
 * Tokepass sponsorship. Recomputes tier base_price / platform_fee from public
 * All-In price.
 *
 * Auth: misma fuente que `app/(superadmin)/layout.tsx` → `profiles.role === "super_admin"`.
 * Persistencia: service-role (bypass RLS de organizer). El trigger P28/P38 permite
 * mutar columnas comerciales cuando `auth.role() = 'service_role'`.
 */
export async function updateEventCommercialSettings(
  eventId: string,
  input: {
    platformFeePercentage: number
    platformFixedFee: number
    maxFreeTickets: number
    isSponsoredByTokepass: boolean
  },
): Promise<UpdateEventCommercialSettingsResult> {
  if (!eventId?.trim()) {
    return { success: false, error: "Evento inválido." }
  }

  const { supabase, user } = await requireAuthenticatedUser()
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError || !isPlatformOwnerRole(profile?.role)) {
    return {
      success: false,
      error: "Solo el dueño de la plataforma puede editar estos valores.",
    }
  }

  const percentage = Number(input.platformFeePercentage)
  const fixed = Number(input.platformFixedFee)
  const maxFree = Math.floor(Number(input.maxFreeTickets))
  const sponsored = Boolean(input.isSponsoredByTokepass)

  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 95) {
    return { success: false, error: "El porcentaje debe estar entre 0 y 95." }
  }
  if (!Number.isFinite(fixed) || fixed < 0) {
    return { success: false, error: "El cargo fijo no puede ser negativo." }
  }
  if (!Number.isFinite(maxFree) || maxFree < 0) {
    return { success: false, error: "El máximo de entradas gratis es inválido." }
  }

  const feeConfig: EventFeeConfig = {
    platformFeePercentage: percentage,
    platformFixedFee: fixed,
    maxFreeTickets: maxFree,
    isSponsoredByTokepass: sponsored,
  }

  const admin = createAdminClient()

  const { error: updateError } = await admin
    .from("events")
    .update({
      platform_fee_percentage: feeConfig.platformFeePercentage,
      platform_fixed_fee: feeConfig.platformFixedFee,
      max_free_tickets: feeConfig.maxFreeTickets,
      is_sponsored_by_tokepass: feeConfig.isSponsoredByTokepass,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  const { data: tiers, error: tiersError } = await admin
    .from("ticket_tiers")
    .select("id, price")
    .eq("event_id", eventId)

  if (tiersError) {
    return { success: false, error: tiersError.message }
  }

  let recalculatedTiers = 0
  for (const tier of tiers ?? []) {
    const breakdown = allInBreakdown(
      Number(tier.price),
      eventFeeRate(feeConfig),
      eventFixedFee(feeConfig),
    )
    const { error } = await admin
      .from("ticket_tiers")
      .update({
        base_price: breakdown.basePrice,
        platform_fee: breakdown.platformFee,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tier.id)
    if (!error) recalculatedTiers += 1
  }

  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath(`/admin/events/${eventId}/settings`)
  revalidatePath(`/admin/events/${eventId}/edit`)
  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/superadmin/events/${eventId}`)
  revalidatePath("/superadmin/events")
  revalidatePath("/")

  return { success: true, recalculatedTiers }
}

