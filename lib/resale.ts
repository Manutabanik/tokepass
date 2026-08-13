/** Mercado Pago external_reference helpers for fan-to-fan resale. */

export const RESALE_PLATFORM_FEE_RATE = 0.1

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

export function computeResaleFeeSplit(price: number): {
  price: number
  platformFeeAmount: number
  sellerNetAmount: number
} {
  const frozen = Math.round(Number(price) * 100) / 100
  const platformFeeAmount =
    Math.round(frozen * RESALE_PLATFORM_FEE_RATE * 100) / 100
  const sellerNetAmount =
    Math.round((frozen - platformFeeAmount) * 100) / 100
  return {
    price: frozen,
    platformFeeAmount,
    sellerNetAmount,
  }
}
