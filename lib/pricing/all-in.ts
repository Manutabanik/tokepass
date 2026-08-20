import { centsToMoney, moneyToCents } from "@/lib/money/cents"

export function roundMoney(value: number): number {
  return centsToMoney(moneyToCents(value))
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 0
  return Math.min(0.95, Math.max(0, rate))
}

/**
 * Mirrors SQL `all_in_platform_fee(base, rate)`: fee = public(base) - base.
 * Arithmetic stays in integer cents (numeric(12,2)).
 */
export function allInPlatformFee(base: number, rate: number): number {
  const safeRate = clampRate(rate)
  const baseCents = Math.max(0, moneyToCents(base))
  if (baseCents <= 0 || safeRate <= 0) return 0
  const publicCents = Math.round(baseCents / (1 - safeRate))
  return centsToMoney(Math.max(0, publicCents - baseCents))
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
  const publicCents = Math.max(0, moneyToCents(publicPrice))
  const safeRate = clampRate(rate)
  const fixedCents =
    publicCents > 0 && Number.isFinite(fixedFee)
      ? Math.max(0, moneyToCents(fixedFee))
      : 0

  if (publicCents === 0) {
    return {
      basePrice: 0,
      platformFee: 0,
      publicPrice: 0,
      rate: safeRate,
      fixedFee: 0,
    }
  }

  const platformFeeCents = Math.min(
    publicCents,
    Math.round(publicCents * safeRate) + fixedCents,
  )

  return {
    basePrice: centsToMoney(publicCents - platformFeeCents),
    platformFee: centsToMoney(platformFeeCents),
    publicPrice: centsToMoney(publicCents),
    rate: safeRate,
    fixedFee: centsToMoney(fixedCents),
  }
}
