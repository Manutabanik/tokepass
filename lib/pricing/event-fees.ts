import { roundMoney } from "@/lib/pricing/all-in"

/** Defaults for brand-new events and organizers (match DB column defaults). */
export const DEFAULT_ORGANIZER_SERVICE_CHARGE_RATE = 0.15
export const DEFAULT_PLATFORM_FEE_PERCENTAGE = 15
export const DEFAULT_PLATFORM_FIXED_FEE = 200
export const DEFAULT_MAX_FREE_TICKETS = 100

/**
 * Puntos de comisión (15 = 15%).
 * `null` / `undefined` / NaN → 15. Un 0 explícito se conserva (auspicio).
 * Acepta fracción (0.15) o puntos (15).
 */
export function fallbackFeePercentagePoints(value: unknown): number {
  if (value == null || value === "") {
    return DEFAULT_PLATFORM_FEE_PERCENTAGE
  }
  const raw = Number(value)
  if (!Number.isFinite(raw) || raw < 0) {
    return DEFAULT_PLATFORM_FEE_PERCENTAGE
  }
  const points = raw > 1 ? raw : raw * 100
  return Math.min(95, Math.max(0, Math.round(points * 100) / 100))
}

/** `(fee_percentage ?? 15) / 100` → 0.15 */
export function fallbackServiceFeeRate(value: unknown): number {
  return Math.min(0.95, fallbackFeePercentagePoints(value) / 100)
}

/** Convierte `profiles.service_charge_rate` (0.15) a puntos de evento (15). */
export function organizerRateToFeePercentage(rate: unknown): number {
  return fallbackFeePercentagePoints(rate)
}

export type EventFeeConfig = {
  /** Percentage points, e.g. 15 = 15% */
  platformFeePercentage: number
  /** Fixed ARS fee per paid ticket inside All-In split */
  platformFixedFee: number
  maxFreeTickets: number
  isSponsoredByTokePass: boolean
}

export function defaultEventFeeConfig(): EventFeeConfig {
  return {
    platformFeePercentage: DEFAULT_PLATFORM_FEE_PERCENTAGE,
    platformFixedFee: DEFAULT_PLATFORM_FIXED_FEE,
    maxFreeTickets: DEFAULT_MAX_FREE_TICKETS,
    isSponsoredByTokePass: false,
  }
}

export function eventFeeConfigFromRow(row: {
  platform_fee_percentage?: unknown
  platform_fixed_fee?: unknown
  max_free_tickets?: unknown
  is_sponsored_by_tokepass?: unknown
}): EventFeeConfig {
  const percentage = fallbackFeePercentagePoints(row.platform_fee_percentage)
  const fixed = Number(row.platform_fixed_fee)
  const maxFree = Number(row.max_free_tickets)
  return {
    platformFeePercentage: percentage,
    platformFixedFee: Number.isFinite(fixed) ? fixed : DEFAULT_PLATFORM_FIXED_FEE,
    maxFreeTickets: Number.isFinite(maxFree) ? maxFree : DEFAULT_MAX_FREE_TICKETS,
    isSponsoredByTokePass: Boolean(row.is_sponsored_by_tokepass),
  }
}

/** Acepta fracción (0.08) o puntos (8). */
export function normalizeServiceFeeRate(
  value: unknown,
  fallback = DEFAULT_PLATFORM_FEE_PERCENTAGE / 100,
): number {
  if (value == null || value === "") return fallback
  const raw = Number(value)
  if (!Number.isFinite(raw) || raw < 0) return fallback
  const fraction = raw > 1 ? raw / 100 : raw
  return Math.min(0.95, Math.max(0, fraction))
}

/**
 * Tasa y cargo fijo del evento para el carrito del comprador.
 * RPC 0 no pisa una columna válida. Sin tasa y no sponsored → 15%.
 */
export function resolvePublicEventFeeRule(input: {
  platformFeePercentage?: unknown
  rpcRate?: unknown
  platformFixedFee?: unknown
  rpcFixedFee?: unknown
  isSponsored?: boolean
}): { rate: number; fixedFee: number } {
  if (input.isSponsored) {
    return { rate: 0, fixedFee: 0 }
  }

  let rate = normalizeServiceFeeRate(input.platformFeePercentage)
  const rpcRate = Number(input.rpcRate)
  if (Number.isFinite(rpcRate) && rpcRate > 0) {
    rate = normalizeServiceFeeRate(rpcRate, rate)
  }
  if (rate <= 0) {
    rate = DEFAULT_PLATFORM_FEE_PERCENTAGE / 100
  }

  let fixedFee = Number(input.platformFixedFee ?? 0)
  if (!Number.isFinite(fixedFee) || fixedFee < 0) fixedFee = 0
  const rpcFixed = Number(input.rpcFixedFee)
  if (Number.isFinite(rpcFixed) && rpcFixed >= 0) {
    fixedFee = rpcFixed
  }

  return { rate, fixedFee: roundMoney(fixedFee) }
}

/** Decimal rate for allInBreakdown (0.08 = 8%). Sponsored → 0. */
export function eventFeeRate(config: EventFeeConfig): number {
  if (config.isSponsoredByTokePass) return 0
  const pct = Number.isFinite(config.platformFeePercentage)
    ? config.platformFeePercentage
    : DEFAULT_PLATFORM_FEE_PERCENTAGE
  return Math.min(0.95, Math.max(0, pct / 100))
}

/** Fixed fee applied only on paid tickets. Sponsored → 0. */
export function eventFixedFee(config: EventFeeConfig): number {
  if (config.isSponsoredByTokePass) return 0
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
