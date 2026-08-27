export type CheckoutProgressStep = "tickets" | "upsell" | "details" | "payment"

function countableLength(value: readonly unknown[] | null | undefined): number {
  return Array.isArray(value) ? value.length : 0
}

/**
 * The buyer can continue when the cart has any purchasable line:
 * general quantities, map seats/tables, or ticket lines. Do not require
 * the general-admission counter to be > 0 if a mesa/lugar is already in.
 */
export function cartHasPurchasableItems(input: {
  quantities?: Record<string, number> | null
  selectedCount?: number
  selectedItems?: readonly unknown[] | null
  seats?: readonly unknown[] | null
  tickets?: readonly unknown[] | null
}): boolean {
  const selected = Math.max(
    0,
    Math.floor(Number(input.selectedCount) || 0),
    countableLength(input.selectedItems),
    countableLength(input.seats),
    countableLength(input.tickets),
  )
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
