import { roundMoney } from "@/lib/pricing/all-in"

function asTicketPrice(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return roundMoney(parsed)
}

/** Acepta fracción (0.15) o puntos (15). */
export function asAbsorbFeeRate(value: unknown): number {
  const raw = Number(value)
  if (!Number.isFinite(raw) || raw <= 0) return 0
  const fraction = raw > 1 ? raw / 100 : raw
  return Math.min(0.95, Math.max(0, fraction))
}

export type AbsorbFeeSplitInput = {
  ticketPrice: unknown
  feeRate?: unknown
  absorbFees?: boolean | null
  fixedFee?: unknown
}

export type AbsorbFeeSplit = {
  ticketPrice: number
  feeAmount: number
  customerTotal: number
  organizerEarnings: number
  absorbFees: boolean
}

/**
 * Motor único absorbido vs trasladado.
 *
 * `ticketPrice` = precio ingresado por el organizador.
 * `feeAmount` = ticketPrice * feeRate (+ cargo fijo por entrada paga).
 *
 * - absorb_fees === false: el comprador paga ticketPrice + feeAmount.
 * - absorb_fees === true: el comprador paga ticketPrice; el fee sale de la ganancia.
 */
export function splitAbsorbFee(input: AbsorbFeeSplitInput): AbsorbFeeSplit {
  const ticketPrice = asTicketPrice(input.ticketPrice)
  const absorbFees = input.absorbFees === true
  const rate = asAbsorbFeeRate(input.feeRate)
  const fixedRaw = Number(input.fixedFee)
  const fixedFee =
    ticketPrice > 0 && Number.isFinite(fixedRaw) && fixedRaw > 0
      ? roundMoney(fixedRaw)
      : 0

  if (ticketPrice <= 0) {
    return {
      ticketPrice: 0,
      feeAmount: 0,
      customerTotal: 0,
      organizerEarnings: 0,
      absorbFees,
    }
  }

  const feeAmount = Math.min(
    absorbFees ? ticketPrice : Number.POSITIVE_INFINITY,
    roundMoney(ticketPrice * rate + fixedFee),
  )

  if (absorbFees) {
    return {
      ticketPrice,
      feeAmount,
      customerTotal: ticketPrice,
      organizerEarnings: roundMoney(Math.max(0, ticketPrice - feeAmount)),
      absorbFees: true,
    }
  }

  return {
    ticketPrice,
    feeAmount,
    customerTotal: roundMoney(ticketPrice + feeAmount),
    organizerEarnings: ticketPrice,
    absorbFees: false,
  }
}

export function customerFacingUnitPrice(
  ticketPrice: unknown,
  rule: {
    rate?: unknown
    fixedFee?: unknown
    absorbFees?: boolean | null
  } = {},
): number {
  return splitAbsorbFee({
    ticketPrice,
    feeRate: rule.rate,
    absorbFees: rule.absorbFees,
    fixedFee: rule.fixedFee,
  }).customerTotal
}
