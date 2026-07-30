export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function allInBreakdown(
  publicPrice: number,
  rate: number,
): {
  basePrice: number
  platformFee: number
  publicPrice: number
  rate: number
} {
  const safePublicPrice = Number.isFinite(publicPrice)
    ? Math.max(0, publicPrice)
    : 0
  const safeRate = Number.isFinite(rate)
    ? Math.min(0.95, Math.max(0, rate))
    : 0
  const platformFee = roundMoney(safePublicPrice * safeRate)

  return {
    basePrice: roundMoney(safePublicPrice - platformFee),
    platformFee,
    publicPrice: roundMoney(safePublicPrice),
    rate: safeRate,
  }
}
