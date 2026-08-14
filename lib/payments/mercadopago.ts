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
  isLocalSiteUrl,
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
  const orderFallback = `${base}/cuenta/compras/${orderId}`
  return {
    success: `${base}/checkout/success?order_id=${orderId}`,
    failure: orderFallback,
    pending: orderFallback,
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
 * En sandbox: solo email de prueba (MP_SANDBOX_BUYER_EMAIL). Sin email de prueba,
 * se omite el payer completo (name/DNI reales suelen romper Sandbox).
 */
export function buildPreferencePayer(input: {
  email?: string | null
  fullName?: string | null
  dni?: string | null
  sandboxMode?: boolean
  sandboxBuyerEmail?: string | null
}): CheckoutPreferenceBuyer | undefined {
  if (input.sandboxMode) {
    const sandboxEmail = input.sandboxBuyerEmail?.trim()
    if (!sandboxEmail) return undefined
    return { email: sandboxEmail }
  }

  const email = input.email?.trim() || undefined
  const { name, surname } = splitBuyerName(input.fullName)
  const dni = input.dni?.replace(/\D/g, "") || undefined

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
