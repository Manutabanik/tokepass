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
