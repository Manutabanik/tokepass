import type { MercadoPagoNotificationRef } from "@/lib/payments/mercadopago/parse-notification"

/** Queue the gateway notification id as-is. Chargebacks resolve off the HTTP path. */
export function mercadoPagoWebhookQueueRef(
  notification: MercadoPagoNotificationRef,
  searchType?: string | null,
): { paymentId: string; eventType: string } {
  return {
    paymentId: notification.id,
    eventType:
      notification.kind === "chargeback"
        ? "chargebacks"
        : (searchType?.trim() || "payment"),
  }
}
