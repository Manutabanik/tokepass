/** Mercado Pago external_reference helpers for fan-to-fan resale. */

export const DEFAULT_RESALE_FEE_PERCENTAGE = 10
/** @deprecated Prefer DEFAULT_RESALE_FEE_PERCENTAGE / platform_settings. */
export const RESALE_PLATFORM_FEE_RATE = DEFAULT_RESALE_FEE_PERCENTAGE / 100
/** Hold de checkout: un solo comprador por listing. */
export const RESALE_CHECKOUT_TTL_MINUTES = 15

export function normalizeResaleFeePercentage(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_RESALE_FEE_PERCENTAGE
  return Math.min(100, Math.max(0, Math.round(parsed * 100) / 100))
}

export function formatResaleFeePercentage(value: number): string {
  return String(normalizeResaleFeePercentage(value))
}

export function resaleExternalRef(listingId: string): string {
  return `resale:${listingId}`
}

export function parseResaleExternalRef(
  externalReference: string | null | undefined,
): string | null {
  if (!externalReference?.startsWith("resale:")) return null
  const id = externalReference.slice("resale:".length).trim()
  return id || null
}

export function computeResaleFeeSplit(
  price: number,
  feePercentage: number = DEFAULT_RESALE_FEE_PERCENTAGE,
): {
  price: number
  feePercentage: number
  platformFeeAmount: number
  sellerNetAmount: number
} {
  const frozen = Math.round(Number(price) * 100) / 100
  const normalizedFee = normalizeResaleFeePercentage(feePercentage)
  const platformFeeAmount =
    Math.round(frozen * (normalizedFee / 100) * 100) / 100
  const sellerNetAmount =
    Math.round((frozen - platformFeeAmount) * 100) / 100
  return {
    price: frozen,
    feePercentage: normalizedFee,
    platformFeeAmount,
    sellerNetAmount,
  }
}
