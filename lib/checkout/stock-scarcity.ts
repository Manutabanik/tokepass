export type StockScarcity =
  | { kind: "sold_out" }
  | { kind: "available" }
  | { kind: "low"; remaining: number }

const LOW_ABSOLUTE = 50
const LOW_RATIO = 0.15

export function resolveStockScarcity(
  available: number,
  capacity?: number | null,
  sold?: number | null,
): StockScarcity {
  const remaining = Math.max(0, Math.floor(Number(available) || 0))
  if (remaining === 0) return { kind: "sold_out" }

  const knownCapacity = Math.max(
    remaining,
    Number(capacity) || 0,
    remaining + Math.max(0, Number(sold) || 0),
  )
  const ratio = remaining / knownCapacity
  const plentiful = remaining > LOW_ABSOLUTE && ratio > LOW_RATIO
  if (plentiful) return { kind: "available" }
  return { kind: "low", remaining }
}
