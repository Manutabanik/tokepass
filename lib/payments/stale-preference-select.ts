export type StalePreferenceOrder = {
  id: string
  status?: string | null
  mp_preference_id?: string | null
  provider_preference_id?: string | null
  payment_provider?: string | null
}

export function preferenceIdFromOrder(
  order: StalePreferenceOrder,
): string | null {
  const id =
    order.mp_preference_id?.trim() ||
    order.provider_preference_id?.trim() ||
    ""
  return id.length > 0 ? id : null
}

export function selectStalePreferenceOrders(
  orders: readonly StalePreferenceOrder[],
  exceptOrderId: string,
): StalePreferenceOrder[] {
  const keep = exceptOrderId.trim()
  return orders.filter((order) => {
    if (!order.id || order.id === keep) return false
    const status = String(order.status ?? "").trim().toLowerCase()
    if (status !== "pending" && status !== "expired") return false
    return Boolean(preferenceIdFromOrder(order))
  })
}
