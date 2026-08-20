export const REQUIRED_PAYMENT_CURRENCY = "ARS"

export function normalizePaymentCurrency(
  currency: string | null | undefined,
): string {
  return (currency ?? "").trim().toUpperCase()
}

export function isAllowedPaymentCurrency(
  currency: string | null | undefined,
): boolean {
  return normalizePaymentCurrency(currency) === REQUIRED_PAYMENT_CURRENCY
}
