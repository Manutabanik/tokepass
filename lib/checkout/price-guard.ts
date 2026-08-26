import { moneyAmountsEqual } from "@/lib/money/cents"

export const CHECKOUT_PRICES_CHANGED_ERROR =
  "Los precios o el inventario han sido actualizados. Revisa tu carrito."

export type LiveCheckoutTierRow = {
  id: string
  price?: number | null
  visibility?: string | null
  is_active?: boolean | null
  isActive?: boolean | null
}

/**
 * Cada línea del carrito debe existir todavía en `ticket_tiers` con precio válido.
 * SKUs borrados, inactivos o sin precio vigente abortan el cobro.
 */
export function liveCheckoutTiersCoverCart(
  requestedTierIds: readonly string[],
  liveTiers: ReadonlyArray<LiveCheckoutTierRow>,
): { ok: true } | { ok: false; error: typeof CHECKOUT_PRICES_CHANGED_ERROR } {
  const byId = new Map(liveTiers.map((row) => [row.id, row]))
  for (const id of requestedTierIds) {
    const tier = byId.get(id)
    if (!tier) {
      return { ok: false, error: CHECKOUT_PRICES_CHANGED_ERROR }
    }
    if (tier.isActive === false || tier.is_active === false) {
      return { ok: false, error: CHECKOUT_PRICES_CHANGED_ERROR }
    }
    const price = Number(tier.price)
    if (!Number.isFinite(price) || price < 0) {
      return { ok: false, error: CHECKOUT_PRICES_CHANGED_ERROR }
    }
  }
  return { ok: true }
}

export function displayedTotalMatchesServer(
  displayedTotal: number | null | undefined,
  serverTotal: number,
): boolean {
  if (displayedTotal == null) return true
  if (!Number.isFinite(displayedTotal) || displayedTotal < 0) return false
  if (!Number.isFinite(serverTotal) || serverTotal < 0) return false
  return moneyAmountsEqual(displayedTotal, serverTotal)
}
