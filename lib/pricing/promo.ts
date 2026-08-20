import { centsToMoney, moneyToCents } from "@/lib/money/cents"
import { allInBreakdown, allInPlatformFee } from "@/lib/pricing/all-in"

export type PromoDiscountKind = "percentage" | "fixed_amount"

/**
 * Mirrors SQL `compute_promo_discount`. Only the event subtotal is discounted.
 */
export function computePromoDiscount(input: {
  discountType: PromoDiscountKind | string | null | undefined
  discountValue: number
  subtotal: number
}): number {
  const subtotalCents = Math.max(0, moneyToCents(input.subtotal))
  if (subtotalCents <= 0) return 0

  const value = Number(input.discountValue)
  if (!Number.isFinite(value) || value <= 0) return 0

  const discountCents =
    input.discountType === "percentage"
      ? Math.round((subtotalCents * value) / 100)
      : moneyToCents(value)

  return centsToMoney(Math.min(subtotalCents, Math.max(0, discountCents)))
}

/**
 * A-F1: `new_subtotal = subtotal - discount`, then `service_charge` from
 * `all_in_platform_fee(implied_net, rate)` plus the event fixed fee.
 * All-In total stays equal to the remaining public subtotal.
 */
export function applyPromoToEventSubtotal(input: {
  subtotal: number
  discountType: PromoDiscountKind | string | null | undefined
  discountValue: number
  rate: number
  fixedFee?: number
}): {
  discount: number
  subtotal: number
  serviceCharge: number
  total: number
} {
  const subtotalCents = Math.max(0, moneyToCents(input.subtotal))
  const discountCents = moneyToCents(
    computePromoDiscount({
      discountType: input.discountType,
      discountValue: input.discountValue,
      subtotal: centsToMoney(subtotalCents),
    }),
  )
  const newSubtotalCents = Math.max(0, subtotalCents - discountCents)
  const newSubtotal = centsToMoney(newSubtotalCents)
  const impliedNet = allInBreakdown(newSubtotal, input.rate).basePrice
  const percentFeeCents = moneyToCents(allInPlatformFee(impliedNet, input.rate))
  const fixedCents =
    newSubtotalCents > 0 ? Math.max(0, moneyToCents(input.fixedFee ?? 0)) : 0
  const serviceCents = Math.min(newSubtotalCents, percentFeeCents + fixedCents)

  return {
    discount: centsToMoney(discountCents),
    subtotal: newSubtotal,
    serviceCharge: centsToMoney(serviceCents),
    total: newSubtotal,
  }
}
