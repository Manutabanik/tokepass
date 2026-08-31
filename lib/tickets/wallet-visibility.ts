/** A paid ticket stays visible even if the event embed is hidden (draft/sandbox). */
export function shouldKeepOwnedWalletTicket(input: {
  status: string
  orderId?: string | null
  orderStatus?: string | null
}): boolean {
  if (input.status === "pending_payment") {
    return input.orderStatus === "paid"
  }
  if (
    input.status === "valid" &&
    input.orderId &&
    input.orderStatus != null &&
    input.orderStatus !== "paid"
  ) {
    return false
  }
  return true
}
