import { collectLiveSeatingSectorIds } from "@/lib/events/sanitize-ticket-tiers"
import {
  layoutTypeForMapSectorId,
  priceGroupSectorId,
} from "@/lib/seating/venue-map-pricing"
import {
  hasInteractiveVenueMap,
  venueMapHasInventory,
} from "@/lib/seating/venue-map-geometry"
import { listVenuePriceGroups } from "@/lib/seating/venue-price-groups"
import type { Json } from "@/types/database"
import {
  emptyVenueMap,
  parseVenueMap,
  serializeVenueMap,
  type InteractiveVenueMap,
} from "@/types/venue-map"

export type DraftMapTicket = {
  id: string
  name: string
  description: string
  price: number
  stock: number
  minOrder: number
  maxOrder: number
  startDate?: string
  endDate?: string
  source: "map" | "general" | string
  sectorId: string
  layoutType: string
}

export function isMapDraftTicket(ticket: {
  source?: unknown
  sectorId?: unknown
}): boolean {
  if (ticket.source === "general") return false
  if (ticket.source === "map") return true
  return typeof ticket.sectorId === "string" && ticket.sectorId.trim().length > 0
}

export function draftSeatingMapToVenueMap(raw: unknown): InteractiveVenueMap {
  return parseVenueMap(normalizeSeatingRaw(raw))
}

export function toDraftSeatingMap(raw: unknown) {
  const record = seatingRecord(raw)
  const parsed = parseVenueMap(normalizeSeatingRaw(raw))
  const url =
    parsed.backgroundImage ||
    (typeof record.url === "string" ? record.url.trim() : "") ||
    ""
  return {
    ...parsed,
    backgroundImage: parsed.backgroundImage || url || null,
    url,
    sectors:
      parsed.sectors.length > 0
        ? parsed.sectors
        : Array.isArray(record.sectors)
          ? record.sectors
          : [],
  }
}

export function emptyDraftSeatingMap() {
  return toDraftSeatingMap(emptyVenueMap())
}

export function ticketsFromVenueMap(map: InteractiveVenueMap): DraftMapTicket[] {
  return listVenuePriceGroups(map).map((group) => {
    const sectorId = priceGroupSectorId(group)
    const layoutType = layoutTypeForMapSectorId(map, sectorId) ?? "numbered_seat"
    return {
      id: `map:${sectorId}`,
      name: group.name.trim() || "Sector",
      description: group.priceHint,
      price: Math.max(0, Number(group.price) || 0),
      stock: Math.max(0, Number(group.count) || 0),
      minOrder: 1,
      maxOrder: 10,
      source: "map",
      sectorId,
      layoutType,
    }
  })
}

export function mergeDraftTicketsWithMap<T extends DraftMapTicketLike>(
  current: T[],
  map: InteractiveVenueMap,
): T[] {
  const generals = current.filter((ticket) => !isMapDraftTicket(ticket))
  if (!venueMapHasInventory(map)) return generals

  const existingBySector = new Map<string, T>()
  for (const ticket of current) {
    if (!isMapDraftTicket(ticket)) continue
    const sectorId = String(ticket.sectorId ?? "").trim()
    if (sectorId) existingBySector.set(sectorId, ticket)
  }

  const fromMap = ticketsFromVenueMap(map).map((ticket) => {
    const previous = existingBySector.get(ticket.sectorId)
    const id = previous?.id?.trim()
    return {
      ...ticket,
      ...(previous ?? {}),
      ...ticket,
      id: id && !id.startsWith("map:") ? id : ticket.id,
      minOrder: previous?.minOrder ?? ticket.minOrder,
      maxOrder: previous?.maxOrder ?? ticket.maxOrder,
      startDate: previous?.startDate ?? "",
      endDate: previous?.endDate ?? "",
      description: previous?.description?.trim()
        ? previous.description
        : ticket.description,
    } as T
  })

  return [...generals, ...fromMap]
}

export function publishVenueMapFromDraft(seating: unknown): {
  venue_map?: Json
  has_seating_plan: boolean
} {
  const map = draftSeatingMapToVenueMap(seating)
  if (!hasInteractiveVenueMap(map) && !venueMapHasInventory(map)) {
    return { has_seating_plan: false }
  }
  return {
    venue_map: serializeVenueMap(map) as unknown as Json,
    has_seating_plan: venueMapHasInventory(map),
  }
}

type DraftMapTicketLike = {
  id?: string
  name?: string
  description?: string
  price?: number
  stock?: number
  minOrder?: number
  maxOrder?: number
  startDate?: string
  endDate?: string
  source?: string
  sectorId?: string
  layoutType?: string
  validDayIds?: string[]
}

export type DraftMapPricing = {
  sectorPrices: Record<string, number>
  blockedSeatIds: string[]
}

export type DraftSeatingMapInstance = {
  dateId: string
  mapConfig: ReturnType<typeof toDraftSeatingMap>
  pricing: DraftMapPricing
}

export function emptyDraftMapPricing(): DraftMapPricing {
  return { sectorPrices: {}, blockedSeatIds: [] }
}

export function extractDraftMapPricing(
  map: InteractiveVenueMap,
): DraftMapPricing {
  const sectorPrices: Record<string, number> = {}
  for (const group of listVenuePriceGroups(map)) {
    const sectorId = priceGroupSectorId(group)
    if (!sectorId) continue
    sectorPrices[sectorId] = Math.max(0, Number(group.price) || 0)
  }
  const blockedSeatIds: string[] = []
  for (const sector of map.sectors ?? []) {
    for (const seat of sector.seats ?? []) {
      if (seat.status === "blocked" && seat.id) {
        blockedSeatIds.push(seat.id)
      }
    }
  }
  return { sectorPrices, blockedSeatIds }
}

export function parseDraftMapPricing(raw: unknown): DraftMapPricing {
  const record = seatingRecord(raw)
  const sectorPrices: Record<string, number> = {}
  const pricesRaw = record.sectorPrices
  if (pricesRaw && typeof pricesRaw === "object" && !Array.isArray(pricesRaw)) {
    for (const [key, value] of Object.entries(pricesRaw)) {
      const id = key.trim()
      const price = Number(value)
      if (!id || !Number.isFinite(price)) continue
      sectorPrices[id] = Math.max(0, price)
    }
  }
  const blockedSeatIds = Array.isArray(record.blockedSeatIds)
    ? record.blockedSeatIds
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id) => id.trim())
    : []
  return { sectorPrices, blockedSeatIds }
}

export function applyDraftMapPricing(
  rawConfig: unknown,
  pricing: unknown,
): InteractiveVenueMap {
  const map = draftSeatingMapToVenueMap(rawConfig)
  const next = parseDraftMapPricing(pricing)
  const hasPrices = Object.keys(next.sectorPrices).length > 0
  const blocked = new Set(next.blockedSeatIds)
  if (!hasPrices && blocked.size === 0) return map
  return {
    ...map,
    sectors: map.sectors.map((sector) => ({
      ...sector,
      price: hasPrices
        ? (next.sectorPrices[sector.id] ?? sector.price)
        : sector.price,
      seats: sector.seats.map((seat) => ({
        ...seat,
        status: blocked.size === 0
          ? seat.status
          : blocked.has(seat.id)
            ? "blocked"
            : seat.status === "blocked"
              ? "available"
              : seat.status,
      })),
    })),
  }
}

export function seatingInstanceToVenueMap(
  instance: { mapConfig?: unknown; pricing?: unknown } | null | undefined,
): InteractiveVenueMap {
  if (!instance) return draftSeatingMapToVenueMap(emptyVenueMap())
  return applyDraftMapPricing(instance.mapConfig, instance.pricing)
}

export function hasDraftSeatingMapContent(raw: unknown): boolean {
  const map = draftSeatingMapToVenueMap(raw)
  return hasInteractiveVenueMap(map) || venueMapHasInventory(map)
}

export function draftHasActiveSeatingMap(draft: {
  seatingMaps?: Array<{ mapConfig?: unknown }> | null
  seatingMap?: unknown
}): boolean {
  if (hasDraftSeatingMapContent(draft.seatingMap)) return true
  return (draft.seatingMaps ?? []).some((item) =>
    hasDraftSeatingMapContent(item.mapConfig),
  )
}

export function collectDraftLiveSectorIds(draft: {
  seatingMaps?: Array<{ mapConfig?: unknown }> | null
  seatingMap?: unknown
}): Set<string> {
  const ids = new Set<string>()
  for (const raw of [
    ...(draft.seatingMaps ?? []).map((item) => item.mapConfig),
    draft.seatingMap,
  ]) {
    for (const id of collectLiveSeatingSectorIds({ venueMap: raw })) {
      ids.add(id)
    }
  }
  return ids
}

type SanitizableDraftTicket = {
  source?: string
  sectorId?: string
  seatingSectorId?: string | null
  seating_sector_id?: string | null
  layoutType?: string
}

function firstNonEmptySectorId(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") continue
    const id = value.trim()
    if (id) return id
  }
  return ""
}

export function ticketSeatingSectorRef(ticket: {
  source?: unknown
  sectorId?: unknown
  seatingSectorId?: unknown
  seating_sector_id?: unknown
}): string {
  if (ticket.source === "general") return ""
  const persistId = firstNonEmptySectorId(
    ticket.seating_sector_id,
    ticket.seatingSectorId,
  )
  if (persistId) return persistId
  if (ticket.source === "map") {
    return firstNonEmptySectorId(ticket.sectorId)
  }
  return ""
}

export function isOrphanMapTicket(
  ticket: {
    source?: unknown
    sectorId?: unknown
    seatingSectorId?: unknown
    seating_sector_id?: unknown
  },
  liveSectorIds: Iterable<string>,
): boolean {
  const seatingSectorId = ticketSeatingSectorRef(ticket)
  if (seatingSectorId == null || seatingSectorId === "") return false
  if (ticket.source === "general") return false
  const live =
    liveSectorIds instanceof Set
      ? liveSectorIds
      : new Set([...liveSectorIds].filter((id) => id.trim().length > 0))
  return !live.has(seatingSectorId)
}

export function garbageCollectDraftTickets<T extends SanitizableDraftTicket>(
  tickets: T[],
  liveSectorIds: Iterable<string>,
): T[] {
  const validSectorIds = new Set(
    [...liveSectorIds].filter((id) => id.trim().length > 0),
  )
  return tickets.filter((ticket) => {
    const seating_sector_id = ticketSeatingSectorRef(ticket)
    return !seating_sector_id || validSectorIds.has(seating_sector_id)
  })
}

export function sanitizeDraftTicketsForPersist<T extends SanitizableDraftTicket>(
  tickets: T[],
  options: { mapActive: boolean; liveSectorIds: Iterable<string> },
): T[] {
  const live = new Set(
    [...options.liveSectorIds].filter((id) => id.trim().length > 0),
  )
  const collected = garbageCollectDraftTickets(
    tickets,
    options.mapActive ? live : [],
  )
  return collected.map((ticket) => {
    const explicitGeneral = ticket.source === "general"
    if (!options.mapActive || explicitGeneral) {
      return {
        ...ticket,
        source: ticket.source === "map" ? "general" : ticket.source || "general",
        sectorId: "",
        seatingSectorId: null,
        seating_sector_id: null,
      }
    }
    return ticket
  })
}

export function sanitizeEventDraftForPersist<
  T extends {
    tickets?: SanitizableDraftTicket[]
    extras?: SanitizableDraftTicket[]
    seatingMaps?: Array<{ mapConfig?: unknown }> | null
    seatingMap?: unknown
  },
>(draft: T): T {
  const mapActive = draftHasActiveSeatingMap(draft)
  const liveSectorIds = collectDraftLiveSectorIds(draft)
  return {
    ...draft,
    tickets: sanitizeDraftTicketsForPersist(draft.tickets ?? [], {
      mapActive,
      liveSectorIds,
    }),
    extras: sanitizeDraftTicketsForPersist(draft.extras ?? [], {
      mapActive: false,
      liveSectorIds: [],
    }),
  }
}

function hasDraftMapContent(raw: unknown): boolean {
  return hasDraftSeatingMapContent(raw)
}

export function configuredDraftSeatingMapDateIds(
  maps: Array<{ dateId?: string; mapConfig?: unknown }> | null | undefined,
): string[] {
  if (!Array.isArray(maps)) return []
  const ids: string[] = []
  for (const item of maps) {
    const dateId = typeof item?.dateId === "string" ? item.dateId.trim() : ""
    if (!dateId || !hasDraftSeatingMapContent(item.mapConfig)) continue
    if (!ids.includes(dateId)) ids.push(dateId)
  }
  return ids
}

function deepCloneJson<T>(value: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value)
    } catch {
      // Fall through to JSON when the value is not structured-cloneable.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T
}

export function cloneDraftSeatingMapInstance(
  source: DraftSeatingMapInstance,
  targetDateId: string,
): DraftSeatingMapInstance {
  const cloned = deepCloneJson({
    mapConfig: source.mapConfig,
    pricing: source.pricing,
  })
  return {
    dateId: targetDateId,
    mapConfig: toDraftSeatingMap(cloned.mapConfig),
    pricing: parseDraftMapPricing(cloned.pricing),
  }
}

export function parseDraftSeatingMaps(
  rawMaps: unknown,
  legacyMap: unknown,
  firstDateId = "",
): DraftSeatingMapInstance[] {
  const instances: DraftSeatingMapInstance[] = []
  if (Array.isArray(rawMaps)) {
    for (const item of rawMaps) {
      const record = seatingRecord(item)
      const dateId =
        typeof record.dateId === "string" ? record.dateId.trim() : ""
      const mapConfig = toDraftSeatingMap(record.mapConfig ?? record)
      instances.push({
        dateId,
        mapConfig,
        pricing: parseDraftMapPricing(record.pricing),
      })
    }
  }
  if (instances.length > 0) return instances
  if (!hasDraftMapContent(legacyMap)) return []
  const mapConfig = toDraftSeatingMap(legacyMap)
  return [
    {
      dateId: firstDateId,
      mapConfig,
      pricing: extractDraftMapPricing(draftSeatingMapToVenueMap(mapConfig)),
    },
  ]
}

export function upsertDraftSeatingMapInstance(
  current: DraftSeatingMapInstance[],
  dateId: string,
  map: InteractiveVenueMap,
): DraftSeatingMapInstance[] {
  const instance: DraftSeatingMapInstance = {
    dateId,
    mapConfig: toDraftSeatingMap(map),
    pricing: extractDraftMapPricing(map),
  }
  const index = current.findIndex((item) => item.dateId === dateId)
  if (index < 0) return [...current, instance]
  return current.map((item, itemIndex) =>
    itemIndex === index ? instance : item,
  )
}

export function primaryDraftSeatingMap(
  maps: DraftSeatingMapInstance[],
  legacy?: unknown,
) {
  const first = maps.find((item) => hasDraftMapContent(item.mapConfig))
  if (first) return seatingInstanceToVenueMap(first)
  return draftSeatingMapToVenueMap(legacy)
}

/** Draft JSON for the editor. Keeps stub sectors that parseVenueMap would drop. */
export function primaryDraftSeatingMapRaw(
  maps: DraftSeatingMapInstance[],
  legacy?: unknown,
) {
  const first =
    maps.find((item) => hasDraftMapContent(item.mapConfig)) ?? maps[0]
  if (first) return first.mapConfig
  return legacy
}

function mapTicketHasDayBinding(ticket: DraftMapTicketLike): boolean {
  if ((ticket.validDayIds ?? []).some((id) => String(id).trim())) return true
  const id = String(ticket.id ?? "")
  return /^map:[0-9a-f-]+:/i.test(id)
}

function mapTicketBelongsToDay(
  ticket: DraftMapTicketLike,
  dateId: string,
): boolean {
  if (!dateId) return true
  if ((ticket.validDayIds ?? []).includes(dateId)) return true
  if (String(ticket.id ?? "").startsWith(`map:${dateId}:`)) return true
  return !mapTicketHasDayBinding(ticket)
}

export function mergeDraftTicketsWithDayMap<T extends DraftMapTicketLike>(
  current: T[],
  map: InteractiveVenueMap,
  dateId: string,
): T[] {
  const generals = current.filter((ticket) => !isMapDraftTicket(ticket))
  const otherDays = dateId
    ? current.filter(
        (ticket) =>
          isMapDraftTicket(ticket) && !mapTicketBelongsToDay(ticket, dateId),
      )
    : []
  if (!venueMapHasInventory(map)) return [...generals, ...otherDays]

  const existingBySector = new Map<string, T>()
  for (const ticket of current) {
    if (!isMapDraftTicket(ticket)) continue
    if (dateId && !mapTicketBelongsToDay(ticket, dateId)) continue
    const sectorId = String(ticket.sectorId ?? "").trim()
    if (sectorId) existingBySector.set(sectorId, ticket)
  }

  const fromMap = ticketsFromVenueMap(map).map((ticket) => {
    const previous = existingBySector.get(ticket.sectorId)
    const liveId = previous?.id?.trim()
    const keepLive = Boolean(liveId && !liveId.startsWith("map:"))
    return {
      ...ticket,
      ...(previous ?? {}),
      ...ticket,
      id: keepLive
        ? liveId
        : dateId
          ? `map:${dateId}:${ticket.sectorId}`
          : ticket.id,
      minOrder: previous?.minOrder ?? ticket.minOrder,
      maxOrder: previous?.maxOrder ?? ticket.maxOrder,
      startDate: previous?.startDate ?? "",
      endDate: previous?.endDate ?? "",
      validDayIds: dateId ? [dateId] : (previous?.validDayIds ?? []),
      description: previous?.description?.trim()
        ? previous.description
        : ticket.description,
    } as T
  })

  return [...generals, ...otherDays, ...fromMap]
}

function seatingRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  return raw as Record<string, unknown>
}

function normalizeSeatingRaw(raw: unknown): unknown {
  const record = seatingRecord(raw)
  if (Object.keys(record).length === 0) return raw
  const url = typeof record.url === "string" ? record.url.trim() : ""
  if (!url || record.backgroundImage || record.background_image) return record
  return { ...record, backgroundImage: url }
}
