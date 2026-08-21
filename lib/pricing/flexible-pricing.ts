import { centsToMoney, moneyToCents } from "@/lib/money/cents"
import { allInBreakdown, roundMoney } from "@/lib/pricing/all-in"

export const TICKET_FEE_STRATEGIES = [
  "pass_to_customer",
  "absorb_in_price",
] as const

export const TICKET_CALCULATION_MODES = [
  "net_income",
  "public_price",
] as const

export type TicketFeeStrategy = (typeof TICKET_FEE_STRATEGIES)[number]
export type TicketCalculationMode = (typeof TICKET_CALCULATION_MODES)[number]

export type PricingCalculationResult = {
  organizerNet: number
  serviceFee: number
  publicPrice: number
  isAbsorbed: boolean
}

function clampPercentage(value: number | undefined): number {
  if (!Number.isFinite(value)) return 15
  return Math.min(95, Math.max(0, Number(value)))
}

function clampRate(percentage: number): number {
  return Math.min(0.95, Math.max(0, percentage / 100))
}

/**
 * Simulador de tarifas. `feePercentage` son puntos (15 = 15%).
 * El checkout sigue cobrando `publicPrice` All-In; la comision es ledger interno.
 */
export function calculateTierPricing({
  inputValue,
  feePercentage = 15,
  fixedFee = 0,
  feeStrategy,
  calculationMode,
  sponsored = false,
}: {
  inputValue: number
  feePercentage?: number
  fixedFee?: number
  feeStrategy: TicketFeeStrategy
  calculationMode: TicketCalculationMode
  sponsored?: boolean
}): PricingCalculationResult {
  const percentage = sponsored ? 0 : clampPercentage(feePercentage)
  const rate = clampRate(percentage)
  const fixed = sponsored ? 0 : Math.max(0, roundMoney(fixedFee))
  const raw = Number.isFinite(inputValue) ? Math.max(0, inputValue) : 0
  const isAbsorbed = feeStrategy === "absorb_in_price"

  if (raw <= 0) {
    return {
      organizerNet: 0,
      serviceFee: 0,
      publicPrice: 0,
      isAbsorbed,
    }
  }

  if (isAbsorbed) {
    if (calculationMode === "net_income") {
      const divisor = 1 - rate
      const publicCents =
        divisor <= 0
          ? moneyToCents(raw) + moneyToCents(fixed)
          : Math.round((moneyToCents(raw) + moneyToCents(fixed)) / divisor)
      const split = allInBreakdown(centsToMoney(publicCents), rate, fixed)
      return {
        organizerNet: split.basePrice,
        serviceFee: split.platformFee,
        publicPrice: split.publicPrice,
        isAbsorbed: true,
      }
    }
    const split = allInBreakdown(raw, rate, fixed)
    return {
      organizerNet: split.basePrice,
      serviceFee: split.platformFee,
      publicPrice: split.publicPrice,
      isAbsorbed: true,
    }
  }

  if (calculationMode === "net_income") {
    const organizerNet = roundMoney(raw)
    const serviceFee = roundMoney(organizerNet * rate + fixed)
    return {
      organizerNet,
      serviceFee,
      publicPrice: roundMoney(organizerNet + serviceFee),
      isAbsorbed: false,
    }
  }

  const publicPrice = roundMoney(raw)
  const organizerNet = Math.max(0, roundMoney((publicPrice - fixed) / (1 + rate)))
  return {
    organizerNet,
    serviceFee: roundMoney(publicPrice - organizerNet),
    publicPrice,
    isAbsorbed: false,
  }
}

export function feePercentageFromRate(rate: number): number {
  if (!Number.isFinite(rate)) return 15
  return clampPercentage(rate <= 1 ? rate * 100 : rate)
}

/** Reconstruye el modo de cobro a partir de los montos persistidos. */
export function inferTicketFeeStrategy({
  publicPrice,
  organizerNet,
  feePercentage = 15,
  fixedFee = 0,
  sponsored = false,
}: {
  publicPrice: number
  organizerNet: number
  feePercentage?: number
  fixedFee?: number
  sponsored?: boolean
}): TicketFeeStrategy {
  const absorb = calculateTierPricing({
    inputValue: publicPrice,
    feePercentage,
    fixedFee,
    feeStrategy: "absorb_in_price",
    calculationMode: "public_price",
    sponsored,
  })
  const pass = calculateTierPricing({
    inputValue: publicPrice,
    feePercentage,
    fixedFee,
    feeStrategy: "pass_to_customer",
    calculationMode: "public_price",
    sponsored,
  })
  const absorbErr = Math.abs(absorb.organizerNet - organizerNet)
  const passErr = Math.abs(pass.organizerNet - organizerNet)
  return passErr + 0.009 < absorbErr ? "pass_to_customer" : "absorb_in_price"
}
