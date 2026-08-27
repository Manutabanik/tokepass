import { pruneDraftScheduleBindings } from "@/lib/events/draft-schedule-bindings"
import type { EventDraftV2ScheduleDay } from "@/lib/events/draft-schedule-slots-v2"
import { collectLiveSeatingSectorIds } from "@/lib/events/sanitize-ticket-tiers"
import {
  collectNamedMapSectorIds,
  healTicketsSeatingSectors,
  normalizeMapSectorLabel,
  stabilizeVenueMapIds,
  type NamedMapSector,
} from "@/lib/seating/stabilize-venue-map-ids"
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
  seatingSectorId?: unknown
  seating_sector_id?: unknown
}): boolean {
  if (ticket.source === "general") return false
  if (ticket.source === "map") return true
  return ticketSeatingSectorRef(ticket).length > 0
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

function claimPreviousMapTicket<T extends DraftMapTicketLike>(
  ticket: DraftMapTicketLike,
  existingBySector: Map<string, T>,
  existingByName: Map<string, T>,
): T | undefined {
  const sectorId = String(ticket.sectorId ?? "").trim()
  const byId = sectorId ? existingBySector.get(sectorId) : undefined
  if (byId) {
    existingBySector.delete(sectorId)
    const name = normalizeMapSectorLabel(byId.name)
    if (name) existingByName.delete(name)
    return byId
  }
  const name = normalizeMapSectorLabel(ticket.name)
  const byName = name ? existingByName.get(name) : undefined
  if (!byName) return undefined
  existingByName.delete(name)
  const previousId = String(byName.sectorId ?? "").trim()
  if (previousId) existingBySector.delete(previousId)
  return byName
}

export function mergeDraftTicketsWithMap<T extends DraftMapTicketLike>(
  current: T[],
  map: InteractiveVenueMap,
): T[] {
  const generals = current.filter((ticket) => !isMapDraftTicket(ticket))
  if (!venueMapHasInventory(map)) return generals

  const existingBySector = new Map<string, T>()
  const existingByName = new Map<string, T>()
  for (const ticket of current) {
    if (!isMapDraftTicket(ticket)) continue
    const sectorId = String(ticket.sectorId ?? "").trim()
    if (sectorId) existingBySector.set(sectorId, ticket)
    const name = normalizeMapSectorLabel(ticket.name)
    if (name && !existingByName.has(name)) existingByName.set(name, ticket)
  }

  const fromMap = ticketsFromVenueMap(map).map((ticket) => {
    const previous = claimPreviousMapTicket(
      ticket,
      existingBySector,
      existingByName,
    )
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
  slotId?: string
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

export function collectDraftLiveSectors(draft: {
  seatingMaps?: Array<{ mapConfig?: unknown }> | null
  seatingMap?: unknown
}): NamedMapSector[] {
  const byId = new Map<string, string>()
  for (const raw of [
    ...(draft.seatingMaps ?? []).map((item) => item.mapConfig),
    draft.seatingMap,
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

export function collectDraftLiveSectorIds(draft: {
  seatingMaps?: Array<{ mapConfig?: unknown }> | null
  seatingMap?: unknown
}): Set<string> {
  return new Set(collectDraftLiveSectors(draft).map((sector) => sector.id))
}

type SanitizableDraftTicket = {
  source?: string
  sectorId?: string
  seatingSectorId?: string | null
  seating_sector_id?: string | null
  layoutType?: string
  slotId?: string
  validDayIds?: string[]
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
  options: {
    mapActive: boolean
    liveSectorIds: Iterable<string>
    liveSectors?: readonly NamedMapSector[]
  },
): T[] {
  const live = new Set(
    [...options.liveSectorIds].filter((id) => id.trim().length > 0),
  )
  const healed = options.mapActive
    ? healTicketsSeatingSectors(tickets, options.liveSectors ?? [])
    : tickets
  const collected = options.mapActive
    ? garbageCollectDraftTickets(healed, live)
    : healed
  return collected.map((ticket) => {
    const explicitGeneral = ticket.source === "general"
    if (!options.mapActive || explicitGeneral) {
      return {
        ...ticket,
        source: ticket.source === "map" ? "general" : ticket.source || "general",
        sectorId: "",
        seatingSectorId: null,
        seating_sector_id: null,
        layoutType: "general",
      }
    }
    return ticket
  })
}

export function sanitizeEventDraftForPersist<
  T extends {
    tickets?: SanitizableDraftTicket[]
    extras?: SanitizableDraftTicket[]
    seatingMaps?: Array<{ mapConfig?: unknown; dateId?: string }> | null
    seatingMap?: unknown
    schedule?: EventDraftV2ScheduleDay[]
  },
>(draft: T): T {
  const pruned = pruneDraftScheduleBindings(draft)
  const mapActive = draftHasActiveSeatingMap(pruned)
  const liveSectors = collectDraftLiveSectors(pruned)
  const liveSectorIds = liveSectors.map((sector) => sector.id)
  return {
    ...pruned,
    tickets: sanitizeDraftTicketsForPersist(pruned.tickets ?? [], {
      mapActive,
      liveSectorIds,
      liveSectors,
    }),
    extras: sanitizeDraftTicketsForPersist(pruned.extras ?? [], {
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

export function mergeDraftTicketsWithScheduleMaps<T extends DraftMapTicketLike>(
  current: T[],
  currentMap: InteractiveVenueMap,
  currentDateId: string,
  scheduleDayIds: readonly string[],
  maps: Array<{ dateId?: string; mapConfig?: unknown }> = [],
): T[] {
  const dayIds = scheduleDayIds.map((id) => id.trim()).filter(Boolean)
  const otherConfigured = maps.some(
    (item) =>
      item.dateId &&
      item.dateId !== currentDateId &&
      hasDraftSeatingMapContent(item.mapConfig),
  )
  if (dayIds.length >= 2 && !otherConfigured) {
    let next = current
    for (const dayId of dayIds) {
      next = mergeDraftTicketsWithDayMap(next, currentMap, dayId)
    }
    return next
  }
  return mergeDraftTicketsWithDayMap(current, currentMap, currentDateId)
}

export function upsertDraftSeatingMapInstance(
  current: DraftSeatingMapInstance[],
  dateId: string,
  map: InteractiveVenueMap,
): DraftSeatingMapInstance[] {
  const previous = current.find((item) => item.dateId === dateId)
  const aliases = current
    .filter(
      (item) =>
        item.dateId !== dateId && hasDraftSeatingMapContent(item.mapConfig),
    )
    .map((item) => draftSeatingMapToVenueMap(item.mapConfig))
  const stable = stabilizeVenueMapIds(
    previous ? draftSeatingMapToVenueMap(previous.mapConfig) : null,
    map,
    aliases,
  )
  const instance: DraftSeatingMapInstance = {
    dateId,
    mapConfig: toDraftSeatingMap(stable),
    pricing: extractDraftMapPricing(stable),
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

export function seatedDraftTicketBelongsToDay(
  ticket: {
    id?: string
    source?: unknown
    sectorId?: unknown
    seatingSectorId?: unknown
    seating_sector_id?: unknown
    slotId?: string
    validDayIds?: string[]
  },
  dateId: string,
): boolean {
  if (!ticketSeatingSectorRef(ticket)) return false
  const day = dateId.trim()
  if (!day) return true
  if ((ticket.validDayIds ?? []).some((id) => String(id).trim() === day)) {
    return true
  }
  if ((ticket.slotId ?? "").trim() === day) return true
  return String(ticket.id ?? "").startsWith(`map:${day}:`)
}

export function removeSeatedDraftTicketsForDay<T extends DraftMapTicketLike>(
  tickets: T[],
  dateId: string,
): T[] {
  return tickets.filter(
    (ticket) => !seatedDraftTicketBelongsToDay(ticket, dateId),
  )
}

export function removeDraftSeatingMapInstance(
  maps: DraftSeatingMapInstance[],
  dateId: string,
): DraftSeatingMapInstance[] {
  const day = dateId.trim()
  return maps.filter((item) => item.dateId !== day)
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
  const existingByName = new Map<string, T>()
  for (const ticket of current) {
    if (!isMapDraftTicket(ticket)) continue
    if (dateId && !mapTicketBelongsToDay(ticket, dateId)) continue
    const sectorId = String(ticket.sectorId ?? "").trim()
    if (sectorId) existingBySector.set(sectorId, ticket)
    const name = normalizeMapSectorLabel(ticket.name)
    if (name && !existingByName.has(name)) existingByName.set(name, ticket)
  }

  const fromMap = ticketsFromVenueMap(map).map((ticket) => {
    const previous = claimPreviousMapTicket(
      ticket,
      existingBySector,
      existingByName,
    )
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
      slotId: dateId || previous?.slotId || "",
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
