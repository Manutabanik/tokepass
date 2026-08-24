/** Public All-In price. `0` (Gratis) is valid and must never be treated as missing. */
export function isValidPublicPrice(price: unknown): price is number {
  if (price === undefined || price === null) return false
  const amount = typeof price === "number" ? price : Number(price)
  return Number.isFinite(amount) && amount >= 0
}

export function firstValidPublicPrice(
  ...values: Array<number | null | undefined>
): number {
  for (const value of values) {
    if (value === undefined || value === null) continue
    const amount = Number(value)
    if (Number.isFinite(amount) && amount >= 0) return amount
  }
  return 0
}
