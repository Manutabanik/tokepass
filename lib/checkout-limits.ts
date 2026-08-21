/** Fallback histórico de entradas individuales cuando el evento no define tope. */
export const MAX_TICKETS_PER_PURCHASE = 10

/** Fallback histórico de mesas o tablones cuando el evento no define tope. */
export const MAX_TABLES_PER_PURCHASE = 4

/** Techo de sillas por mesa al validar el payload de checkout. */
export const MAX_SEATS_PER_TABLE = 20

/** Tope de pases cuando la compra es de mesas/tablones completos. */
export const MAX_TABLE_TICKETS_PER_PURCHASE =
  MAX_TABLES_PER_PURCHASE * MAX_SEATS_PER_TABLE

/** Techo absoluto anti-abuso cuando el organizador deja el evento sin límite. */
export const ABSOLUTE_MAX_ITEMS_PER_PURCHASE = 200

export const PURCHASE_LIMIT_REACHED_MESSAGE =
  "Alcanzaste el límite de compra para este evento"

export type StorefrontLimitReason = "ticket_limit" | "table_limit"

export type PurchaseLimitTier = {
  id: string
  name: string
  minPurchaseLimit?: number | null
  maxPurchaseLimit?: number | null
}

type StorefrontLimitItem = {
  id: string
  type: string
  capacity: number
  sectorId?: string
}

export function isTableLikeSelection(type: string | null | undefined): boolean {
  return type === "table"
}

export function resolvePurchaseLimit(
  maxTicketsPerUser: number | null | undefined,
): number | null {
  if (maxTicketsPerUser == null) return null
  const n = Math.floor(Number(maxTicketsPerUser))
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export function resolveTierPurchaseMin(
  minPurchaseLimit?: number | null,
): number {
  const n = Math.floor(Number(minPurchaseLimit))
  if (!Number.isFinite(n) || n <= 0) return 1
  return Math.min(n, ABSOLUTE_MAX_ITEMS_PER_PURCHASE)
}

export function resolveTierPurchaseMax(input: {
  maxPurchaseLimit?: number | null
  fallbackMax?: number | null
}): number | null {
  const tierMax = resolvePurchaseLimit(input.maxPurchaseLimit)
  if (tierMax != null) {
    return Math.min(tierMax, ABSOLUTE_MAX_ITEMS_PER_PURCHASE)
  }
  const fallback = resolvePurchaseLimit(input.fallbackMax)
  if (fallback != null) {
    return Math.min(fallback, ABSOLUTE_MAX_ITEMS_PER_PURCHASE)
  }
  return null
}

export function purchaseCapForTier(input: {
  layoutType?: string | null
  maxPurchaseLimit?: number | null
  fallbackMax?: number | null
}): number {
  const resolved = resolveTierPurchaseMax({
    maxPurchaseLimit: input.maxPurchaseLimit,
    fallbackMax: input.fallbackMax,
  })
  if (resolved != null) return resolved
  if (input.layoutType === "table_combo") return MAX_TABLE_TICKETS_PER_PURCHASE
  return ABSOLUTE_MAX_ITEMS_PER_PURCHASE
}

/** @deprecated Prefer purchaseCapForTier. Mantiene el fallback de layout. */
export function purchaseCapForLayout(
  layoutType?: string | null,
  maxTicketsPerUser?: number | null,
): number {
  return purchaseCapForTier({
    layoutType,
    fallbackMax: maxTicketsPerUser,
  })
}

export function tableLimitMessage(maxTables = MAX_TABLES_PER_PURCHASE): string {
  return `Para reservar más de ${maxTables} tablones, comunicate con la organización`
}

export function ticketLimitMessage(maxTickets = MAX_TICKETS_PER_PURCHASE): string {
  return `Podés reservar hasta ${maxTickets} entradas individuales por compra.`
}

export function skuPurchaseMaxMessage(tierName: string, max: number): string {
  return `No podés agregar más de ${max} unidades de ${tierName} por compra.`
}

export function skuPurchaseMinMessage(tierName: string, min: number): string {
  return `Debés agregar al menos ${min} unidades de ${tierName} por compra.`
}

export function storefrontLimitMessage(
  reason?: StorefrontLimitReason,
  details?: { tierName?: string; max?: number },
): string {
  if (
    details?.tierName &&
    details.max != null &&
    Number.isFinite(details.max)
  ) {
    return skuPurchaseMaxMessage(details.tierName, details.max)
  }
  if (reason === "table_limit") return tableLimitMessage()
  if (reason === "ticket_limit") return ticketLimitMessage()
  return PURCHASE_LIMIT_REACHED_MESSAGE
}

function skuSelectionKey(item: StorefrontLimitItem): string {
  return `${item.type}:${item.sectorId?.trim() || ""}`
}

export function evaluateStorefrontSelectionLimit(input: {
  current: StorefrontLimitItem[]
  next: StorefrontLimitItem
  replacingId?: string | null
  maxTicketsPerUser?: number | null
  maxPurchaseLimit?: number | null
}): { ok: true } | { ok: false; reason: StorefrontLimitReason } {
  const limit = resolveTierPurchaseMax({
    maxPurchaseLimit: input.maxPurchaseLimit,
    fallbackMax: input.maxTicketsPerUser,
  })
  if (limit == null) return { ok: true }

  const replacing = input.replacingId?.trim() || input.next.id
  const nextKey = skuSelectionKey(input.next)
  const currentCount = input.current.filter(
    (item) => item.id !== replacing && skuSelectionKey(item) === nextKey,
  ).length

  if (currentCount + 1 > limit) {
    return {
      ok: false,
      reason: isTableLikeSelection(input.next.type)
        ? "table_limit"
        : "ticket_limit",
    }
  }
  return { ok: true }
}

export function assertCartTierPurchaseLimits(input: {
  items: Array<{ tierId: string; quantity: number }>
  tiers: PurchaseLimitTier[]
  fallbackMax?: number | null
}): { ok: true } | { ok: false; error: string } {
  const qtyByTier = new Map<string, number>()
  for (const item of input.items) {
    const tierId = item.tierId.trim()
    const qty = Math.max(0, Math.floor(Number(item.quantity)) || 0)
    if (!tierId || qty <= 0) continue
    qtyByTier.set(tierId, (qtyByTier.get(tierId) ?? 0) + qty)
  }

  const tiers = new Map(input.tiers.map((tier) => [tier.id, tier]))

  for (const [tierId, quantity] of qtyByTier) {
    const tier = tiers.get(tierId)
    if (!tier) continue
    const min = resolveTierPurchaseMin(tier.minPurchaseLimit)
    const max = resolveTierPurchaseMax({
      maxPurchaseLimit: tier.maxPurchaseLimit,
      fallbackMax: input.fallbackMax,
    })
    const name = tier.name.trim() || "esta tarifa"
    if (quantity < min) {
      return { ok: false, error: skuPurchaseMinMessage(name, min) }
    }
    if (max != null && quantity > max) {
      return { ok: false, error: skuPurchaseMaxMessage(name, max) }
    }
  }
  return { ok: true }
}

export function assertCartRemainingStock(input: {
  items: Array<{ tierId: string; quantity: number }>
  tiers: Array<{
    id: string
    name?: string | null
    capacity?: number | null
    sold?: number | null
  }>
}): { ok: true } | { ok: false; error: string } {
  const qtyByTier = new Map<string, number>()
  for (const item of input.items) {
    const tierId = item.tierId.trim()
    const qty = Math.max(0, Math.floor(Number(item.quantity)) || 0)
    if (!tierId || qty <= 0) continue
    qtyByTier.set(tierId, (qtyByTier.get(tierId) ?? 0) + qty)
  }

  const tiers = new Map(input.tiers.map((tier) => [tier.id, tier]))
  for (const [tierId, quantity] of qtyByTier) {
    const tier = tiers.get(tierId)
    if (!tier) continue
    const capacity = Math.max(0, Math.floor(Number(tier.capacity)) || 0)
    const sold = Math.max(0, Math.floor(Number(tier.sold)) || 0)
    const remaining = Math.max(0, capacity - sold)
    if (quantity > remaining) {
      const name = tier.name?.trim() || "esta tarifa"
      return {
        ok: false,
        error:
          remaining <= 0
            ? `${name} se agotó.`
            : `Solo quedan ${remaining} de ${name}.`,
      }
    }
  }
  return { ok: true }
}
