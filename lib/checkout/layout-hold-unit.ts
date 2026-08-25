import { seatingUnitMatchesEventDate } from "@/lib/checkout/seat-hold-day"

export type LayoutHoldUnitRow = {
  id: string
  status: string
  sector_id: string
  event_date_id?: string | null
  day_id?: string | null
}

export function layoutHoldSectorCandidates(
  sectorId: string,
  layoutItemId: string,
  extraSectorIds: readonly string[] = [],
): string[] {
  const seen = new Set<string>()
  const next: string[] = []
  for (const value of [sectorId, layoutItemId, ...extraSectorIds]) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    next.push(trimmed)
  }
  return next
}

export function pickSeatingUnitForLayoutHold(
  units: LayoutHoldUnitRow[],
  sectorId: string,
  eventDateId: string | null = null,
): LayoutHoldUnitRow | null {
  const scoped = units.filter((unit) =>
    seatingUnitMatchesEventDate(unit, eventDateId),
  )
  if (scoped.length === 0) return null
  const wanted = sectorId.trim()
  const holdable = scoped.filter(
    (unit) => unit.status === "available" || unit.status === "reserved",
  )
  const pool = holdable.length > 0 ? holdable : scoped
  return pool.find((unit) => unit.sector_id === wanted) ?? pool[0] ?? null
}
