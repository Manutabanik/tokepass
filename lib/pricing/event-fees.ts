import { roundMoney } from "@/lib/pricing/all-in"

/** Defaults for brand-new events (match DB column defaults). */
export const DEFAULT_PLATFORM_FEE_PERCENTAGE = 8
export const DEFAULT_PLATFORM_FIXED_FEE = 200
export const DEFAULT_MAX_FREE_TICKETS = 100

export type EventFeeConfig = {
  /** Percentage points, e.g. 8 = 8% */
  platformFeePercentage: number
  /** Fixed ARS fee per paid ticket inside All-In split */
  platformFixedFee: number
  maxFreeTickets: number
  isSponsoredByTokepass: boolean
}

export function defaultEventFeeConfig(): EventFeeConfig {
  return {
    platformFeePercentage: DEFAULT_PLATFORM_FEE_PERCENTAGE,
    platformFixedFee: DEFAULT_PLATFORM_FIXED_FEE,
    maxFreeTickets: DEFAULT_MAX_FREE_TICKETS,
    isSponsoredByTokepass: false,
  }
}

/** Decimal rate for allInBreakdown (0.08 = 8%). Sponsored → 0. */
export function eventFeeRate(config: EventFeeConfig): number {
  if (config.isSponsoredByTokepass) return 0
  const pct = Number.isFinite(config.platformFeePercentage)
    ? config.platformFeePercentage
    : DEFAULT_PLATFORM_FEE_PERCENTAGE
  return Math.min(0.95, Math.max(0, pct / 100))
}

/** Fixed fee applied only on paid tickets. Sponsored → 0. */
export function eventFixedFee(config: EventFeeConfig): number {
  if (config.isSponsoredByTokepass) return 0
  const fixed = Number.isFinite(config.platformFixedFee)
    ? config.platformFixedFee
    : DEFAULT_PLATFORM_FIXED_FEE
  return Math.max(0, roundMoney(fixed))
}

export function isCourtesyTierName(name: string | null | undefined): boolean {
  if (!name) return false
  const normalized = name.toLowerCase()
  return (
    normalized.includes("freepass") ||
    normalized.includes("cortesía") ||
    normalized.includes("cortesia")
  )
}

/**
 * Sum of free (price === 0) tier capacities, excluding guest-list cortesía tiers.
 */
export function sumFreeTicketCapacity(
  tiers: Array<{ name: string; price: number; capacity: number }>,
): number {
  return tiers.reduce((sum, tier) => {
    if (Number(tier.price) !== 0) return sum
    if (isCourtesyTierName(tier.name)) return sum
    return sum + Math.max(0, Math.floor(Number(tier.capacity) || 0))
  }, 0)
}
