export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function allInBreakdown(
  publicPrice: number,
  rate: number,
  fixedFee = 0,
): {
  basePrice: number
  platformFee: number
  publicPrice: number
  rate: number
  fixedFee: number
} {
  const safePublicPrice = Number.isFinite(publicPrice)
    ? Math.max(0, publicPrice)
    : 0
  const safeRate = Number.isFinite(rate)
    ? Math.min(0.95, Math.max(0, rate))
    : 0
  const safeFixed =
    safePublicPrice > 0 && Number.isFinite(fixedFee)
      ? Math.max(0, fixedFee)
      : 0

  if (safePublicPrice === 0) {
    return {
      basePrice: 0,
      platformFee: 0,
      publicPrice: 0,
      rate: safeRate,
      fixedFee: 0,
    }
  }

  const platformFee = roundMoney(
    Math.min(safePublicPrice, safePublicPrice * safeRate + safeFixed),
  )

  return {
    basePrice: roundMoney(safePublicPrice - platformFee),
    platformFee,
    publicPrice: roundMoney(safePublicPrice),
    rate: safeRate,
    fixedFee: roundMoney(safeFixed),
  }
}
