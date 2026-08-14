export class PaymentProviderUnavailableError extends Error {
  readonly provider: string
  readonly code = "provider_unavailable" as const

  constructor(provider: string, message: string) {
    super(message)
    this.name = "PaymentProviderUnavailableError"
    this.provider = provider
  }
}

export class PaymentProviderNotSupportedError extends Error {
  readonly provider: string
  readonly code = "provider_not_supported" as const

  constructor(provider: string) {
    super(`Proveedor de pago no soportado: ${provider}`)
    this.name = "PaymentProviderNotSupportedError"
    this.provider = provider
  }
}

export function invalidWebhookResult(
  rawPayload: unknown,
): {
  isValid: false
  orderId: string
  transactionId: string
  status: "pending"
  amount: number
  rawPayload: unknown
} {
  return {
    isValid: false,
    orderId: "",
    transactionId: "",
    status: "pending",
    amount: 0,
    rawPayload,
  }
}
