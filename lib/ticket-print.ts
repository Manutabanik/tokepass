export function ticketBackupCode(ticketId: string): string {
  return ticketId.replace(/-/g, "").slice(0, 12).toUpperCase()
}

/** Codigo corto de puerta, tipo #67F354EE. */
export function ticketPrintCode(ticketId: string): string {
  const raw = ticketId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase()
  return raw ? `#${raw}` : ""
}

export function ticketOrderIdShort(orderId?: string | null): string | null {
  if (!orderId) return null
  const raw = orderId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase()
  return raw || null
}

export function ticketPaymentPrintLabel(method?: string | null): string | null {
  switch (method) {
    case "cash":
    case "cash_pos":
      return "EFECTIVO"
    case "card":
    case "card_pos":
      return "POSNET"
    case "transfer":
    case "transfer_pos":
      return "TRANSFERENCIA"
    case "mercadopago":
      return "MERCADO PAGO"
    case "test_sandbox":
      return "PRUEBA"
    default:
      return method?.trim() ? method.trim().toUpperCase() : null
  }
}
