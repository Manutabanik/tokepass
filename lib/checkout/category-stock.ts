import { resolveLiveVenueSeatStatus } from "@/lib/seating/venue-map-occupancy"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import type { FlattenedVenueSeat } from "@/lib/seating/venue-map-geometry"

export type CategoryStockInput = {
  requiresMap: boolean
  stock: number
  categoryId?: string | null
  seatingSectorId?: string | null
  categoryName?: string | null
  seats?: FlattenedVenueSeat[]
  occupancyBySeatId?: Record<string, SeatStatus>
  summaryAvailable?: number | null
  mapReady?: boolean
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

export function seatMatchesCategory(
  seat: Pick<FlattenedVenueSeat, "id" | "sectorId" | "sectorName">,
  input: Pick<
    CategoryStockInput,
    "categoryId" | "seatingSectorId" | "categoryName"
  >,
) {
  const sectorId = input.seatingSectorId?.trim()
  const categoryId = input.categoryId?.trim()
  if (sectorId && (seat.sectorId === sectorId || seat.id === sectorId)) {
    return true
  }
  if (categoryId && (seat.sectorId === categoryId || seat.id === categoryId)) {
    return true
  }
  const name = normalize(input.categoryName)
  return Boolean(name) && normalize(seat.sectorName) === name
}

export function isSeatNodeAvailable(
  seat: FlattenedVenueSeat,
  occupancyBySeatId: Record<string, SeatStatus> = {},
) {
  const live = resolveLiveVenueSeatStatus({
    mapStatus: seat.mapStatus,
    occupancy: occupancyBySeatId[seat.id],
    selected: false,
  })
  return live === "available" || live === "selected"
}

export function countAvailableSeatsForCategory(input: CategoryStockInput) {
  const seats = input.seats ?? []
  const occupancy = input.occupancyBySeatId ?? {}
  return seats.filter(
    (seat) =>
      seatMatchesCategory(seat, input) && isSeatNodeAvailable(seat, occupancy),
  ).length
}

export function getAvailableStock(input: CategoryStockInput) {
  if (!input.requiresMap) return Math.max(0, input.stock)

  const matched = (input.seats ?? []).filter((seat) =>
    seatMatchesCategory(seat, input),
  )
  if (matched.length > 0) {
    return matched.filter((seat) =>
      isSeatNodeAvailable(seat, input.occupancyBySeatId),
    ).length
  }
  if (typeof input.summaryAvailable === "number") {
    return Math.max(0, input.summaryAvailable)
  }
  return Math.max(0, input.stock)
}

export function isCategorySoldOut(input: CategoryStockInput) {
  if (!input.requiresMap) return input.stock <= 0

  const matched = (input.seats ?? []).filter((seat) =>
    seatMatchesCategory(seat, input),
  )
  if (matched.length > 0) {
    return matched.every(
      (seat) => !isSeatNodeAvailable(seat, input.occupancyBySeatId),
    )
  }
  if (typeof input.summaryAvailable === "number") {
    return input.summaryAvailable <= 0
  }
  if (!input.mapReady) return false
  return false
}
