import {
  calculateTierPricing,
  type PricingCalculationResult,
} from "@/lib/pricing/flexible-pricing"

export function clampServiceFeePercentage(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 15
  return Math.min(95, Math.max(0, parsed))
}

/** public = neto × (1 + comisión%) + cargo fijo. */
export function priceFromNetProfit(input: {
  netPrice: number
  feePercentage?: number
  fixedFee?: number
  sponsored?: boolean
}): PricingCalculationResult {
  return calculateTierPricing({
    inputValue: input.netPrice,
    feePercentage: input.feePercentage,
    fixedFee: input.fixedFee,
    feeStrategy: "pass_to_customer",
    calculationMode: "net_income",
    sponsored: input.sponsored,
  })
}

export function netProfitFromPublicPrice(input: {
  publicPrice: number
  feePercentage?: number
  fixedFee?: number
  sponsored?: boolean
}): number {
  return calculateTierPricing({
    inputValue: input.publicPrice,
    feePercentage: input.feePercentage,
    fixedFee: input.fixedFee,
    feeStrategy: "pass_to_customer",
    calculationMode: "public_price",
    sponsored: input.sponsored,
  }).organizerNet
}

export function resolveTicketNetProfit(
  ticket: { price?: number | null; basePrice?: number | null },
  feePercentage: number,
  extras?: { fixedFee?: number; sponsored?: boolean },
): number {
  if (ticket.basePrice != null && Number.isFinite(Number(ticket.basePrice))) {
    return Math.max(0, Number(ticket.basePrice))
  }
  return netProfitFromPublicPrice({
    publicPrice: Number(ticket.price) || 0,
    feePercentage,
    fixedFee: extras?.fixedFee,
    sponsored: extras?.sponsored,
  })
}

export function applyNetProfitToTicket<
  T extends { price?: number; basePrice?: number | null },
>(
  ticket: T,
  netPrice: number,
  feePercentage: number,
  extras?: { fixedFee?: number; sponsored?: boolean },
): T {
  const calc = priceFromNetProfit({
    netPrice,
    feePercentage,
    fixedFee: extras?.fixedFee,
    sponsored: extras?.sponsored,
  })
  return {
    ...ticket,
    price: calc.publicPrice,
    basePrice: calc.organizerNet,
  }
}

export function remapTicketsForServiceFee<
  T extends { price?: number; basePrice?: number | null },
>(
  tickets: readonly T[],
  feePercentage: number,
  extras?: { fixedFee?: number; sponsored?: boolean },
): T[] {
  return tickets.map((ticket) =>
    applyNetProfitToTicket(
      ticket,
      resolveTicketNetProfit(ticket, feePercentage, extras),
      feePercentage,
      extras,
    ),
  )
}
