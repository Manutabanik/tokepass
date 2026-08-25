import { toDatetimeLocalInput } from "@/lib/event-schedule"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import { toDraftSeatingMap } from "@/lib/events/draft-seating-map-v2"
import { parseEventRefundPolicy } from "@/lib/validations/event-form"
import {
  emptyEventDraftV2LineItem,
  parseEventDraftV2,
  type EventDraftV2,
  type EventDraftV2LineItem,
} from "@/lib/validations/event-draft-v2"
import { composeVenuePlace } from "@/lib/venues/compose-location"
import { isStreamingVenue } from "@/lib/venues/streaming-venue"

export type LiveEventTicketSnapshotV2 = {
  id: string
  name: string | null
  description: string | null
  price: number | null
  capacity: number | null
  min_purchase_limit: number | null
  max_purchase_limit: number | null
  tier_type: string | null
  category: string | null
  layout_type: string | null
  seating_sector_id: string | null
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
  }
  venue: LiveEventVenueSnapshotV2 | null
  tickets: LiveEventTicketSnapshotV2[]
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
    const kind = inferInventoryTierType({
      tierType: tier.tier_type,
      layoutType: tier.layout_type,
      category: tier.category,
    })
    if (kind === "addon" || kind === "bundle") {
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

  return parseEventDraftV2({
    basicInfo: {
      name: title,
      startDate: event.date ? toDatetimeLocalInput(event.date) : "",
      endDate: event.ends_at ? toDatetimeLocalInput(event.ends_at) : "",
      locationName: venueName,
    },
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
    venueCapacity:
      Math.max(
        0,
        Math.floor(Number(venue?.max_capacity ?? venue?.capacity ?? 0) || 0),
      ),
    tickets,
    extras,
    seatingMap: toDraftSeatingMap(event.venue_map ?? venue?.venue_map),
    settings: {
      isPublic: event.visibility === "public",
      absorbFees: false,
      refundPolicy: parseEventRefundPolicy(event.refund_policy),
      checkoutMessage,
      deliveryMode: online ? "ONLINE" : "PRESENCIAL",
    },
  })
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
  const isMap = kind === "seated" || Boolean(sectorId)
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
    price: Math.max(0, Number(tier.price) || 0),
    stock: Math.max(0, Math.floor(Number(tier.capacity) || 0)),
    minOrder: Math.max(1, Math.floor(Number(tier.min_purchase_limit) || 1)),
    maxOrder: (() => {
      const raw = Math.floor(Number(tier.max_purchase_limit))
      return Number.isFinite(raw) && raw > 0 ? raw : 10
    })(),
    source: isMap ? "map" : "general",
    sectorId: isMap ? sectorId : "",
    layoutType,
  }
}

function asOptionalCoord(value: unknown): number | undefined {
  if (value == null || value === "") return undefined
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
