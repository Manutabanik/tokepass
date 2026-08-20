export type GatewayWebhookStatus =
  | "approved"
  | "rejected"
  | "pending"
  | "refunded"
  | "charged_back"
  | "in_mediation"

export function mapGatewayPaymentStatus(
  statusRaw: string | null | undefined,
): GatewayWebhookStatus {
  const status = (statusRaw ?? "").trim().toLowerCase()
  if (status === "approved" || status === "paid" || status === "accredited") {
    return "approved"
  }
  if (status === "in_mediation") return "in_mediation"
  if (status === "charged_back" || status === "chargeback") {
    return "charged_back"
  }
  if (status === "refunded") return "refunded"
  if (
    status === "rejected" ||
    status === "cancelled" ||
    status === "canceled" ||
    status === "failed"
  ) {
    return "rejected"
  }
  return "pending"
}

export function isDisputedGatewayStatus(
  status: string | null | undefined,
): status is "in_mediation" | "charged_back" | "refunded" {
  return (
    status === "in_mediation" ||
    status === "charged_back" ||
    status === "refunded"
  )
}
