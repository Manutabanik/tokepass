import { storefrontItemMatchesSchedule } from "@/lib/checkout/seat-hold-day"

export const POS_RPC_QTY_CAP = 20

export type PosCart = Record<string, number>

export type PosSeatPick = {
  seatId: string
  eventDateId?: string | null
  tierId: string
  label: string
  sectorName: string
  price: number
}

export function posSeatPickKey(pick: {
  seatId: string
  eventDateId?: string | null
}): string {
  const date = pick.eventDateId?.trim() || ""
  return date ? `${pick.seatId}::${date}` : pick.seatId
}

export function posSeatPickMatchesDay(
  pick: { eventDateId?: string | null },
  selectedDateId: string | null,
  scheduleDayCount: number,
): boolean {
  return storefrontItemMatchesSchedule(pick, selectedDateId, {
    scheduleDayCount,
  })
}

export function togglePosSeatPick(
  picks: PosSeatPick[],
  pick: PosSeatPick,
): { picks: PosSeatPick[]; added: boolean } {
  const key = posSeatPickKey(pick)
  const exists = picks.some((item) => posSeatPickKey(item) === key)
  if (exists) {
    return {
      picks: picks.filter((item) => posSeatPickKey(item) !== key),
      added: false,
    }
  }
  return { picks: [...picks, pick], added: true }
}

export function posSeatPicksForTier(
  picks: PosSeatPick[],
  tierId: string,
): PosSeatPick[] {
  return picks.filter((item) => item.tierId === tierId)
}

export function bumpPosCart(
  cart: PosCart,
  tierId: string,
  delta: number,
  maxQty: number,
): PosCart {
  const nextQty = Math.max(0, Math.min(maxQty, (cart[tierId] ?? 0) + delta))
  if (nextQty === 0) {
    const next = { ...cart }
    delete next[tierId]
    return next
  }
  return { ...cart, [tierId]: nextQty }
}

export function posCartLines(cart: PosCart): Array<{ tierId: string; quantity: number }> {
  return Object.entries(cart)
    .filter(([, quantity]) => quantity > 0)
    .map(([tierId, quantity]) => ({ tierId, quantity }))
}

export function posCartItemCount(cart: PosCart): number {
  return posCartLines(cart).reduce((sum, line) => sum + line.quantity, 0)
}

export function splitPosQuantity(
  quantity: number,
  cap = POS_RPC_QTY_CAP,
): number[] {
  if (!Number.isInteger(quantity) || quantity < 1 || cap < 1) return []
  const chunks: number[] = []
  let left = quantity
  while (left > 0) {
    const n = Math.min(cap, left)
    chunks.push(n)
    left -= n
  }
  return chunks
}
