/** True only when the event passes a service fee through to the buyer. */
export function shouldShowServiceFeeInclusiveNotice(input: {
  rate?: unknown
  absorbFees?: boolean | null
}): boolean {
  const rate = Number(input.rate)
  return Number.isFinite(rate) && rate > 0 && input.absorbFees !== true
}
