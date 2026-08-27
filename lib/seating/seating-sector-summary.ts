import { seatingUnitMatchesEventDate } from "@/lib/checkout/seat-hold-day"
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
  event_date_id?: string | null
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
    eventDateId: row.event_date_id ?? null,
  }))
}

export function pickSectorSummaryForDay<
  T extends {
    sectorId: string
    sectorName?: string | null
    tierId?: string | null
    eventDateId?: string | null
  },
>(
  summaries: T[],
  match: {
    sectorId?: string | null
    sectorName?: string | null
    tierId?: string | null
    eventDateId?: string | null
    scheduleDayCount?: number
  },
): T | undefined {
  const sectorId = match.sectorId?.trim() ?? ""
  const sectorName = match.sectorName?.trim().toLowerCase() ?? ""
  const tierId = match.tierId?.trim() ?? ""
  const rows = summaries.filter((row) => {
    if (tierId && row.tierId === tierId) return true
    if (sectorId && row.sectorId === sectorId) return true
    if (
      sectorName &&
      (row.sectorName ?? "").trim().toLowerCase() === sectorName
    ) {
      return true
    }
    return false
  })
  if (rows.length === 0) return undefined
  const eventDateId = match.eventDateId?.trim() ?? ""
  const dated = new Set(
    rows.map((row) => row.eventDateId?.trim() || "").filter(Boolean),
  )
  const scheduleDayCount =
    match.scheduleDayCount ?? (dated.size >= 2 ? 2 : 1)
  if (scheduleDayCount >= 2 && !eventDateId) return undefined
  const scoped = rows.filter((row) =>
    seatingUnitMatchesEventDate(
      { event_date_id: row.eventDateId },
      eventDateId || null,
      { scheduleDayCount },
    ),
  )
  if (scoped.length === 0) return undefined
  if (!eventDateId) return scoped[0]
  return (
    scoped.find((row) => row.eventDateId === eventDateId) ?? scoped[0]
  )
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
