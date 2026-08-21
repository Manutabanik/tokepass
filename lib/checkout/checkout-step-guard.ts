export type CheckoutProgressStep = "tickets" | "upsell" | "details" | "payment"

export function cartHasPurchasableItems(input: {
  quantities?: Record<string, number> | null
  selectedCount?: number
}): boolean {
  const selected = Math.max(0, Math.floor(Number(input.selectedCount) || 0))
  if (selected > 0) return true
  return Object.values(input.quantities ?? {}).some((qty) => qty > 0)
}

/** Nunca deja el flujo en Datos/Pago si el carrito está vacío o el evento está agotado. */
export function resolveCheckoutProgressStep(input: {
  requested: CheckoutProgressStep
  hasCartItems: boolean
  purchaseLocked?: boolean
}): CheckoutProgressStep {
  if (input.purchaseLocked || !input.hasCartItems) return "tickets"
  return input.requested
}
