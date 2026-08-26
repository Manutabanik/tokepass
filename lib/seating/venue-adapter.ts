import type { OrganizerVenue, VenueZoneBlueprint } from "@/app/actions/venues"
import { MAX_TICKETS_PER_PURCHASE } from "@/lib/checkout-limits"
import type {
  SeatStatus,
  UniversalSector,
  UniversalSeat,
  UniversalSeatGroup,
  UniversalNumberedSector,
} from "@/lib/seating/universal-seat-types"
import { occupancyFromSeatingUnits } from "@/lib/seating/venue-map-occupancy"
import {
  getVenueSeatingItems,
  type EventSeatingUnit,
  type SeatingSectorSummary,
  type VenueSeatingItem,
  type VenueSeatingLayout,
  type VenueSeatingRow,
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
  availableBySectorId?: Record<string, number>
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
      availableCount: options?.availableBySectorId?.[sector.id],
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
    availableCount: options?.availableBySectorId?.[sector.id],
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

export type CheckoutUniversalTier = {
  id: string
  name: string
  price: number
  available: number
  seatingSectorId?: string | null
  layoutType: "general" | "table_combo" | "numbered_seat"
}

/**
 * Arma el payload Universal para checkout B2C a partir del layout del venue,
 * precios de tiers y ocupación runtime de `event_seating_units`.
 */
export function buildUniversalSeatPayloadForCheckout(input: {
  venueId: string
  venueName: string
  seatingLayout: VenueSeatingLayout
  seatingBackgroundUrl: string | null
  capacity?: number
  tiers: CheckoutUniversalTier[]
  seatingUnits?: EventSeatingUnit[]
  seatingSectorSummaries?: SeatingSectorSummary[]
  maxPerUser?: number
  /** Precios de matriz Zona × Tier (prioridad sobre tier.price). */
  zoneTierPricing?: Array<{
    sectorKey: string
    ticketTierId: string
    price: number
    tableNumberStart?: number | null
    tableNumberEnd?: number | null
  }>
}): VenueUniversalSeatPayload {
  const pricingMap: VenuePricingMap = {}
  for (const tier of input.tiers) {
    if (tier.seatingSectorId) {
      pricingMap[tier.seatingSectorId] = tier.price
    }
    pricingMap[tier.name] = pricingMap[tier.name] ?? tier.price
  }

  // Matriz: sobrescribe precio del sector cuando hay tarifa para el tier ligado
  for (const row of input.zoneTierPricing ?? []) {
    const tier = input.tiers.find((t) => t.id === row.ticketTierId)
    if (!tier) continue
    const entry =
      typeof pricingMap[row.sectorKey] === "object" &&
      pricingMap[row.sectorKey] != null
        ? { ...(pricingMap[row.sectorKey] as VenueSectorPriceEntry) }
        : {
            price:
              typeof pricingMap[row.sectorKey] === "number"
                ? (pricingMap[row.sectorKey] as number)
                : tier.price,
          }
    entry.price = row.price
    pricingMap[row.sectorKey] = entry
    if (tier.seatingSectorId === row.sectorKey || !tier.seatingSectorId) {
      pricingMap[tier.name] = row.price
    }
  }

  const seatingUnits = input.seatingUnits ?? []
  const occupancyBySeatId: Record<string, SeatStatus> = occupancyFromSeatingUnits(
    seatingUnits.map((unit) => ({
      layoutItemId: unit.layoutItemId,
      status: unit.status,
      reservedUntil: unit.reservedUntil,
    })),
  )

  const availableBySectorId: Record<string, number> = {}
  for (const summary of input.seatingSectorSummaries ?? []) {
    availableBySectorId[summary.sectorId] = summary.available
  }

  const strippedLayout = stripSeatingLayoutItems(input.seatingLayout)
  const layout =
    strippedLayout.length > 0
      ? strippedLayout
      : (input.seatingSectorSummaries ?? []).length > 0
        ? layoutShellsFromSummaries(input.seatingSectorSummaries ?? [])
        : synthesizeLayoutFromEventUnits(seatingUnits)

  const payload = mapVenueToUniversalSeatData(
    {
      id: input.venueId,
      name: input.venueName,
      seatingLayout: layout,
      zoneBlueprint: [],
      seatingBackgroundUrl: input.seatingBackgroundUrl,
      capacity: input.capacity ?? 0,
    },
    pricingMap,
    {
      occupancyBySeatId,
      maxPerUser: input.maxPerUser ?? MAX_TICKETS_PER_PURCHASE,
      availableBySectorId,
    },
  )

  const knownIds = new Set(payload.sectors.map((sector) => sector.id))
  const knownNames = new Set(
    payload.sectors.map((sector) => sector.name.toLowerCase()),
  )

  for (const tier of input.tiers) {
    if (tier.layoutType !== "general") continue
    const sectorId = tier.seatingSectorId?.trim() || `tier-${tier.id}`
    if (knownIds.has(sectorId) || knownNames.has(tier.name.toLowerCase())) {
      continue
    }
    payload.sectors.push({
      id: sectorId,
      name: tier.name,
      color: "#10b981",
      price: tier.price,
      type: "general",
      maxPerUser: Math.max(
        1,
        Math.min(
          input.maxPerUser ?? MAX_TICKETS_PER_PURCHASE,
          Math.max(0, tier.available) || MAX_TICKETS_PER_PURCHASE,
        ),
      ),
    })
    knownIds.add(sectorId)
  }

  return payload
}

export function stripSeatingLayoutItems(
  layout: VenueSeatingLayout,
): VenueSeatingLayout {
  return layout.map((sector) => ({
    id: sector.id,
    sector_name: sector.sector_name,
    color: sector.color,
    pricing_tier_id: sector.pricing_tier_id,
    layout_type: sector.layout_type,
    capacity_per_unit: sector.capacity_per_unit,
    items: [],
    rows: [],
  }))
}

function layoutShellsFromSummaries(
  summaries: SeatingSectorSummary[],
): VenueSeatingLayout {
  return summaries.map((summary) => ({
    id: summary.sectorId,
    sector_name: summary.sectorName,
    color: summary.color || "#f97316",
    pricing_tier_id: summary.tierId,
    layout_type: summary.layoutType,
    capacity_per_unit: summary.capacityPerUnit,
    items: [],
    rows: [],
  }))
}

/** Hidrata asientos de un sector numerado a partir de unidades lazy. */
export function hydrateNumberedSectorFromUnits(
  sector: UniversalNumberedSector,
  units: EventSeatingUnit[],
): UniversalNumberedSector {
  const layout = synthesizeLayoutFromEventUnits(units)
  const match =
    layout.find((item) => item.id === sector.id) ?? layout[0] ?? null
  if (!match) {
    return { ...sector, groups: [] }
  }
  const mapped = sectorFromLayout(match, { [sector.id]: sector.price })
  if (mapped.type !== "numbered") return sector
  return {
    ...sector,
    groups: mapped.groups,
  }
}

function synthesizeLayoutFromEventUnits(
  units: EventSeatingUnit[],
): VenueSeatingLayout {
  if (units.length === 0) return []

  const bySector = new Map<
    string,
    {
      sectorName: string
      color: string
      layoutType: EventSeatingUnit["layoutType"]
      capacityPerUnit: number
      rows: Map<string, VenueSeatingRow>
    }
  >()

  for (const unit of units) {
    let sector = bySector.get(unit.sectorId)
    if (!sector) {
      sector = {
        sectorName: unit.sectorName,
        color: unit.color || "#f97316",
        layoutType: unit.layoutType,
        capacityPerUnit: unit.capacityPerUnit,
        rows: new Map(),
      }
      bySector.set(unit.sectorId, sector)
    }

    const rowKey = unit.rowId ?? `${unit.sectorId}-all`
    let row = sector.rows.get(rowKey)
    if (!row) {
      row = {
        row_id: rowKey,
        row_number: unit.rowNumber ?? sector.rows.size + 1,
        row_label: unit.rowLabel ?? "Ubicaciones",
        items: [],
      }
      sector.rows.set(rowKey, row)
    }

    row.items.push({
      id: unit.layoutItemId,
      label: unit.label,
      capacity: unit.capacityPerUnit,
      status: unit.status === "blocked" ? "blocked" : "available",
    })
  }

  return [...bySector.entries()].map(([id, sector]) => ({
    id,
    sector_name: sector.sectorName,
    color: sector.color,
    pricing_tier_id: null,
    layout_type: sector.layoutType,
    capacity_per_unit: sector.capacityPerUnit,
    rows: [...sector.rows.values()].sort(
      (a, b) => a.row_number - b.row_number,
    ),
  }))
}

/** Resuelve el tier de checkout asociado a un sector Universal. */
export function resolveTierIdForUniversalSector(
  sectorId: string,
  sectorName: string,
  tiers: CheckoutUniversalTier[],
  preferredTierId?: string | null,
): string | null {
  const preferred = preferredTierId?.trim()
  if (preferred && tiers.some((tier) => tier.id === preferred)) {
    return preferred
  }

  const sector = sectorId.trim()
  if (sector) {
    const bySector = tiers.filter((tier) => tier.seatingSectorId === sector)
    if (bySector.length === 1) return bySector[0]?.id ?? null
  }

  const name = sectorName.trim().toLowerCase()
  if (!name) return null
  const byName = tiers.filter(
    (tier) => tier.name.trim().toLowerCase() === name,
  )
  if (byName.length === 1) return byName[0]?.id ?? null
  return null
}
