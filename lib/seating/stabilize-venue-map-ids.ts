import type {
  InteractiveVenueMap,
  VenueMapElement,
  VenueMapSector,
  VenueMapZone,
} from "@/types/venue-map"

export type NamedMapSector = {
  id: string
  name: string
}

export function normalizeMapSectorLabel(
  value: string | null | undefined,
): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(sector|zona|grada)\s+/, "")
    .replace(/\s+/g, " ")
}

export function collectNamedMapSectorIds(
  map: InteractiveVenueMap | null | undefined,
): NamedMapSector[] {
  if (!map) return []
  const seen = new Set<string>()
  const out: NamedMapSector[] = []
  const add = (id: unknown, name: unknown) => {
    const nextId = typeof id === "string" ? id.trim() : ""
    if (!nextId || seen.has(nextId)) return
    seen.add(nextId)
    out.push({
      id: nextId,
      name: typeof name === "string" ? name.trim() : "",
    })
  }
  for (const sector of map.sectors ?? []) add(sector.id, sector.name)
  for (const zone of map.zones ?? []) add(zone.id, zone.name)
  for (const element of map.elements ?? []) {
    add(element.id, element.sectorName || element.label)
    if (element.groupId) {
      add(element.groupId, element.groupName || element.sectorName || element.label)
    }
  }
  return out
}

export function healTicketSeatingSector<
  T extends {
    name?: string | null
    source?: string | null
    sectorId?: string | null
    seatingSectorId?: string | null
    seating_sector_id?: string | null
  },
>(ticket: T, liveSectors: readonly NamedMapSector[]): T {
  if (ticket.source === "general") return ticket
  const persistId =
    (typeof ticket.seating_sector_id === "string"
      ? ticket.seating_sector_id.trim()
      : "") ||
    (typeof ticket.seatingSectorId === "string"
      ? ticket.seatingSectorId.trim()
      : "")
  const draftId =
    ticket.source === "map" && typeof ticket.sectorId === "string"
      ? ticket.sectorId.trim()
      : ""
  const current = persistId || draftId
  if (!current) return ticket
  if (liveSectors.some((sector) => sector.id === current)) return ticket
  const name = normalizeMapSectorLabel(ticket.name)
  if (!name) return ticket
  const matches = liveSectors.filter(
    (sector) => normalizeMapSectorLabel(sector.name) === name,
  )
  if (matches.length !== 1) return ticket
  const match = matches[0]!
  return {
    ...ticket,
    sectorId: match.id,
    seatingSectorId: match.id,
    seating_sector_id: match.id,
  }
}

export function healTicketsSeatingSectors<T extends Parameters<typeof healTicketSeatingSector>[0]>(
  tickets: T[],
  liveSectors: readonly NamedMapSector[],
): T[] {
  if (liveSectors.length === 0) return tickets
  return tickets.map((ticket) => healTicketSeatingSector(ticket, liveSectors))
}

type NamedId = { id: string; name: string }

function catalogByName(items: NamedId[]): Map<string, string> {
  const catalog = new Map<string, string>()
  for (const item of items) {
    const id = item.id.trim()
    const name = normalizeMapSectorLabel(item.name)
    if (!id || !name || catalog.has(name)) continue
    catalog.set(name, id)
  }
  return catalog
}

function resolveStableId(
  incoming: NamedId,
  catalog: Map<string, string>,
  claimed: Set<string>,
  previousIds: Set<string>,
): string {
  const incomingId = incoming.id.trim()
  if (incomingId && previousIds.has(incomingId) && !claimed.has(incomingId)) {
    claimed.add(incomingId)
    return incomingId
  }
  if (incomingId && claimed.has(incomingId) === false && [...catalog.values()].includes(incomingId)) {
    claimed.add(incomingId)
    return incomingId
  }
  const name = normalizeMapSectorLabel(incoming.name)
  const previousId = name ? catalog.get(name) : ""
  if (previousId && !claimed.has(previousId)) {
    claimed.add(previousId)
    return previousId
  }
  if (incomingId) {
    claimed.add(incomingId)
    return incomingId
  }
  return incomingId
}

function remapPrefixedIds<T extends { id: string }>(
  items: T[],
  fromId: string,
  toId: string,
): T[] {
  if (!fromId || fromId === toId) return items
  const prefix = `${fromId}-`
  return items.map((item) =>
    item.id.startsWith(prefix)
      ? { ...item, id: `${toId}-${item.id.slice(prefix.length)}` }
      : item,
  )
}

export function stabilizeVenueMapIds(
  previous: InteractiveVenueMap | null | undefined,
  next: InteractiveVenueMap,
  aliases: InteractiveVenueMap[] = [],
): InteractiveVenueMap {
  const sources = [previous, ...aliases].filter(
    (map): map is InteractiveVenueMap => Boolean(map),
  )
  if (sources.length === 0) return next

  const sectorCatalog = catalogByName(
    sources.flatMap((map) =>
      (map.sectors ?? []).map((sector) => ({ id: sector.id, name: sector.name })),
    ),
  )
  const zoneCatalog = catalogByName(
    sources.flatMap((map) =>
      (map.zones ?? []).map((zone) => ({ id: zone.id, name: zone.name })),
    ),
  )
  const elementCatalog = catalogByName(
    sources.flatMap((map) =>
      (map.elements ?? []).map((element) => ({
        id: element.id,
        name: element.label || element.sectorName,
      })),
    ),
  )
  const groupCatalog = catalogByName(
    sources.flatMap((map) =>
      (map.elements ?? [])
        .filter((element) => element.groupId)
        .map((element) => ({
          id: element.groupId as string,
          name: element.groupName || element.sectorName || element.label,
        })),
    ),
  )

  const claimedSectors = new Set<string>()
  const claimedZones = new Set<string>()
  const claimedElements = new Set<string>()
  const claimedGroups = new Set<string>()
  const previousSectorIds = new Set(
    sources.flatMap((map) => (map.sectors ?? []).map((sector) => sector.id.trim())),
  )
  const previousZoneIds = new Set(
    sources.flatMap((map) => (map.zones ?? []).map((zone) => zone.id.trim())),
  )
  const previousElementIds = new Set(
    sources.flatMap((map) => (map.elements ?? []).map((element) => element.id.trim())),
  )
  const previousGroupIds = new Set(
    sources.flatMap((map) =>
      (map.elements ?? [])
        .map((element) => element.groupId?.trim() ?? "")
        .filter(Boolean),
    ),
  )

  const sectors: VenueMapSector[] = (next.sectors ?? []).map((sector) => {
    const nextId = resolveStableId(
      { id: sector.id, name: sector.name },
      sectorCatalog,
      claimedSectors,
      previousSectorIds,
    )
    return {
      ...sector,
      id: nextId,
      seats: remapPrefixedIds(sector.seats ?? [], sector.id, nextId),
    }
  })

  const zones: VenueMapZone[] = (next.zones ?? []).map((zone) => ({
    ...zone,
    id: resolveStableId(
      { id: zone.id, name: zone.name },
      zoneCatalog,
      claimedZones,
      previousZoneIds,
    ),
  }))

  const elements: VenueMapElement[] = (next.elements ?? []).map((element) => {
    const nextId = resolveStableId(
      { id: element.id, name: element.label || element.sectorName },
      elementCatalog,
      claimedElements,
      previousElementIds,
    )
    const groupId = element.groupId?.trim()
    const stableGroupId = groupId
      ? resolveStableId(
          {
            id: groupId,
            name: element.groupName || element.sectorName || element.label,
          },
          groupCatalog,
          claimedGroups,
          previousGroupIds,
        )
      : element.groupId
    return {
      ...element,
      id: nextId,
      groupId: stableGroupId,
      seats: remapPrefixedIds(element.seats ?? [], element.id, nextId),
    }
  })

  return {
    ...next,
    sectors,
    zones,
    elements,
  }
}
