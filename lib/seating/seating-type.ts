import { pointInPolygon } from "@/lib/seating/venue-map-lod"
import {
  isSellableElement,
  parseSeatingType,
  seatingTypeFromLayoutType,
  type InteractiveVenueMap,
  type SeatingType,
  type VenueMapZone,
  type VenueZoneLayoutType,
} from "@/types/venue-map"

export type { SeatingType }

/** Vista de dominio del sector. El persistente del mapa es `VenueMapZone`. */
export type EventSector = {
  id: string
  name: string
  seatingType: SeatingType
  price?: number
  capacity?: number
}

export type SeatingTypeInput = {
  seatingType?: unknown
  seating_type?: unknown
  layoutType?: unknown
  layout_type?: unknown
  type?: unknown
  kind?: unknown
  seats?: unknown
  tables?: unknown
}

const RESERVED_ELEMENT_TYPES = new Set([
  "vip_chair",
  "round_table",
  "long_table",
  "vip_box",
])

function hasListedPlaces(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

/** Declared modality. Does not look at live furniture. */
export function resolveSeatingType(input: SeatingTypeInput): SeatingType {
  const explicit = parseSeatingType(input.seatingType ?? input.seating_type)
  if (explicit) return explicit

  const layout = String(input.layoutType ?? input.layout_type ?? "").trim()
  if (layout === "general") return "GENERAL"
  if (layout === "numbered_seat" || layout === "table_combo") return "RESERVED"

  const type = String(input.type ?? "").trim()
  if (
    type === "standing_zone" ||
    type === "general_admission" ||
    type === "general"
  ) {
    return "GENERAL"
  }
  if (
    type === "reserved_seating" ||
    type === "numbered" ||
    RESERVED_ELEMENT_TYPES.has(type)
  ) {
    return "RESERVED"
  }

  const kind = String(input.kind ?? "").trim()
  if (kind === "ga" || kind === "general") return "GENERAL"
  if (kind === "numbered") return "RESERVED"

  if (hasListedPlaces(input.seats) || hasListedPlaces(input.tables)) {
    return "RESERVED"
  }
  return "GENERAL"
}

export function hasAssignedReservedPlaces(
  map: InteractiveVenueMap | null | undefined,
  sectorId?: string | null,
): boolean {
  const id = (sectorId ?? "").trim()
  if (!id || !map) return false

  const sector = map.sectors.find((item) => item.id === id)
  if (sector?.seats.some((seat) => seat.status !== "blocked")) return true

  for (const element of map.elements ?? []) {
    if (!isSellableElement(element) || element.type === "standing_zone") {
      continue
    }
    const belongs =
      element.id === id ||
      element.groupId === id ||
      element.zoneId === id
    if (!belongs) continue
    if (element.sellMode === "group") return true
    if (element.seats.some((seat) => seat.status !== "blocked")) return true
    if ((element.chairCount || 0) > 0 || (element.capacity || 0) > 0) {
      return true
    }
  }

  const zone = map.zones.find((item) => item.id === id)
  if (zone && resolveSeatingType(zone) === "RESERVED") {
    return (map.elements ?? []).some(
      (element) =>
        isSellableElement(element) &&
        element.type !== "standing_zone" &&
        pointInPolygon({ x: element.x, y: element.y }, zone.polygon),
    )
  }
  return false
}

/**
 * Buyer-facing modality. A RESERVED sector without mesas/sillas
 * behaves as GENERAL so checkout never opens an empty seat modal.
 */
export function resolveEffectiveSeatingType(
  input: SeatingTypeInput & { id?: string | null },
  map?: InteractiveVenueMap | null,
): SeatingType {
  const declared = resolveSeatingType(input)
  if (declared === "GENERAL") return "GENERAL"
  if (!map) return "RESERVED"
  const sectorId = (input.id ?? "").trim()
  if (!sectorId) return "RESERVED"
  return hasAssignedReservedPlaces(map, sectorId) ? "RESERVED" : "GENERAL"
}

export function zoneUsesSeatModal(
  zone: Pick<VenueMapZone, "id" | "seatingType" | "layoutType">,
  map?: InteractiveVenueMap | null,
): boolean {
  return resolveEffectiveSeatingType(zone, map) === "RESERVED"
}

export function sectorDisplayName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim()
  if (!trimmed) return "Sector"
  return /^sector\b/i.test(trimmed) ? trimmed : `Sector ${trimmed}`
}

export function generalAdmissionLabel(sectorName: string | null | undefined): string {
  return `${sectorDisplayName(sectorName)} - Entrada General`
}

export function reservedPlaceLabel(input: {
  sectorName: string | null | undefined
  tableName?: string | null
  seatLabel?: string | null
  row?: string | null
  number?: number | null
}): string {
  const sector = sectorDisplayName(input.sectorName)
  const table = input.tableName?.trim() || ""
  const seat = input.seatLabel?.trim() || ""
  const row = input.row?.trim() || ""
  const number =
    typeof input.number === "number" && Number.isFinite(input.number) && input.number > 0
      ? Math.floor(input.number)
      : null

  const chair =
    seat ||
    (number != null ? `Silla ${number}` : "")

  if (table && chair) {
    const chairPart = /^(silla|butaca)\b/i.test(chair) ? chair : `Silla ${chair}`
    return `${sector} - ${table}, ${chairPart}`
  }
  if (table) return `${sector} - ${table}`
  if (row && chair) return `${sector} - Fila ${row}, ${chair}`
  if (chair) return `${sector} - ${chair}`
  return sector
}

export function seatingFieldsForLayoutType(
  layoutType: VenueZoneLayoutType,
): Pick<
  VenueMapZone,
  "seatingType" | "layoutType" | "sellMode" | "priceMode" | "labelPrefix"
> {
  if (layoutType === "general") {
    return {
      seatingType: "GENERAL",
      layoutType: "general",
      sellMode: "per_seat",
      priceMode: "per_person",
      labelPrefix: "Campo ",
    }
  }
  if (layoutType === "numbered_seat") {
    return {
      seatingType: "RESERVED",
      layoutType: "numbered_seat",
      sellMode: "per_seat",
      priceMode: "per_person",
      labelPrefix: "Butaca ",
    }
  }
  return {
    seatingType: "RESERVED",
    layoutType: "table_combo",
    sellMode: "group",
    priceMode: "closed_unit",
    labelPrefix: "Mesa ",
  }
}

export type SectorModalityIssue = {
  sectorId: string
  sectorName: string
  message: string
}

function generalPriceAndCapacityOk(price: unknown, capacity: unknown): boolean {
  const amount = Number(price)
  const cupo = Math.floor(Number(capacity))
  return Number.isFinite(amount) && amount >= 0 && Number.isFinite(cupo) && cupo >= 1
}

export function validateSectorModalities(
  map: InteractiveVenueMap | null | undefined,
): SectorModalityIssue[] {
  if (!map) return []
  const issues: SectorModalityIssue[] = []
  const seen = new Set<string>()

  for (const zone of map.zones ?? []) {
    seen.add(zone.id)
    const seatingType = resolveSeatingType(zone)
    if (seatingType === "GENERAL") {
      if (!generalPriceAndCapacityOk(zone.price, zone.capacity)) {
        issues.push({
          sectorId: zone.id,
          sectorName: zone.name,
          message: `El sector general ${zone.name} necesita precio y capacidad.`,
        })
      }
      continue
    }
    if (!hasAssignedReservedPlaces(map, zone.id)) {
      issues.push({
        sectorId: zone.id,
        sectorName: zone.name,
        message: `El sector reservado ${zone.name} necesita al menos una mesa o silla antes de publicar.`,
      })
    }
  }

  for (const element of map.elements ?? []) {
    if (!isSellableElement(element)) continue
    if (seen.has(element.id) || (element.groupId && seen.has(element.groupId))) {
      continue
    }
    if (resolveSeatingType(element) !== "GENERAL") continue
    if (!generalPriceAndCapacityOk(element.price, element.capacity)) {
      issues.push({
        sectorId: element.id,
        sectorName: element.sectorName || element.label,
        message: `El sector general ${element.sectorName || element.label} necesita precio y capacidad.`,
      })
    }
  }

  return issues
}
