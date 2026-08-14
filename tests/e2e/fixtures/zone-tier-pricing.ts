/**
 * Precio All-In de referencia para Sector Azul en el mock de demo
 * (`UNIVERSAL_SEAT_MOCK`) y contrato esperado de `zone_tier_pricing`.
 *
 * En staging, sobreescribí con E2E_EXPECTED_PRICE (entero ARS).
 */
export const SECTOR_AZUL_NAME = "Sillas Numeradas (Sector Azul)"

export const SECTOR_AZUL_UNIT_PRICE = Number(
  process.env.E2E_EXPECTED_PRICE ?? 25_000,
)

/** Formato es-AR típico: "$ 25.000" */
export function expectedPricePattern(amount = SECTOR_AZUL_UNIT_PRICE): RegExp {
  const grouped = amount.toLocaleString("es-AR")
  const escaped = grouped.replace(/\./g, "\\.")
  return new RegExp(escaped)
}
