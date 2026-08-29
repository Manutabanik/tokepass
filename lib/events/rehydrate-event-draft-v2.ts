import { groupLiveDaysIntoDraftSchedule } from "@/lib/events/draft-schedule-slots-v2"
import {
  newScheduleDayId,
  scheduleDaysFromEvent,
  toDatetimeLocalInput,
} from "@/lib/event-schedule"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import { asTicketCommerceType, resolveTicketCommerceType } from "@/lib/events/ticket-commerce-type"
import {
  parseDraftSeatingMaps,
  toDraftSeatingMap,
} from "@/lib/events/draft-seating-map-v2"
import { parseEventRefundPolicy } from "@/lib/validations/event-form"
import { collapseDayPricedTicketsForEditor } from "@/lib/events/draft-day-priced-tickets"
import {
  emptyEventDraftV2LineItem,
  parseEventDraftV2,
  type EventDraftV2,
  type EventDraftV2LineItem,
  type EventDraftV2LineupItem,
} from "@/lib/validations/event-draft-v2"
import { composeVenuePlace } from "@/lib/venues/compose-location"
import { isStreamingVenue } from "@/lib/venues/streaming-venue"

export type LiveEventTicketSnapshotV2 = {
  id: string
  name: string | null
  description: string | null
  price: number | null
  base_price?: number | null
  capacity: number | null
  min_purchase_limit: number | null
  max_purchase_limit: number | null
  tier_type: string | null
  category: string | null
  layout_type: string | null
  seating_sector_id: string | null
  day_id?: string | null
  ticket_type?: string | null
}

export type LiveEventVenueSnapshotV2 = {
  name: string | null
  location: string | null
  address: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  capacity: number | null
  max_capacity: number | null
  venue_map: unknown
}

export type LiveEventSnapshotV2 = {
  event: {
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
    schedule_days?: unknown
    promo_video_url?: string | null
    gallery_urls?: unknown
    restrictions?: string | null
    what_to_bring?: string | null
    lineup?: unknown
    absorb_fees?: boolean | null
  }
  venue: LiveEventVenueSnapshotV2 | null
  tickets: LiveEventTicketSnapshotV2[]
  schedules?: Array<{
    id: string
    title: string
    start_time: string
    end_time: string
  }> | null
  lineup?: EventDraftV2LineupItem[] | null
  seatingMaps?: Array<{
    dateId?: string | null
    event_date_id?: string | null
    mapConfig?: unknown
    map_config?: unknown
    pricing?: unknown
  }> | null
}

export function isEventDraftStateEmpty(raw: unknown): boolean {
  if (raw == null) return true
  if (typeof raw !== "object" || Array.isArray(raw)) return true
  return Object.keys(raw).length === 0
}

export function rehydrateEventDraftV2(
  snapshot: LiveEventSnapshotV2,
): EventDraftV2 {
  const event = snapshot.event
  const venue = snapshot.venue
  const online =
    event.delivery_mode === "ONLINE" ||
    isStreamingVenue({
      venueName: venue?.name,
      venueLocation: venue?.location ?? event.location,
    })

  const rawVenueName = (venue?.name ?? "").trim()
  const venueName = online
    ? ""
    : isStreamingVenue({
          venueName: rawVenueName,
          venueLocation: venue?.location,
        })
      ? ""
      : rawVenueName

  const place = composeVenuePlace({
    street: venue?.address || venue?.location || event.location,
    city: venue?.city,
    department: event.department,
    province: event.province,
  })

  const tickets: EventDraftV2LineItem[] = []
  const extras: EventDraftV2LineItem[] = []
  for (const tier of snapshot.tickets) {
    const item = liveTierToDraftItem(tier)
    if (item.ticketType === "extra") {
      extras.push({ ...item, source: "general", sectorId: "", layoutType: "general" })
      continue
    }
    tickets.push(item)
  }

  const title = (event.title ?? "").trim()
  const description = (event.description ?? "").trim()
  const checkoutMessage =
    description && description !== title ? description : ""

  const lat = asOptionalCoord(venue?.latitude)
  const lng = asOptionalCoord(venue?.longitude)
  const liveDays = scheduleDaysFromEvent({
    relational: snapshot.schedules,
    json: event.schedule_days,
  })
  const schedule =
    liveDays.length > 0
      ? groupLiveDaysIntoDraftSchedule(
          liveDays.map((day) => ({
            id: day.id,
            title: day.title,
            startLocal: toDatetimeLocalInput(day.start_time),
            endLocal: toDatetimeLocalInput(day.end_time),
          })),
        )
      : [
          {
            id: newScheduleDayId(),
            name: "Día 1",
            date: "",
            startDate: event.date ? toDatetimeLocalInput(event.date) : "",
            endDate: event.ends_at ? toDatetimeLocalInput(event.ends_at) : "",
            slots: [],
          },
        ]
  const primary = schedule[0]
  const seatingMaps = parseDraftSeatingMaps(
    (snapshot.seatingMaps ?? []).map((row) => ({
      dateId: row.dateId ?? row.event_date_id ?? "",
      mapConfig: row.mapConfig ?? row.map_config,
      pricing: row.pricing,
    })),
    event.venue_map ?? venue?.venue_map,
    primary?.id ?? "",
  )

  const parsed = parseEventDraftV2({
    archetype: "show",
    isVirtual: online,
    virtualLink: "",
    basicInfo: {
      name: title,
      startDate: primary?.startDate ?? "",
      endDate: primary?.endDate ?? "",
      locationName: venueName,
    },
    schedule,
    location: {
      venueName,
      address: online ? "" : place.street,
      province: online ? "" : (event.province ?? "").trim(),
      city: online ? "" : (event.department ?? place.city ?? "").trim(),
      ...(lat != null ? { lat } : {}),
      ...(lng != null ? { lng } : {}),
    },
    flyerUrl: event.flyer_url || event.image_url || "",
    bannerUrl: event.social_share_image_url || "",
    promoVideoUrl: event.promo_video_url ?? "",
    galleryUrls: event.gallery_urls,
    restrictions: event.restrictions ?? "",
    whatToBring: event.what_to_bring ?? "",
    lineup: snapshot.lineup ?? event.lineup,
    venueCapacity:
      Math.max(
        0,
        Math.floor(Number(venue?.max_capacity ?? venue?.capacity ?? 0) || 0),
      ),
    tickets,
    extras,
    seatingMap:
      seatingMaps[0]?.mapConfig ??
      toDraftSeatingMap(event.venue_map ?? venue?.venue_map),
    seatingMaps,
    settings: {
      isPublic: event.visibility === "public",
      absorbFees: event.absorb_fees === true,
      refundPolicy: parseEventRefundPolicy(event.refund_policy),
      checkoutMessage,
      deliveryMode: online ? "ONLINE" : "PRESENCIAL",
    },
  })
  return {
    ...parsed,
    tickets: collapseDayPricedTicketsForEditor(parsed.tickets, parsed.schedule),
  }
}

function liveTierOrganizerPrice(tier: LiveEventTicketSnapshotV2): number {
  const base = Number(tier.base_price)
  if (tier.base_price != null && Number.isFinite(base) && base >= 0) {
    return Math.max(0, base)
  }
  return Math.max(0, Number(tier.price) || 0)
}

function liveTierToDraftItem(
  tier: LiveEventTicketSnapshotV2,
): EventDraftV2LineItem {
  const kind = inferInventoryTierType({
    tierType: tier.tier_type,
    layoutType: tier.layout_type,
    category: tier.category,
  })
  const sectorId = (tier.seating_sector_id ?? "").trim()
  const isMap = kind === "seated"
  const layoutType =
    tier.layout_type === "table_combo" || tier.layout_type === "numbered_seat"
      ? tier.layout_type
      : isMap
        ? "numbered_seat"
        : "general"
  const id = (tier.id ?? "").trim()
  return {
    ...emptyEventDraftV2LineItem(id || "item-0"),
    id: id || "item-0",
    name: (tier.name ?? "").trim(),
    description: (tier.description ?? "").trim(),
    price: liveTierOrganizerPrice(tier),
    stock: Math.max(0, Math.floor(Number(tier.capacity) || 0)),
    minOrder: Math.max(1, Math.floor(Number(tier.min_purchase_limit) || 1)),
    maxOrder: (() => {
      const raw = Math.floor(Number(tier.max_purchase_limit))
      return Number.isFinite(raw) && raw > 0 ? raw : 10
    })(),
    source: isMap ? "map" : "general",
    sectorId: isMap ? sectorId : "",
    layoutType,
    slotId: (tier.day_id ?? "").trim(),
    validDayIds: (tier.day_id ?? "").trim() ? [(tier.day_id ?? "").trim()] : [],
    ticketType: asTicketCommerceType(
      tier.ticket_type,
      resolveTicketCommerceType({
        ticket_type: tier.ticket_type,
        tierType: tier.tier_type,
        layoutType: tier.layout_type,
        category: tier.category,
        name: tier.name,
        dayId: tier.day_id,
      }),
    ),
  }
}

function asOptionalCoord(value: unknown): number | undefined {
  if (value == null || value === "") return undefined
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function rawHasKeys(raw: unknown, keys: string[]): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false
  return keys.some((key) => key in raw)
}

export function overlayLiveExperienceOnDraft(
  draft: EventDraftV2,
  live: {
    promoVideoUrl?: string | null
    galleryUrls?: unknown
    restrictions?: string | null
    whatToBring?: string | null
    lineup?: EventDraftV2LineupItem[] | null
  },
  raw?: unknown,
): { draft: EventDraftV2; changed: boolean } {
  const promoVideoUrl = rawHasKeys(raw, ["promoVideoUrl", "promo_video_url"])
    ? draft.promoVideoUrl
    : draft.promoVideoUrl.trim() || (live.promoVideoUrl ?? "").trim()
  const galleryUrls = rawHasKeys(raw, ["galleryUrls", "gallery_urls"])
    ? draft.galleryUrls
    : draft.galleryUrls.length > 0
      ? draft.galleryUrls
      : live.galleryUrls
  const restrictions = rawHasKeys(raw, ["restrictions"])
    ? draft.restrictions
    : draft.restrictions.trim() || (live.restrictions ?? "").trim()
  const whatToBring = rawHasKeys(raw, ["whatToBring", "what_to_bring"])
    ? draft.whatToBring
    : draft.whatToBring.trim() || (live.whatToBring ?? "").trim()
  const lineup = rawHasKeys(raw, ["lineup"])
    ? draft.lineup
    : draft.lineup.length > 0
      ? draft.lineup
      : (live.lineup ?? [])
  const next = parseEventDraftV2({
    ...draft,
    promoVideoUrl,
    galleryUrls,
    restrictions,
    whatToBring,
    lineup,
  })
  const changed =
    next.promoVideoUrl !== draft.promoVideoUrl ||
    next.restrictions !== draft.restrictions ||
    next.whatToBring !== draft.whatToBring ||
    next.galleryUrls.join("\n") !== draft.galleryUrls.join("\n") ||
    next.lineup.length !== draft.lineup.length
  return { draft: next, changed }
}
