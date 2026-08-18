import type { EventFormValues } from "@/lib/validations/event-form"
import { parseVenueMap } from "@/types/venue-map"

/** Valor sentinela del dropdown. El form guarda `null`. */
export const UNASSIGNED_SECTOR_VALUE = "__none__"
export const UNASSIGNED_SECTOR_LABEL = "Ninguno / Inventario Libre (Recomendado)"

function asPositiveInt(value: unknown): number {
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

export type LogicalSector = {
  id: string
  name: string
  type: "general_admission" | "reserved_seating"
  capacity: number
  rows?: number | null
  seatsPerRow?: number | null
}

export function slugLogicalSectorName(name: string): string {
  const slug = name
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "sector"
}

export function logicalSectorId(
  name: string,
  existingId?: string | null,
): string {
  const current = existingId?.trim()
  if (current) return current
  return `general:${slugLogicalSectorName(name)}`
}

export function normalizeLogicalSectors(
  zones: EventFormValues["venue"]["zones"] | null | undefined,
): LogicalSector[] {
  if (!Array.isArray(zones)) return []
  return zones.flatMap((zone) => {
    const name = String(zone.name ?? "").trim()
    const capacity = asPositiveInt(zone.capacity)
    if (!name || capacity < 1) return []
    const type =
      zone.type === "reserved_seating"
        ? ("reserved_seating" as const)
        : ("general_admission" as const)
    return [
      {
        id: logicalSectorId(name, zone.id),
        name,
        type,
        capacity,
        rows: zone.rows ?? null,
        seatsPerRow: zone.seatsPerRow ?? null,
      },
    ]
  })
}

export function listGeneralLogicalSectors(
  zones: EventFormValues["venue"]["zones"] | null | undefined,
): LogicalSector[] {
  return normalizeLogicalSectors(zones).filter(
    (zone) => zone.type === "general_admission",
  )
}

function addKey(target: Set<string>, value: unknown) {
  if (typeof value !== "string") return
  const id = value.trim()
  if (id) target.add(id)
}

/** IDs y nombres de sectores que pertenecen al mapa interactivo. */
export function collectVenueMapSectorKeys(venueMap: unknown): {
  ids: Set<string>
  names: Set<string>
} {
  const map = parseVenueMap(venueMap)
  const ids = new Set<string>()
  const names = new Set<string>()

  for (const sector of map.sectors ?? []) {
    addKey(ids, sector.id)
    addKey(names, sector.name?.trim().toLocaleLowerCase("es"))
  }
  for (const zone of map.zones ?? []) {
    addKey(ids, zone.id)
    addKey(names, zone.name?.trim().toLocaleLowerCase("es"))
  }
  for (const element of map.elements ?? []) {
    addKey(ids, element.id)
    addKey(ids, element.groupId)
    addKey(names, element.sectorName?.trim().toLocaleLowerCase("es"))
    addKey(names, element.label?.trim().toLocaleLowerCase("es"))
    addKey(names, element.groupName?.trim().toLocaleLowerCase("es"))
  }

  return { ids, names }
}

export function isMapOwnedLogicalSector(
  sector: Pick<LogicalSector, "id" | "name" | "type">,
  venueMap: unknown,
): boolean {
  if (sector.type === "reserved_seating") return true
  const { ids, names } = collectVenueMapSectorKeys(venueMap)
  if (ids.has(sector.id)) return true
  return names.has(sector.name.trim().toLocaleLowerCase("es"))
}

/** Sectores GA creados por el organizador. Excluye butacas/zonas del mapa. */
export function listAssignableGeneralSectors(
  zones: EventFormValues["venue"]["zones"] | null | undefined,
  venueMap?: unknown,
): LogicalSector[] {
  return listGeneralLogicalSectors(zones).filter(
    (sector) => !isMapOwnedLogicalSector(sector, venueMap),
  )
}

export function assignableGeneralSectorCapacity(
  zones: EventFormValues["venue"]["zones"] | null | undefined,
  venueMap?: unknown,
): number {
  return listAssignableGeneralSectors(zones, venueMap).reduce(
    (sum, zone) => sum + zone.capacity,
    0,
  )
}

export function assignableLogicalSectorIds(
  zones: EventFormValues["venue"]["zones"] | null | undefined,
  venueMap?: unknown,
): string[] {
  return listAssignableGeneralSectors(zones, venueMap).map((zone) => zone.id)
}

export function logicalSectorIds(
  zones: EventFormValues["venue"]["zones"] | null | undefined,
): string[] {
  return normalizeLogicalSectors(zones).map((zone) => zone.id)
}

export function generalLogicalSectorCapacity(
  zones: EventFormValues["venue"]["zones"] | null | undefined,
): number {
  return listGeneralLogicalSectors(zones).reduce(
    (sum, zone) => sum + zone.capacity,
    0,
  )
}

export function findLogicalSector(
  zones: EventFormValues["venue"]["zones"] | null | undefined,
  sectorId: string | null | undefined,
): LogicalSector | null {
  const id = sectorId?.trim()
  if (!id) return null
  return normalizeLogicalSectors(zones).find((zone) => zone.id === id) ?? null
}

/** `-1` = sin zona. El RPC solo liga si el índice es >= 0. */
export function zoneIndexForSectorId(
  zones: readonly Pick<LogicalSector, "id">[],
  sectorId: string | null | undefined,
): number {
  const id = sectorId?.trim()
  if (!id) return -1
  return zones.findIndex((zone) => zone.id === id)
}

export function createBlankLogicalSector(
  existing: EventFormValues["venue"]["zones"] = [],
): NonNullable<EventFormValues["venue"]["zones"]>[number] {
  const used = new Set(
    (existing ?? []).map((zone) => zone.name.trim().toLocaleLowerCase("es")),
  )
  let index = (existing?.length ?? 0) + 1
  let name = index === 1 ? "Pista" : `Sector ${index}`
  while (used.has(name.toLocaleLowerCase("es"))) {
    index += 1
    name = `Sector ${index}`
  }
  return {
    id: logicalSectorId(name),
    name,
    type: "general_admission",
    capacity: 100,
    rows: null,
    seatsPerRow: null,
  }
}
