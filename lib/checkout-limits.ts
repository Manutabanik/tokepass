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

export function tableLimitMessage(maxTables = MAX_TABLES_PER_PURCHASE): string {
  return `Para reservar más de ${maxTables} tablones, comunicate con la organización`
}

export function ticketLimitMessage(maxTickets = MAX_TICKETS_PER_PURCHASE): string {
  return `Podés reservar hasta ${maxTickets} entradas individuales por compra.`
}

export function storefrontLimitMessage(
  reason?: StorefrontLimitReason,
): string {
  if (reason === "table_limit") return tableLimitMessage()
  if (reason === "ticket_limit") return ticketLimitMessage()
  return PURCHASE_LIMIT_REACHED_MESSAGE
}

function selectionUnits(item: { type: string; capacity: number }): number {
  if (isTableLikeSelection(item.type)) return 1
  return Math.max(1, Math.floor(item.capacity) || 1)
}

export function evaluateStorefrontSelectionLimit(input: {
  current: Array<{ id: string; type: string; capacity: number }>
  next: { id: string; type: string; capacity: number }
  replacingId?: string | null
  maxTicketsPerUser?: number | null
}): { ok: true } | { ok: false; reason: StorefrontLimitReason } {
  const limit = resolvePurchaseLimit(input.maxTicketsPerUser)
  if (limit == null) return { ok: true }

  const replacing = input.replacingId?.trim() || input.next.id
  const others = input.current.filter((item) => item.id !== replacing)
  const currentCount = others.reduce((sum, item) => sum + selectionUnits(item), 0)
  const nextCount = selectionUnits(input.next)

  if (currentCount + nextCount > limit) {
    return {
      ok: false,
      reason: isTableLikeSelection(input.next.type)
        ? "table_limit"
        : "ticket_limit",
    }
  }
  return { ok: true }
}

export function purchaseCapForLayout(
  layoutType?: string | null,
  maxTicketsPerUser?: number | null,
): number {
  const resolved = resolvePurchaseLimit(maxTicketsPerUser)
  if (resolved != null) return resolved
  if (layoutType === "table_combo") return MAX_TABLE_TICKETS_PER_PURCHASE
  return ABSOLUTE_MAX_ITEMS_PER_PURCHASE
}
