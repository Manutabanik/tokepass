import type { VenueRowConfig } from "@/types/venue-map"
import { parseOptionalRowsConfig } from "@/types/venue-map"

export type VenueRowsConfigLimits = {
  maxRows?: number
  maxSeats?: number
}

const DEFAULT_MAX_ROWS = 80
const DEFAULT_MAX_SEATS = 80

export function clampRowSeatCount(
  value: unknown,
  maxSeats = DEFAULT_MAX_SEATS,
): number {
  return Math.min(maxSeats, Math.max(1, Math.floor(Number(value)) || 1))
}

export function rowsConfigFromGrid(
  rows: number,
  seatsPerRow: number,
  limits?: VenueRowsConfigLimits,
): VenueRowConfig[] {
  const maxRows = limits?.maxRows ?? DEFAULT_MAX_ROWS
  const maxSeats = limits?.maxSeats ?? DEFAULT_MAX_SEATS
  const count = Math.min(maxRows, Math.max(1, Math.floor(rows) || 1))
  const seats = clampRowSeatCount(seatsPerRow, maxSeats)
  return Array.from({ length: count }, (_, index) => ({
    label: String(index + 1),
    seatCount: seats,
  }))
}

export function normalizeRowsConfig(
  raw: unknown,
  fallback: { rows: number; seatsPerRow: number },
  limits?: VenueRowsConfigLimits,
): VenueRowConfig[] {
  const parsed = parseOptionalRowsConfig(raw)
  if (!parsed) {
    return rowsConfigFromGrid(fallback.rows, fallback.seatsPerRow, limits)
  }
  const maxRows = limits?.maxRows ?? DEFAULT_MAX_ROWS
  const maxSeats = limits?.maxSeats ?? DEFAULT_MAX_SEATS
  return parsed.slice(0, maxRows).map((row, index) => ({
    label: (row.label ?? "").trim() || String(index + 1),
    seatCount: clampRowSeatCount(row.seatCount, maxSeats),
  }))
}

export function resolveZoneRowsConfig(
  zone: {
    rows?: number
    itemsPerRow?: number
    rowsConfig?: VenueRowConfig[] | null
  },
  limits?: VenueRowsConfigLimits,
): VenueRowConfig[] {
  return normalizeRowsConfig(zone.rowsConfig, {
    rows: zone.rows ?? 1,
    seatsPerRow: zone.itemsPerRow ?? 1,
  }, limits)
}

export function resolveSectorRowsConfig(
  sector: {
    rows?: number
    seatsPerRow?: number
    rowsConfig?: VenueRowConfig[] | null
  },
  limits?: VenueRowsConfigLimits,
): VenueRowConfig[] {
  return normalizeRowsConfig(sector.rowsConfig, {
    rows: sector.rows ?? 1,
    seatsPerRow: sector.seatsPerRow ?? 1,
  }, limits)
}

export function resizeRowsConfig(
  current: VenueRowConfig[],
  nextCount: number,
  limits?: VenueRowsConfigLimits,
): VenueRowConfig[] {
  const maxRows = limits?.maxRows ?? DEFAULT_MAX_ROWS
  const count = Math.min(maxRows, Math.max(1, Math.floor(nextCount) || 1))
  if (current.length === count) return current
  if (current.length > count) return current.slice(0, count)
  const lastSeats = current[current.length - 1]?.seatCount ?? 1
  const extra = Array.from({ length: count - current.length }, (_, index) => ({
    label: String(current.length + index + 1),
    seatCount: lastSeats,
  }))
  return [...current, ...extra]
}

export function patchRowSeatCount(
  rows: VenueRowConfig[],
  index: number,
  seatCount: number,
  maxSeats = DEFAULT_MAX_SEATS,
): VenueRowConfig[] {
  return rows.map((row, current) =>
    current === index
      ? { ...row, seatCount: clampRowSeatCount(seatCount, maxSeats) }
      : row,
  )
}

export function totalSeatsFromRowsConfig(rows: VenueRowConfig[]): number {
  return rows.reduce((sum, row) => sum + Math.max(0, row.seatCount), 0)
}

export function maxSeatsPerRowFromConfig(rows: VenueRowConfig[]): number {
  return Math.max(1, ...rows.map((row) => row.seatCount), 1)
}

export function rowsConfigGridFields(rows: VenueRowConfig[]): {
  rows: number
  itemsPerRow: number
  capacity: number
} {
  return {
    rows: Math.max(1, rows.length),
    itemsPerRow: maxSeatsPerRowFromConfig(rows),
    capacity: totalSeatsFromRowsConfig(rows),
  }
}
