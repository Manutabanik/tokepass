export type SupportedPaymentProvider =
  | "mercadopago"
  | "payway"
  | "naranjax"
  | "modo"
  | "stripe"

export interface CreateCheckoutInput {
  orderId: string
  amount: number
  currency: "ARS" | "USD"
  description: string
  buyer: {
    name: string
    email: string
    dni: string
  }
  items: Array<{
    title: string
    quantity: number
    unitPrice: number
  }>
  redirectUrls: {
    success: string
    failure: string
    pending: string
  }
  webhookUrl: string
  /** ISO del hold vigente (`hold_expires_at` / reserved_until). */
  expiresAt?: string
}

export interface CheckoutResult {
  provider: SupportedPaymentProvider
  preferenceId: string
  checkoutUrl: string
  rawResponse?: unknown
}

export interface WebhookVerificationResult {
  isValid: boolean
  orderId: string
  transactionId: string
  status: "approved" | "rejected" | "pending"
  amount: number
  rawPayload: unknown
}

export interface IPaymentGatewayAdapter {
  readonly provider: SupportedPaymentProvider
  createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutResult>
  verifyWebhook(req: Request): Promise<WebhookVerificationResult>
}
