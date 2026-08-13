import type { PaymentMethod } from "@/types/database"

/** Etiqueta amigable (ES-AR) del medio de pago del comprador. */
export function buyerPaymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case "mercadopago":
      return "Mercado Pago"
    case "cash_pos":
      return "Efectivo (POS)"
    case "card_pos":
      return "Posnet / tarjeta"
    case "transfer_pos":
      return "Transferencia (POS)"
    default:
      return method
  }
}
