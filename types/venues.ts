export type VenueLayoutType = "general" | "table_combo" | "numbered_seat"

export type VenueSeatingItemStatus = "available" | "blocked"

export type VenueSeatingItem = {
  id: string
  label: string
  capacity: number
  status: VenueSeatingItemStatus
}

export type VenueSeatingRow = {
  row_id: string
  row_number: number
  row_label: string
  items: VenueSeatingItem[]
}

export type VenueSeatingSector = {
  id: string
  sector_name: string
  color: string
  pricing_tier_id: string | null
  layout_type: VenueLayoutType
  capacity_per_unit: number
  /** Legacy flat layouts created before the row-by-row engine. */
  items?: VenueSeatingItem[]
  rows: VenueSeatingRow[]
}

export type VenueSeatingLayout = VenueSeatingSector[]

export function getVenueSeatingItems(
  sector: VenueSeatingSector,
): VenueSeatingItem[] {
  const rows = sector.rows ?? []
  if (rows.length > 0) {
    return rows.flatMap((row) => row.items ?? [])
  }
  return sector.items ?? []
}

export type EventSeatingUnitStatus =
  | "available"
  | "reserved"
  | "sold"
  | "blocked"

export type EventSeatingUnit = {
  id: string
  tierId: string
  sectorId: string
  sectorName: string
  layoutItemId: string
  label: string
  rowId: string | null
  rowNumber: number | null
  rowLabel: string | null
  color: string
  layoutType: Exclude<VenueLayoutType, "general">
  capacityPerUnit: number
  status: EventSeatingUnitStatus
  reservedUntil: string | null
}

/** Totales de inventario por sector (carga inicial, sin unidades). */
export type SeatingSectorSummary = {
  sectorId: string
  sectorName: string
  color: string
  layoutType: VenueLayoutType
  capacityPerUnit: number
  tierId: string | null
  available: number
  reserved: number
  sold: number
  blocked: number
  total: number
}
