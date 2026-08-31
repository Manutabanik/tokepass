import { customerFacingUnitPrice } from "@/lib/pricing/absorb-fee-split"

/**
 * Precio que ve el comprador en catálogo, landing y checkout.
 * absorbFees === true → base. Si no, base + (base × feeRate) + cargo fijo.
 */
export function calculateDisplayPrice(
  basePrice: unknown,
  feeRate: unknown,
  absorbFees?: boolean | null,
  fixedFee?: unknown,
): number {
  return customerFacingUnitPrice(basePrice, {
    rate: feeRate,
    absorbFees,
    fixedFee,
  })
}
