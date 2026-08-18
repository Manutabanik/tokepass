import type { EventFormValues } from "@/lib/validations/event-form"

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
