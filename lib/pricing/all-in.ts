/** Default Tokepass All-In markup over organizer net (15%). */
export const DEFAULT_ALL_IN_RATE = 0.15

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Public All-In price from organizer net: round(base × (1 + rate), 2). */
export function allInPublicPrice(
  basePrice: number,
  rate: number = DEFAULT_ALL_IN_RATE,
): number {
  const safeBase = Number.isFinite(basePrice) ? Math.max(0, basePrice) : 0
  const safeRate = Number.isFinite(rate)
    ? Math.min(1, Math.max(0, rate))
    : DEFAULT_ALL_IN_RATE
  return roundMoney(safeBase * (1 + safeRate))
}

/** Platform fee absorbed in the public price: public − base. */
export function allInPlatformFee(
  basePrice: number,
  rate: number = DEFAULT_ALL_IN_RATE,
): number {
  const safeBase = Number.isFinite(basePrice) ? Math.max(0, basePrice) : 0
  return roundMoney(allInPublicPrice(safeBase, rate) - safeBase)
}

export function allInBreakdown(
  basePrice: number,
  rate: number = DEFAULT_ALL_IN_RATE,
): {
  basePrice: number
  platformFee: number
  publicPrice: number
  rate: number
} {
  const safeBase = Number.isFinite(basePrice) ? Math.max(0, basePrice) : 0
  const safeRate = Number.isFinite(rate)
    ? Math.min(1, Math.max(0, rate))
    : DEFAULT_ALL_IN_RATE
  const publicPrice = allInPublicPrice(safeBase, safeRate)
  return {
    basePrice: roundMoney(safeBase),
    platformFee: roundMoney(publicPrice - safeBase),
    publicPrice,
    rate: safeRate,
  }
}
