import "server-only"

/**
 * Helpers de Checkout Pro / preferencias Mercado Pago.
 * La creación real de la preferencia vive en `createPaymentPreference(orderId)`
 * (flujo order-first: reserva stock → congela total All-In → Preference).
 */

export {
  getMercadoPagoAccessToken,
  getMercadoPagoClient,
  getMercadoPagoPublicKey,
  getMercadoPagoSandboxBuyerEmail,
  getMercadoPagoWebhookSecret,
  getSiteUrl,
  isMercadoPagoSandboxMode,
  isMercadoPagoSandboxToken,
  resolveCheckoutInitPoint,
} from "@/lib/mercadopago"

export type CheckoutPreferenceBuyer = {
  email?: string
  name?: string
  surname?: string
  identification?: {
    type: "DNI" | "CUIL" | "CUIT" | string
    number: string
  }
}

export type CheckoutPreferenceUrls = {
  success: string
  failure: string
  pending: string
  notificationUrl: string
}

export function buildCheckoutBackUrls(
  siteUrl: string,
  orderId: string,
): CheckoutPreferenceUrls {
  const base = siteUrl.replace(/\/$/, "")
  return {
    success: `${base}/checkout/success?order_id=${orderId}`,
    failure: `${base}/checkout/failure?order_id=${orderId}`,
    pending: `${base}/checkout/pending?order_id=${orderId}`,
    notificationUrl: `${base}/api/webhooks/mercadopago`,
  }
}

export function splitBuyerName(fullName: string | null | undefined): {
  name?: string
  surname?: string
} {
  const cleaned = fullName?.trim()
  if (!cleaned) return {}
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return { name: parts[0] }
  return {
    name: parts[0],
    surname: parts.slice(1).join(" "),
  }
}

/**
 * Arma el payer de Checkout Pro.
 * En sandbox: usa MP_SANDBOX_BUYER_EMAIL si existe; si no, omite email
 * para evitar rechazo de cuentas reales vs usuarios de prueba.
 */
export function buildPreferencePayer(input: {
  email?: string | null
  fullName?: string | null
  dni?: string | null
  sandboxMode?: boolean
  sandboxBuyerEmail?: string | null
}): CheckoutPreferenceBuyer | undefined {
  const { name, surname } = splitBuyerName(input.fullName)
  const dni = input.dni?.replace(/\D/g, "") || undefined

  let email = input.email?.trim() || undefined
  if (input.sandboxMode) {
    const sandboxEmail = input.sandboxBuyerEmail?.trim()
    email = sandboxEmail || undefined
  }

  if (!email && !name && !dni) return undefined

  return {
    ...(email ? { email } : {}),
    ...(name ? { name } : {}),
    ...(surname ? { surname } : {}),
    ...(dni
      ? {
          identification: {
            type: "DNI",
            number: dni,
          },
        }
      : {}),
  }
}
