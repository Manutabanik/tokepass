import { publishVenueMapFromDraft } from "@/lib/events/draft-seating-map-v2"
import { parsePromoVideoUrl } from "@/lib/promo-video"
import { calculateTierPricing } from "@/lib/pricing/flexible-pricing"
import {
  defaultEventFeeConfig,
  sumFreeTicketCapacity,
  type EventFeeConfig,
} from "@/lib/pricing/event-fees"
import {
  flattenDraftScheduleOccurrences,
  type DraftScheduleOccurrence,
} from "@/lib/events/draft-schedule-slots-v2"
import { parseTicketCommerceType } from "@/lib/events/ticket-commerce-type"
import {
  EVENT_DRAFT_GALLERY_MAX,
  eventPublishSchema,
  isEventDraftOnline,
  isMapDraftTicket,
  resolveDraftSchedule,
  type EventDraftV2LineItem,
} from "@/lib/validations/event-draft-v2"
import { composeVenuePlace } from "@/lib/venues/compose-location"
import {
  STREAMING_VENUE_LOCATION,
  STREAMING_VENUE_NAME,
} from "@/lib/venues/streaming-venue"
import type { Json } from "@/types/database"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type PublishEventV2Issue = {
  path: string
  message: string
}

export type PublishEventV2TierPayload = {
  id: string | null
  name: string
  description: string | null
  price: number
  base_price: number
  platform_fee: number
  capacity: number
  min_purchase_limit: number
  max_purchase_limit: number | null
  tier_type: "general" | "addon" | "seated"
  category: "standard" | "special"
  layout_type: "general" | "numbered_seat" | "table_combo"
  seating_sector_id: string | null
  day_id: string | null
  ticket_type: "standard" | "combo" | "extra"
}

export type PublishEventV2ScheduleDay = {
  id: string | null
  title: string
  start_time: string
  end_time: string
}

export type PublishEventV2Payload = {
  title: string
  date: string
  ends_at: string | null
  schedule_days: PublishEventV2ScheduleDay[]
  location: string
  visibility: "public" | "private"
  flyer_url: string | null
  image_url: string | null
  social_share_image_url: string | null
  description: string
  venue: {
    name: string
    location: string
    capacity: number
    city: string | null
    province: string | null
    latitude: number | null
    longitude: number | null
  }
  delivery_mode: "PRESENCIAL" | "ONLINE"
  venue_map?: Json
  has_seating_plan: boolean
  promo_video_url: string | null
  gallery_urls: string[]
  restrictions: string | null
  what_to_bring: string | null
  tickets: PublishEventV2TierPayload[]
  seating_maps: PublishEventV2SeatingMap[]
}

export type PublishEventV2SeatingMap = {
  /** Jornada (`event_schedules.id`). El draft lo llama dateId / event_date_id. */
  event_date_id: string | null
  map_config: Json
  pricing: Json
}

export function formatEventPublishIssues(
  issues: Array<{ path: PropertyKey[]; message: string }>,
): PublishEventV2Issue[] {
  return issues.map((issue) => ({
    path: issue.path.length ? issue.path.map(String).join(".") : "(root)",
    message: issue.message,
  }))
}

export function asPublishUuid(value: unknown): string | null {
  if (typeof value !== "string") return null
  const id = value.trim()
  return UUID_RE.test(id) ? id : null
}

export function isPublishScheduleForeignKeyError(error: {
  code?: string
  message?: string
  details?: string
  hint?: string
} | null): boolean {
  if (!error) return false
  const code = String(error.code ?? "")
  const text =
    `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase()
  return (
    code === "23503" &&
    (text.includes("jornada") ||
      text.includes("event_schedules") ||
      text.includes("ticket_tiers_day_id") ||
      text.includes("day_id"))
  )
}

export function draftDateToIso(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error("Fecha inválida")
  }
  const local = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/.exec(trimmed)
  const source = local && !local[2] ? `${local[1]}:00` : trimmed
  const parsed = new Date(source)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Fecha inválida")
  }
  return parsed.toISOString()
}

function clampLimit(value: unknown, fallback: number): number {
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(200, Math.max(1, parsed))
}

function optionalMaxLimit(value: unknown, min: number): number | null {
  if (value == null || value === "") return null
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.min(200, Math.max(min, parsed))
}

function trimTicketDescription(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) return null
  return text.slice(0, 180)
}

function publishLayoutType(
  item: { layoutType?: string | null; source?: string; sectorId?: string },
  isMap: boolean,
): PublishEventV2TierPayload["layout_type"] {
  if (item.layoutType === "table_combo") return "table_combo"
  if (item.layoutType === "numbered_seat") return "numbered_seat"
  if (isMap) return "numbered_seat"
  return "general"
}

function mapLineItemToTier(
  item: EventDraftV2LineItem | {
    id: string
    name: string
    description?: string
    price: number
    stock: number
    minOrder?: number
    maxOrder?: number
    source?: string
    sectorId?: string
    layoutType?: string
    slotId?: string
    validDayIds?: string[]
    ticketType?: EventDraftV2LineItem["ticketType"]
  },
  kind: "ticket" | "extra",
  fee: EventFeeConfig,
  absorbFees: boolean,
): PublishEventV2TierPayload | null {
  const name = String(item.name ?? "").trim()
  const stock = Math.floor(Number(item.stock))
  if (!name || !Number.isFinite(stock) || stock < 1) return null

  const inputPrice = Math.max(0, Number(item.price) || 0)
  const priced = calculateTierPricing({
    inputValue: inputPrice,
    feePercentage: fee.platformFeePercentage,
    fixedFee: fee.platformFixedFee,
    feeStrategy: absorbFees ? "absorb_in_price" : "pass_to_customer",
    calculationMode: "public_price",
    sponsored: fee.isSponsoredByTokePass,
  })
  const minPurchase = clampLimit(item.minOrder, 1)
  const explicitType = parseTicketCommerceType(item.ticketType)
  const ticketType =
    kind === "extra"
      ? explicitType === "combo"
        ? "combo"
        : "extra"
      : (explicitType ?? "standard")
  const isExtra = ticketType === "extra"
  const isMap = !isExtra && isMapDraftTicket(item)
  const sectorId = String(item.sectorId ?? "").trim()

  return {
    id: asPublishUuid(item.id),
    name,
    description: trimTicketDescription(item.description),
    price: priced.publicPrice,
    base_price: priced.organizerNet,
    platform_fee: priced.serviceFee,
    capacity: stock,
    min_purchase_limit: minPurchase,
    max_purchase_limit: optionalMaxLimit(item.maxOrder, minPurchase),
    tier_type: isExtra ? "addon" : isMap ? "seated" : "general",
    category: isExtra ? "special" : "standard",
    layout_type: isExtra ? "general" : publishLayoutType(item, isMap),
    seating_sector_id: isMap && sectorId ? sectorId : null,
    day_id: asPublishUuid((item as { slotId?: string }).slotId),
    ticket_type: ticketType,
  }
}

function resolvePublishedTicketDayId(
  item: { slotId?: string; validDayIds?: string[] },
  publishedDayIds: Set<string>,
  occurrences: DraftScheduleOccurrence[],
): string | null {
  const slotId = asPublishUuid(item.slotId)
  if (slotId && publishedDayIds.has(slotId)) return slotId

  const valid = (item.validDayIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
  if (valid.length !== 1) return null

  const only = asPublishUuid(valid[0])
  if (only && publishedDayIds.has(only)) return only

  const matching = occurrences.filter(
    (occurrence) =>
      occurrence.dayId === valid[0] || occurrence.id === valid[0],
  )
  if (matching.length !== 1) return null
  const occurrenceId = asPublishUuid(matching[0]?.id)
  return occurrenceId && publishedDayIds.has(occurrenceId) ? occurrenceId : null
}

export function composePublishDescription(input: {
  title: string
  checkoutMessage?: string
}): string {
  const checkout = input.checkoutMessage?.trim() ?? ""
  return checkout || input.title
}

function publishOptionalText(value?: string | null): string | null {
  const text = value?.trim() ?? ""
  return text || null
}

function publishPromoVideoUrl(value?: string | null): string | null {
  const raw = value?.trim() ?? ""
  if (!raw) return null
  return parsePromoVideoUrl(raw)?.canonicalUrl ?? raw
}

function publishGalleryUrls(urls?: string[] | null): string[] {
  const seen = new Set<string>()
  const next: string[] = []
  for (const item of urls ?? []) {
    const url = item.trim()
    if (!url || seen.has(url)) continue
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue
    } catch {
      continue
    }
    seen.add(url)
    next.push(url)
    if (next.length >= EVENT_DRAFT_GALLERY_MAX) break
  }
  return next
}

export function publishedExperienceColumns(payload: PublishEventV2Payload) {
  return {
    promo_video_url: payload.promo_video_url,
    gallery_urls: payload.gallery_urls,
    restrictions: payload.restrictions,
    what_to_bring: payload.what_to_bring,
  }
}

export function buildPublishEventV2Payload(
  draft: unknown,
  fee: EventFeeConfig = defaultEventFeeConfig(),
): PublishEventV2Payload {
  const parsed = eventPublishSchema.parse(draft)
  const title = parsed.basicInfo.name.trim()
  const isOnline = isEventDraftOnline(parsed)
  const venueName = (
    parsed.location?.venueName ||
    parsed.basicInfo.locationName ||
    ""
  ).trim()
  const place = composeVenuePlace({
    street: parsed.location?.address,
    department: parsed.location?.city,
    province: parsed.location?.province,
    city: parsed.location?.city,
  })
  const location = isOnline
    ? STREAMING_VENUE_LOCATION
    : place.display || venueName
  const absorbFees = parsed.settings?.absorbFees === true
  const occurrences = flattenDraftScheduleOccurrences(
    resolveDraftSchedule(parsed),
  ).filter((item) => item.startDateTime.trim())
  const extras = (parsed.extras ?? [])
    .map((item) => mapLineItemToTier(item, "extra", fee, absorbFees))
    .filter((item): item is PublishEventV2TierPayload => item != null)
    .map((item) => ({ ...item, day_id: null }))
  const flyer = parsed.flyerUrl?.trim() || null
  const banner = parsed.bannerUrl?.trim() || null
  const publishedMaps = publishSeatingMapsFromDraft(parsed, occurrences)
  const firstDay = occurrences[0]
  if (!firstDay) {
    throw new Error("La fecha de inicio es obligatoria")
  }
  const lastDay = occurrences[occurrences.length - 1] ?? firstDay
  const lastEnd = lastDay.endDateTime.trim() || firstDay.endDateTime.trim()
  const scheduleDays =
    occurrences.length >= 2
      ? occurrences.map((item, index) => ({
          id: asPublishUuid(item.id),
          title: item.title.trim() || `Turno ${index + 1}`,
          start_time: draftDateToIso(item.startDateTime),
          end_time: draftDateToIso(item.endDateTime || item.startDateTime),
        }))
      : []
  const publishedDayIds = new Set(
    scheduleDays
      .map((day) => day.id)
      .filter((id): id is string => Boolean(id)),
  )
  const tickets = parsed.tickets
    .map((item) => {
      const mapped = mapLineItemToTier(item, "ticket", fee, absorbFees)
      if (!mapped) return null
      return {
        ...mapped,
        day_id: resolvePublishedTicketDayId(
          item,
          publishedDayIds,
          occurrences,
        ),
      }
    })
    .filter((item): item is PublishEventV2TierPayload => item != null)

  if (tickets.length < 1) {
    throw new Error("Agregá al menos una entrada")
  }

  return {
    title,
    date: draftDateToIso(firstDay.startDateTime),
    ends_at: lastEnd ? draftDateToIso(lastEnd) : null,
    schedule_days: scheduleDays,
    location,
    visibility: parsed.settings?.isPublic === false ? "private" : "public",
    flyer_url: flyer,
    image_url: flyer ?? banner,
    social_share_image_url: banner,
    description: composePublishDescription({
      title,
      checkoutMessage: parsed.settings?.checkoutMessage,
    }),
    promo_video_url: publishPromoVideoUrl(parsed.promoVideoUrl),
    gallery_urls: publishGalleryUrls(parsed.galleryUrls),
    restrictions: publishOptionalText(parsed.restrictions),
    what_to_bring: publishOptionalText(parsed.whatToBring),
    venue: {
      name: isOnline ? STREAMING_VENUE_NAME : venueName,
      location,
      capacity: Math.floor(Number(parsed.venueCapacity)),
      city: isOnline ? null : parsed.location?.city?.trim() || place.city,
      province: isOnline ? null : parsed.location?.province?.trim() || null,
      latitude:
        !isOnline && Number.isFinite(parsed.location?.lat)
          ? Number(parsed.location?.lat)
          : null,
      longitude:
        !isOnline && Number.isFinite(parsed.location?.lng)
          ? Number(parsed.location?.lng)
          : null,
    },
    delivery_mode: isOnline ? "ONLINE" : "PRESENCIAL",
    has_seating_plan: publishedMaps.has_seating_plan,
    ...(publishedMaps.venue_map ? { venue_map: publishedMaps.venue_map } : {}),
    seating_maps: publishedMaps.seating_maps,
    tickets: [...tickets, ...extras],
  }
}

function publishSeatingMapsFromDraft(
  draft: {
    seatingMaps?: Array<{
      dateId?: string
      mapConfig?: unknown
      pricing?: unknown
    }>
    seatingMap?: unknown
  },
  occurrences: DraftScheduleOccurrence[] = [],
): {
  seating_maps: PublishEventV2SeatingMap[]
  venue_map?: Json
  has_seating_plan: boolean
} {
  const instances = Array.isArray(draft.seatingMaps) ? draft.seatingMaps : []
  const seating_maps = instances.flatMap((item) => {
    const published = publishVenueMapFromDraft(item.mapConfig)
    if (!published.venue_map) return []
    const pricing = (item.pricing ?? {}) as Json
    return resolvePublishedMapDayIds(item.dateId, occurrences).map(
      (event_date_id) => ({
        event_date_id,
        map_config: published.venue_map as Json,
        pricing,
      }),
    )
  })
  if (seating_maps.length === 0) {
    const published = publishVenueMapFromDraft(draft.seatingMap)
    return {
      seating_maps: published.venue_map
        ? [
            {
              event_date_id: null,
              map_config: published.venue_map,
              pricing: {} as Json,
            },
          ]
        : [],
      venue_map: published.venue_map,
      has_seating_plan: published.has_seating_plan,
    }
  }
  return {
    seating_maps,
    venue_map: seating_maps[0]?.map_config,
    has_seating_plan: true,
  }
}

/** Draft `dateId` is the jornada. Slots become extra `event_schedules` rows. */
function resolvePublishedMapDayIds(
  dateId: string | undefined,
  occurrences: DraftScheduleOccurrence[],
): Array<string | null> {
  const id = dateId?.trim() ?? ""
  const matching = id
    ? occurrences.filter(
        (occurrence) => occurrence.dayId === id || occurrence.id === id,
      )
    : []
  const published = [
    ...new Set(
      (matching.length > 0
        ? matching.map((occurrence) => asPublishUuid(occurrence.id))
        : [asPublishUuid(id)]
      ).filter((value): value is string => Boolean(value)),
    ),
  ]
  return published.length > 0 ? published : [null]
}

export function freePublishCapacity(payload: PublishEventV2Payload): number {
  return sumFreeTicketCapacity(
    payload.tickets.map((ticket) => ({
      name: ticket.name,
      price: ticket.price,
      capacity: ticket.capacity,
    })),
  )
}
