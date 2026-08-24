import { moneyAmountsEqual } from "@/lib/money/cents"

export const CHECKOUT_PRICES_CHANGED_ERROR =
  "Los precios han cambiado, por favor actualiza tu carrito."

export function displayedTotalMatchesServer(
  displayedTotal: number | null | undefined,
  serverTotal: number,
): boolean {
  if (displayedTotal == null) return true
  if (!Number.isFinite(displayedTotal) || displayedTotal < 0) return false
  if (!Number.isFinite(serverTotal) || serverTotal < 0) return false
  return moneyAmountsEqual(displayedTotal, serverTotal)
}
