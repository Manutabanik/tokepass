import type { OrganizerVenue, VenueZoneBlueprint } from "@/app/actions/venues"
import { MAX_TICKETS_PER_PURCHASE } from "@/lib/checkout-limits"
import type {
  SeatStatus,
  UniversalSector,
  UniversalSeat,
  UniversalSeatGroup,
} from "@/lib/seating/universal-seat-types"
import {
  getVenueSeatingItems,
  type VenueSeatingItem,
  type VenueSeatingLayout,
  type VenueSeatingSector,
} from "@/types/venues"

/** Precio por sector; opcionalmente override por fila/grupo. */
export type VenueSectorPriceEntry = {
  price: number
  groupPrices?: Record<string, number>
}

/**
 * Mapa sectorId → precio (número) o { price, groupPrices }.
 * También acepta claves por nombre de sector como fallback.
 */
export type VenuePricingMap = Record<string, number | VenueSectorPriceEntry>

export type VenueUniversalSeatPayload = {
  venueId: string
  venueName: string
  mapImageUrl: string | null
  sectors: UniversalSector[]
}

export type MapVenueToUniversalOptions = {
  /** Estado de ocupación runtime (checkout / preview). */
  occupancyBySeatId?: Record<string, SeatStatus>
  maxPerUser?: number
}

function resolvePrice(
  pricingMap: VenuePricingMap,
  sectorId: string,
  sectorName: string,
  groupId?: string,
): number {
  const entry =
    pricingMap[sectorId] ??
    pricingMap[sectorName] ??
    pricingMap[sectorName.toLowerCase()]

  if (entry == null) return 0
  if (typeof entry === "number") return Math.max(0, entry)

  if (groupId && entry.groupPrices?.[groupId] != null) {
    return Math.max(0, Number(entry.groupPrices[groupId]) || 0)
  }
  return Math.max(0, Number(entry.price) || 0)
}

function mapItemStatus(
  item: VenueSeatingItem,
  occupancyBySeatId?: Record<string, SeatStatus>,
): SeatStatus {
  const override = occupancyBySeatId?.[item.id]
  if (override) return override
  if (item.status === "blocked") return "blocked"
  return "available"
}

function mapItemsToSeats(
  items: VenueSeatingItem[],
  occupancyBySeatId?: Record<string, SeatStatus>,
): UniversalSeat[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    status: mapItemStatus(item, occupancyBySeatId),
  }))
}

function sectorFromLayout(
  sector: VenueSeatingSector,
  pricingMap: VenuePricingMap,
  options?: MapVenueToUniversalOptions,
): UniversalSector {
  const maxPerUser = options?.maxPerUser ?? MAX_TICKETS_PER_PURCHASE
  const basePrice = resolvePrice(pricingMap, sector.id, sector.sector_name)

  if (sector.layout_type === "general") {
    return {
      id: sector.id,
      name: sector.sector_name,
      color: sector.color || "#10b981",
      price: basePrice,
      type: "general",
      maxPerUser,
    }
  }

  const sectorRows = sector.rows ?? []
  const groups: UniversalSeatGroup[] =
    sectorRows.length > 0
      ? sectorRows.map((row) => ({
          id: row.row_id,
          name: row.row_label || `Fila ${row.row_number}`,
          seats: mapItemsToSeats(row.items ?? [], options?.occupancyBySeatId),
        }))
      : [
          {
            id: `${sector.id}-all`,
            name: sector.sector_name,
            seats: mapItemsToSeats(
              getVenueSeatingItems(sector),
              options?.occupancyBySeatId,
            ),
          },
        ]

  // Precio "desde": mínimo entre grupos con override o el base.
  const groupPrices = groups.map((group) =>
    resolvePrice(pricingMap, sector.id, sector.sector_name, group.id),
  )
  const fromPrice = Math.min(basePrice, ...groupPrices)

  return {
    id: sector.id,
    name: sector.sector_name,
    color: sector.color || "#f97316",
    price: Number.isFinite(fromPrice) ? fromPrice : basePrice,
    type: "numbered",
    groups,
  }
}

function sectorFromZoneBlueprint(
  zone: VenueZoneBlueprint,
  index: number,
  pricingMap: VenuePricingMap,
  options?: MapVenueToUniversalOptions,
): UniversalSector {
  const id = `zone-${index}-${zone.name.trim().toLowerCase().replace(/\s+/g, "-") || index}`
  const price = resolvePrice(pricingMap, id, zone.name)
  const maxPerUser = options?.maxPerUser ?? MAX_TICKETS_PER_PURCHASE

  if (zone.type === "general_admission") {
    return {
      id,
      name: zone.name,
      color: "#10b981",
      price,
      type: "general",
      maxPerUser,
    }
  }

  // Reserved seating sin layout detallado → grupos sintéticos por fila.
  const rows = Math.max(1, Number(zone.rows) || 1)
  const seatsPerRow = Math.max(1, Number(zone.seatsPerRow) || 1)
  const groups: UniversalSeatGroup[] = Array.from({ length: rows }, (_, rowIndex) => {
    const groupId = `${id}-fila-${rowIndex + 1}`
    const seats: UniversalSeat[] = Array.from(
      { length: seatsPerRow },
      (_, seatIndex) => ({
        id: `${groupId}-s${seatIndex + 1}`,
        label: String(seatIndex + 1),
        status: "available" as const,
      }),
    )
    return {
      id: groupId,
      name: `Fila ${rowIndex + 1}`,
      seats,
    }
  })

  return {
    id,
    name: zone.name,
    color: "#f97316",
    price,
    type: "numbered",
    groups,
  }
}

/**
 * Transforma un Venue del admin al payload de <UniversalSeatSelectionFlow />.
 */
export function mapVenueToUniversalSeatData(
  venue: Pick<
    OrganizerVenue,
    | "id"
    | "name"
    | "seatingLayout"
    | "zoneBlueprint"
    | "seatingBackgroundUrl"
    | "capacity"
  >,
  pricingMap: VenuePricingMap = {},
  options?: MapVenueToUniversalOptions,
): VenueUniversalSeatPayload {
  const layout = (venue.seatingLayout ?? []) as VenueSeatingLayout

  let sectors: UniversalSector[] = []

  if (layout.length > 0) {
    sectors = layout.map((sector) =>
      sectorFromLayout(sector, pricingMap, options),
    )
  } else if ((venue.zoneBlueprint ?? []).length > 0) {
    sectors = venue.zoneBlueprint.map((zone, index) =>
      sectorFromZoneBlueprint(zone, index, pricingMap, options),
    )
  } else {
    sectors = [
      {
        id: `${venue.id}-general`,
        name: "General",
        color: "#10b981",
        price: resolvePrice(pricingMap, `${venue.id}-general`, "General"),
        type: "general",
        maxPerUser: options?.maxPerUser ?? MAX_TICKETS_PER_PURCHASE,
      },
    ]
  }

  return {
    venueId: venue.id,
    venueName: venue.name,
    mapImageUrl: venue.seatingBackgroundUrl,
    sectors,
  }
}

/** Inicializa precios en 0 para cada sector del venue (keys = sector id). */
export function buildEmptyPricingMap(venue: OrganizerVenue): VenuePricingMap {
  const payload = mapVenueToUniversalSeatData(venue, {})
  const map: VenuePricingMap = {}
  for (const sector of payload.sectors) {
    map[sector.id] = 0
  }
  return map
}

/** Lista plana de sectores a cotizar en el admin. */
export function listPricableSectors(venue: OrganizerVenue): Array<{
  id: string
  name: string
  color: string
  type: "general" | "numbered"
  groupCount: number
}> {
  const payload = mapVenueToUniversalSeatData(venue, {})
  return payload.sectors.map((sector) => ({
    id: sector.id,
    name: sector.name,
    color: sector.color,
    type: sector.type,
    groupCount: sector.type === "numbered" ? sector.groups.length : 0,
  }))
}
