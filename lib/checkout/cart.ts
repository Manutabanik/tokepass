export function cartItemCount(
  quantities: Record<string, number>,
  hasNumberedSeat: boolean,
): number {
  const quantity = Object.values(quantities).reduce(
    (sum, value) => sum + Math.max(0, value),
    0,
  )
  return quantity + (hasNumberedSeat ? 1 : 0)
}

export function hasActiveCheckoutSelection(
  quantities: Record<string, number>,
  hasNumberedSeat: boolean,
): boolean {
  return cartItemCount(quantities, hasNumberedSeat) > 0
}
