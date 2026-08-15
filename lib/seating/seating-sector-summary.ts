import type { SeatingSectorSummary, VenueLayoutType } from "@/types/venues"

export type SeatingSectorSummaryRpcRow = {
  sector_id: string
  sector_name: string
  color: string
  layout_type: string
  capacity_per_unit: number
  tier_id: string | null
  available: number
  reserved: number
  sold: number
  blocked: number
  total: number
}

export type SeatingSummaryTierInput = {
  id: string
  name: string
  capacity: number
  sold: number
  visibility?: string | null
  layout_type?: string | null
  seating_sector_id?: string | null
  capacity_per_unit?: number | null
}

export function isSeatingSummaryMinUuidError(error: unknown): boolean {
  const text = (() => {
    if (!error) return ""
    if (typeof error === "string") return error
    if (typeof error === "object" && "message" in error) {
      return String((error as { message: unknown }).message)
    }
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  })()
  return /function min\(uuid\) does not exist/i.test(text)
}

export function mapSeatingSectorSummaryRows(
  rows: SeatingSectorSummaryRpcRow[],
): SeatingSectorSummary[] {
  return rows.map((row) => ({
    sectorId: row.sector_id,
    sectorName: row.sector_name,
    color: row.color,
    layoutType: asLayoutType(row.layout_type),
    capacityPerUnit: Number(row.capacity_per_unit) || 1,
    tierId: row.tier_id,
    available: Number(row.available) || 0,
    reserved: Number(row.reserved) || 0,
    sold: Number(row.sold) || 0,
    blocked: Number(row.blocked) || 0,
    total: Number(row.total) || 0,
  }))
}

/** Resumen aproximado cuando el RPC no está parcheado (min(uuid)). */
export function seatingSummariesFromTicketTiers(
  tiers: SeatingSummaryTierInput[],
): SeatingSectorSummary[] {
  const bySector = new Map<string, SeatingSectorSummary>()
  for (const tier of tiers) {
    if (tier.visibility === "private") continue
    const seated =
      Boolean(tier.seating_sector_id?.trim()) ||
      tier.layout_type === "table_combo" ||
      tier.layout_type === "numbered_seat"
    if (!seated) continue
    const sectorId = tier.seating_sector_id?.trim() || tier.id
    const capacity = Math.max(0, Number(tier.capacity) || 0)
    const sold = Math.max(0, Number(tier.sold) || 0)
    const available = Math.max(0, capacity - sold)
    const current = bySector.get(sectorId)
    if (!current) {
      bySector.set(sectorId, {
        sectorId,
        sectorName: tier.name,
        color: "#22d3ee",
        layoutType: asLayoutType(tier.layout_type),
        capacityPerUnit: Number(tier.capacity_per_unit) || 1,
        tierId: tier.id,
        available,
        reserved: 0,
        sold,
        blocked: 0,
        total: capacity,
      })
      continue
    }
    current.available += available
    current.sold += sold
    current.total += capacity
    if (!current.tierId || tier.id < current.tierId) current.tierId = tier.id
  }
  return [...bySector.values()]
}

function asLayoutType(value: string | null | undefined): VenueLayoutType {
  if (value === "table_combo" || value === "numbered_seat") return value
  return "general"
}
