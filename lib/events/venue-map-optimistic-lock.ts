export const VENUE_MAP_STALE_WRITE_ERROR =
  "Alguien más ha modificado este mapa. Debes recargar la página para no sobrescribir sus cambios"

export function eventTimestampMs(value: string | null | undefined): number | null {
  const raw = value?.trim()
  if (!raw) return null
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : null
}

export function eventTimestampsMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (!left?.trim() || !right?.trim()) return false
  if (left.trim() === right.trim()) return true
  const a = eventTimestampMs(left)
  const b = eventTimestampMs(right)
  if (a == null || b == null) return false
  return Math.abs(a - b) < 1000
}
