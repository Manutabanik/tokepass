import {
  publishVenueMapFromDraft,
  sanitizeEventDraftForPersist,
} from "@/lib/events/draft-seating-map-v2"
import {
  collectLiveSeatingSectorIds,
  collectValidSectorIdsFromVenueMaps,
  nullifyInvalidTicketSeatingSectors,
} from "@/lib/events/sanitize-ticket-tiers"
import {
  collectNamedMapSectorIds,
  healTicketSeatingSector,
  type NamedMapSector,
} from "@/lib/seating/stabilize-venue-map-ids"
import { venueMapToSeatingLayout } from "@/lib/seating/venue-map-geometry"
import { parseVenueMap } from "@/types/venue-map"
import { parsePromoVideoUrl } from "@/lib/promo-video"
import { splitAbsorbFee } from "@/lib/pricing/absorb-fee-split"
import {
  defaultEventFeeConfig,
  sumFreeTicketCapacity,
  type EventFeeConfig,
} from "@/lib/pricing/event-fees"
import { expandDayPricedTicketsForPersist } from "@/lib/events/draft-day-priced-tickets"
import { occurrenceIdsForDraftTicket } from "@/lib/events/draft-schedule-bindings"
import {
  flattenDraftScheduleOccurrences,
  type DraftScheduleOccurrence,
} from "@/lib/events/draft-schedule-slots-v2"
import {
  parseTicketCommerceType,
  resolveTicketCommerceType,
} from "@/lib/events/ticket-commerce-type"
import {
  EVENT_DRAFT_GALLERY_MAX,
  eventPublishSchema,
  isEventDraftOnline,
  isMapDraftTicket,
  parseEventDraftV2,
  resolveDraftHasMap,
  resolveDraftSchedule,
  type EventDraftV2LineItem,
} from "@/lib/validations/event-draft-v2"
import { composeVenuePlace } from "@/lib/venues/compose-location"
import {
  STREAMING_VENUE_LOCATION,
  STREAMING_VENUE_NAME,
} from "@/lib/venues/streaming-venue"
import { saleWindowToIso } from "@/lib/inventory/ticket-sale-window"
import { parseDraftRefundPolicy } from "@/lib/events/refund-policy"
import type { EventRefundPolicy } from "@/lib/validations/event-form"
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
  sale_starts_at?: string | null
  sale_ends_at?: string | null
  combo_schedule_ids?: string[]
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
  visibility: "public" | "private" | "guest_list_only"
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
  access_link: string | null
  refund_policy: EventRefundPolicy
  checkout_message: string | null
  absorb_fees: boolean
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
  seating_layout?: Json
}

function seatingMapPayload(
  event_date_id: string | null,
  map_config: Json,
  pricing: Json,
): PublishEventV2SeatingMap {
  return {
    event_date_id,
    map_config,
    pricing,
    seating_layout: venueMapToSeatingLayout(
      parseVenueMap(map_config),
    ) as unknown as Json,
  }
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

/** Draft days/slots may still be `slot-*`. Keep a stable UUID so day_id matches. */
export function asPublishScheduleId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const id = value.trim()
  if (!id) return null
  const uuid = asPublishUuid(id)
  if (uuid) return uuid
  let hash = 2166136261
  const seed = `tokepass.schedule:${id}`
  const bytes = new Uint8Array(16)
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= i + seed.charCodeAt(i % seed.length)
    hash = Math.imul(hash, 16777619)
    bytes[i] = (hash >>> 24) & 0xff
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function publishedScheduleUpsertRows(
  eventId: string,
  days: PublishEventV2ScheduleDay[],
): Array<{
  id: string
  event_id: string
  title: string
  start_time: string
  end_time: string
}> {
  return days.flatMap((day) => {
    const id = day.id?.trim() ?? ""
    if (!id) return []
    return [
      {
        id,
        event_id: eventId,
        title: day.title.trim() || "Jornada",
        start_time: day.start_time,
        end_time: day.end_time,
      },
    ]
  })
}

/** RPC core still blanks ticket_tiers.day_id before rebinding. Multi-day map tickets collide. */
export function shouldPublishEventV2Sequentially(
  payload: Pick<PublishEventV2Payload, "schedule_days">,
): boolean {
  return payload.schedule_days.filter((day) => Boolean(day.id?.trim())).length >= 2
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
    startDate?: string
    endDate?: string
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
  const priced = splitAbsorbFee({
    ticketPrice: inputPrice,
    feeRate: fee.isSponsoredByTokePass ? 0 : fee.platformFeePercentage,
    absorbFees,
    fixedFee: fee.isSponsoredByTokePass ? 0 : fee.platformFixedFee,
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
  const isMap =
    !isExtra && item.source !== "general" && isMapDraftTicket(item)
  const sectorId = String(
    item.sectorId ??
      (item as { seating_sector_id?: string | null }).seating_sector_id ??
      (item as { seatingSectorId?: string | null }).seatingSectorId ??
      "",
  ).trim()

  return {
    id: asPublishUuid(item.id),
    name,
    description: trimTicketDescription(item.description),
    price: priced.ticketPrice,
    base_price: priced.organizerEarnings,
    platform_fee: priced.feeAmount,
    capacity: stock,
    min_purchase_limit: minPurchase,
    max_purchase_limit: optionalMaxLimit(item.maxOrder, minPurchase),
    tier_type: isExtra ? "addon" : isMap ? "seated" : "general",
    category: isExtra ? "special" : "standard",
    layout_type: isExtra ? "general" : publishLayoutType(item, isMap),
    seating_sector_id: isMap && sectorId ? sectorId : null,
    day_id: asPublishUuid((item as { slotId?: string }).slotId),
    ticket_type: ticketType,
    sale_starts_at: saleWindowToIso(
      (item as { startDate?: string }).startDate,
    ),
    sale_ends_at: saleWindowToIso((item as { endDate?: string }).endDate),
  }
}

/** Draft map tickets are `map:{dateId}:{sectorId}` when they still lack a UUID. */
export function dayIdFromMapTicketId(ticketId: unknown): string | null {
  if (typeof ticketId !== "string") return null
  const match = /^map:([^:]+):.+$/i.exec(ticketId.trim())
  const raw = match?.[1]?.trim() ?? ""
  return raw || null
}

export function resolvePublishedTicketDayIds(
  item: { id?: string; slotId?: string; validDayIds?: string[] },
  publishedDayIds: Set<string>,
  occurrences: DraftScheduleOccurrence[],
): string[] {
  const fromMapId = dayIdFromMapTicketId(item.id)
  const slotRaw = item.slotId?.trim() || fromMapId || ""
  const slotId = asPublishScheduleId(slotRaw)
  if (slotId && publishedDayIds.has(slotId)) return [slotId]

  const valid = (item.validDayIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
  const bound = valid.length > 0 ? valid : fromMapId ? [fromMapId] : []
  if (bound.length === 1) {
    const only = asPublishScheduleId(bound[0])
    if (only && publishedDayIds.has(only)) return [only]
  }

  return [
    ...new Set(
      occurrenceIdsForDraftTicket(
        { slotId: slotRaw, validDayIds: bound },
        occurrences,
      )
        .map((id) => asPublishScheduleId(id))
        .filter((id): id is string => id != null && publishedDayIds.has(id)),
    ),
  ]
}

function expandDraftItemsForPublish(
  items: EventDraftV2LineItem[],
  kind: "ticket" | "extra",
  fee: EventFeeConfig,
  absorbFees: boolean,
  publishedDayIds: Set<string>,
  occurrences: DraftScheduleOccurrence[],
  schedule: ReturnType<typeof resolveDraftSchedule>,
): PublishEventV2TierPayload[] {
  return expandDayPricedTicketsForPersist(items, schedule).flatMap(
    (item): PublishEventV2TierPayload[] => {
      const mapped = mapLineItemToTier(item, kind, fee, absorbFees)
      if (!mapped) return []
      const dayIds = resolvePublishedTicketDayIds(
        item,
        publishedDayIds,
        occurrences,
      )
      if (mapped.ticket_type === "combo") {
        const comboDays =
          dayIds.length >= 2 ? dayIds : [...publishedDayIds]
        if (comboDays.length >= 2) {
          return [{ ...mapped, day_id: null, combo_schedule_ids: comboDays }]
        }
      }
      if (dayIds.length === 0) {
        return [{ ...mapped, day_id: null }]
      }
      return dayIds.map((day_id, index) => ({
        ...mapped,
        id: index === 0 ? mapped.id : null,
        day_id,
      }))
    },
  )
}

export function assertPublishedSeatedTicketsBoundToDays(
  tickets: Array<{
    seating_sector_id?: string | null
    layout_type?: string | null
    day_id?: string | null
  }>,
  scheduleDays: Array<{ id: string | null }>,
) {
  const dayCount = scheduleDays.filter((day) => Boolean(day.id?.trim())).length
  if (dayCount < 2) return
  const seen = new Set<string>()
  for (const ticket of tickets) {
    const sector = ticket.seating_sector_id?.trim() ?? ""
    if (!sector || ticket.layout_type === "general") continue
    const day = ticket.day_id?.trim() ?? ""
    if (!day) {
      throw new Error(
        "Cada entrada de mapa tiene que estar atada a un día del cronograma. Guardá el mapa de cada jornada e intentá de nuevo.",
      )
    }
    const key = `${sector}::${day}`
    if (seen.has(key)) {
      throw new Error(
        "Ese sector del mapa ya tiene una entrada para el mismo día. Revisá las jornadas o el nombre de la tarifa.",
      )
    }
    seen.add(key)
  }
}

/**
 * Una jornada con entradas de mapa tiene que tener su mapa publicado.
 *
 * `resolveLiveVenueMapForDay()` se niega a prestarle a un día el mapa de otro,
 * para no vender el sábado con el plano del viernes. La contracara es que una
 * jornada sin fila en `seating_maps` deja al comprador sin mapa: o no puede
 * elegir ubicación, o el flujo alternativo le ofrece sectores que no son de su
 * día. El editor ya expone el hueco ("Mapas por jornada" muestra cada día y
 * ofrece clonar o dibujar), así que acá se corta antes de publicar en vez de
 * adivinar qué plano corresponde.
 */
export function assertPublishedSeatedDaysHaveMap(
  tickets: Array<{
    seating_sector_id?: string | null
    layout_type?: string | null
    day_id?: string | null
  }>,
  scheduleDays: Array<{ id: string | null; title?: string | null }>,
  seatingMaps: Array<{ event_date_id?: string | null }>,
) {
  const days = scheduleDays.filter((day) => Boolean(day.id?.trim()))
  if (days.length < 2) return
  const mapped = new Set(
    seatingMaps
      .map((map) => map.event_date_id?.trim())
      .filter((id): id is string => Boolean(id)),
  )
  for (const ticket of tickets) {
    const sector = ticket.seating_sector_id?.trim() ?? ""
    if (!sector || ticket.layout_type === "general") continue
    const day = ticket.day_id?.trim() ?? ""
    // Sin día lo corta `assertPublishedSeatedTicketsBoundToDays`.
    if (!day || mapped.has(day)) continue
    const title =
      days.find((item) => item.id?.trim() === day)?.title?.trim() || "esa jornada"
    throw new Error(
      `La jornada "${title}" tiene entradas de mapa pero no tiene mapa publicado. Abrí "Mapas por jornada", cloná o dibujá el plano de ese día y volvé a publicar.`,
    )
  }
}

export function composePublishDescription(input: {
  title: string
  checkoutMessage?: string
}): string {
  return input.title.trim()
}

export function resolvePublishedSaleWindowTierId(
  ticket: { id?: string | null },
  candidates: readonly { id: string }[],
): string | null {
  const id = asPublishUuid(ticket.id)
  if (id) return id
  return candidates.length === 1 ? (candidates[0]?.id ?? null) : null
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

function collectPublishedLiveSectors(input: {
  venue_map?: unknown
  seating_maps?: Array<{ map_config?: unknown }>
}): NamedMapSector[] {
  const byId = new Map<string, string>()
  for (const raw of [
    input.venue_map,
    ...(input.seating_maps ?? []).map((item) => item.map_config),
  ]) {
    for (const sector of collectNamedMapSectorIds(parseVenueMap(raw))) {
      if (!byId.has(sector.id)) byId.set(sector.id, sector.name)
    }
    for (const id of collectLiveSeatingSectorIds({ venueMap: raw })) {
      if (!byId.has(id)) byId.set(id, "")
    }
  }
  return [...byId.entries()].map(([id, name]) => ({ id, name }))
}

function sanitizePublishedTicketSectors(
  tickets: PublishEventV2TierPayload[],
  hasSeatingPlan: boolean,
  liveSectors: readonly NamedMapSector[],
): PublishEventV2TierPayload[] {
  const live = new Set(liveSectors.map((sector) => sector.id).filter(Boolean))
  return tickets.map((ticket) => {
    if (resolveTicketCommerceType(ticket) === "extra") {
      return { ...ticket, seating_sector_id: null }
    }
    if (!hasSeatingPlan) {
      return {
        ...ticket,
        seating_sector_id: null,
        tier_type: "general",
        layout_type: "general",
      }
    }
    if (ticket.tier_type === "general") {
      return { ...ticket, seating_sector_id: null }
    }
    const healed = healTicketSeatingSector(
      {
        name: ticket.name,
        seating_sector_id: ticket.seating_sector_id,
      },
      liveSectors,
    )
    const sectorId = healed.seating_sector_id?.trim() || ""
    if (!sectorId || !live.has(sectorId)) {
      if (
        ticket.layout_type === "table_combo" ||
        ticket.layout_type === "numbered_seat"
      ) {
        throw new Error(
          `La ubicación "${ticket.name}" no está en el mapa. Revisá el mapa antes de publicar.`,
        )
      }
      return {
        ...ticket,
        seating_sector_id: null,
        tier_type: "general",
        layout_type: "general",
      }
    }
    return { ...ticket, seating_sector_id: sectorId }
  })
}

export function buildPublishEventV2Payload(
  draft: unknown,
  fee: EventFeeConfig = defaultEventFeeConfig(),
): PublishEventV2Payload {
  const parsed = sanitizeEventDraftForPersist(
    parseEventDraftV2(eventPublishSchema.parse(draft)),
  )
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
          id: asPublishScheduleId(item.id),
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
  const draftSchedule = resolveDraftSchedule(parsed)
  const tickets = expandDraftItemsForPublish(
    parsed.tickets,
    "ticket",
    fee,
    absorbFees,
    publishedDayIds,
    occurrences,
    draftSchedule,
  )
  const extras = expandDraftItemsForPublish(
    parsed.extras ?? [],
    "extra",
    fee,
    absorbFees,
    publishedDayIds,
    occurrences,
    draftSchedule,
  )

  if (tickets.length < 1) {
    throw new Error("Agregá al menos una entrada")
  }

  const payload: PublishEventV2Payload = {
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
    refund_policy: parseDraftRefundPolicy(parsed.settings?.refundPolicy),
    checkout_message: publishOptionalText(parsed.settings?.checkoutMessage),
    absorb_fees: absorbFees,
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
    access_link: isOnline ? publishOptionalText(parsed.virtualLink) : null,
    has_seating_plan: publishedMaps.has_seating_plan,
    ...(publishedMaps.venue_map ? { venue_map: publishedMaps.venue_map } : {}),
    seating_maps: publishedMaps.seating_maps,
    tickets: sanitizePublishedTicketSectors(
      [...tickets, ...extras],
      publishedMaps.has_seating_plan,
      collectPublishedLiveSectors(publishedMaps),
    ),
  }
  assertPublishedSeatedTicketsBoundToDays(payload.tickets, payload.schedule_days)
  assertPublishedSeatedDaysHaveMap(
    payload.tickets,
    payload.schedule_days,
    payload.seating_maps ?? [],
  )
  return payload
}

/**
 * Cruza tickets con el venue_map / seating_maps que van a persistirse.
 * Un seating_sector_id fantasma se anula (general) para no disparar 23514.
 */
export function sanitizePublishPayloadForDatabase(
  payload: PublishEventV2Payload,
): PublishEventV2Payload {
  const validSectorIds = collectValidSectorIdsFromVenueMaps({
    venueMap: payload.venue_map,
    seatingMaps: payload.seating_maps,
  })
  return {
    ...payload,
    tickets: nullifyInvalidTicketSeatingSectors(payload.tickets, validSectorIds),
  }
}

function publishSeatingMapsFromDraft(
  draft: {
    hasMap?: boolean
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
  if (
    !resolveDraftHasMap({
      hasMap: draft.hasMap,
      seatingMaps: draft.seatingMaps,
      seatingMap: draft.seatingMap,
    })
  ) {
    return {
      seating_maps: [],
      venue_map: undefined,
      has_seating_plan: false,
    }
  }
  const instances = Array.isArray(draft.seatingMaps) ? draft.seatingMaps : []
  const seating_maps = instances.flatMap((item) => {
    const published = publishVenueMapFromDraft(item.mapConfig)
    if (!published.venue_map) return []
    const pricing = (item.pricing ?? {}) as Json
    return resolvePublishedMapDayIds(item.dateId, occurrences).map(
      (event_date_id) =>
        seatingMapPayload(event_date_id, published.venue_map as Json, pricing),
    )
  })
  const uniqueMaps: PublishEventV2SeatingMap[] = []
  const seenDays = new Set<string>()
  for (const map of seating_maps) {
    const key = map.event_date_id ?? "__null__"
    if (seenDays.has(key)) continue
    seenDays.add(key)
    uniqueMaps.push(map)
  }
  if (uniqueMaps.length === 0) {
    const published = publishVenueMapFromDraft(draft.seatingMap)
    if (!published.venue_map) {
      return {
        seating_maps: [],
        venue_map: undefined,
        has_seating_plan: false,
      }
    }
    if (occurrences.length >= 2) {
      const seating_maps = occurrences.flatMap((occurrence) => {
        const event_date_id = asPublishScheduleId(occurrence.id)
        if (!event_date_id) return []
        return [
          seatingMapPayload(
            event_date_id,
            published.venue_map as Json,
            {} as Json,
          ),
        ]
      })
      return {
        seating_maps,
        venue_map: published.venue_map,
        has_seating_plan: seating_maps.length > 0,
      }
    }
    return {
      seating_maps: [
        seatingMapPayload(
          asPublishScheduleId(occurrences[0]?.id) ?? null,
          published.venue_map as Json,
          {} as Json,
        ),
      ],
      venue_map: published.venue_map,
      has_seating_plan: true,
    }
  }
  const spread = spreadSingleMapAcrossDays(uniqueMaps, occurrences)
  return {
    seating_maps: spread,
    venue_map: spread[0]?.map_config,
    has_seating_plan: true,
  }
}

/**
 * Un solo plano en un evento de varias jornadas vale para todas.
 *
 * El draft normaliza un `seatingMap` heredado como una única instancia atada al
 * primer día, y `resolveLiveVenueMapForDay()` no le presta a un día el mapa de
 * otro: sin esta copia el comprador del segundo día se quedaba sin mapa y no
 * podía elegir ubicación. Es lo mismo que hace el botón "Clonar diseño" del
 * editor, y el inventario ya es por jornada (`event_seating_units`), así que
 * copiar el plano no mezcla stock.
 *
 * Con dos o más planos distintos no se adivina: el organizador está trabajando
 * por jornada y ahí manda `assertPublishedSeatedDaysHaveMap()`.
 */
function spreadSingleMapAcrossDays(
  maps: PublishEventV2SeatingMap[],
  occurrences: DraftScheduleOccurrence[],
): PublishEventV2SeatingMap[] {
  const base = maps.length === 1 ? maps[0] : null
  if (!base || occurrences.length < 2) return maps
  const baseDay = base.event_date_id?.trim() ?? ""
  const rows = baseDay ? [base] : []
  const covered = new Set(baseDay ? [baseDay] : [])
  for (const occurrence of occurrences) {
    const dayId = asPublishScheduleId(occurrence.id)
    if (!dayId || covered.has(dayId)) continue
    covered.add(dayId)
    rows.push(seatingMapPayload(dayId, base.map_config, base.pricing))
  }
  return rows.length > 0 ? rows : maps
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
        ? matching.map((occurrence) => asPublishScheduleId(occurrence.id))
        : []
      ).filter((value): value is string => Boolean(value)),
    ),
  ]
  if (published.length > 0) return published
  if (occurrences.length >= 2) return []
  return [asPublishScheduleId(id) ?? null]
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
