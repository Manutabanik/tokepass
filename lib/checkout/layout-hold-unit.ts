export type LayoutHoldUnitRow = {
  id: string
  status: string
  sector_id: string
}

export function layoutHoldSectorCandidates(
  sectorId: string,
  layoutItemId: string,
): string[] {
  const seen = new Set<string>()
  const next: string[] = []
  for (const value of [sectorId, layoutItemId]) {
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
): LayoutHoldUnitRow | null {
  if (units.length === 0) return null
  const wanted = sectorId.trim()
  const holdable = units.filter(
    (unit) => unit.status === "available" || unit.status === "reserved",
  )
  const pool = holdable.length > 0 ? holdable : units
  return pool.find((unit) => unit.sector_id === wanted) ?? pool[0] ?? null
}
