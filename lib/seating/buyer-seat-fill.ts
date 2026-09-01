import type { SeatStatus } from "@/lib/seating/universal-seat-types"

export const BUYER_SEAT_FILL = {
  sold: "#4B5563",
  held: "#F59E0B",
  available: "#EAB308",
} as const

export const BUYER_SOLD_OPACITY = 0.4

export type BuyerSeatPaintStatus =
  | SeatStatus
  | "sold"
  | "selected"
  | "reserved"
  | "locked"

export function isBuyerUnavailableStatus(
  status: BuyerSeatPaintStatus | "reserved" | "locked" | null | undefined,
): boolean {
  return (
    status === "sold" ||
    status === "occupied" ||
    status === "blocked" ||
    status === "held" ||
    status === "reserved" ||
    status === "locked"
  )
}

export function buyerSeatPaint(status: BuyerSeatPaintStatus): {
  fillColor: string
  opacity: number
} {
  if (isBuyerUnavailableStatus(status)) {
    return { fillColor: BUYER_SEAT_FILL.sold, opacity: BUYER_SOLD_OPACITY }
  }
  return { fillColor: BUYER_SEAT_FILL.available, opacity: 1 }
}
