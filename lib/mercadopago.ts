import "server-only"

import { MercadoPagoConfig } from "mercadopago"

/**
 * Resuelve credenciales MP aceptando nombres canónicos y alias cortos.
 * Canónico: MERCADOPAGO_* / NEXT_PUBLIC_SITE_URL
 * Alias:    MP_* / NEXT_PUBLIC_BASE_URL / NEXT_PUBLIC_MP_PUBLIC_KEY
 */
export function getMercadoPagoAccessToken(): string {
  const accessToken =
    process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ||
    process.env.MP_ACCESS_TOKEN?.trim() ||
    ""

  if (!accessToken) {
    throw new Error(
      "Falta MERCADOPAGO_ACCESS_TOKEN (o MP_ACCESS_TOKEN). Agregalo en .env.local para habilitar pagos.",
    )
  }

  return accessToken
}

export function getMercadoPagoWebhookSecret(): string | null {
  const secret =
    process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim() ||
    process.env.MP_WEBHOOK_SECRET?.trim() ||
    ""
  return secret || null
}

export function getMercadoPagoPublicKey(): string | null {
  const key =
    process.env.NEXT_PUBLIC_MP_PUBLIC_KEY?.trim() ||
    process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY?.trim() ||
    ""
  return key || null
}

export function isMercadoPagoSandboxToken(accessToken?: string): boolean {
  const token = (accessToken ?? getMercadoPagoAccessToken()).trim()
  return token.startsWith("TEST-")
}

export function assertMercadoPagoProductionSafe(accessToken?: string): void {
  if (process.env.VERCEL_ENV !== "production") return
  if (process.env.MP_FORCE_SANDBOX === "1") {
    throw new Error("MP_FORCE_SANDBOX=1 no esta permitido en produccion.")
  }
  const token = (accessToken ?? getMercadoPagoAccessToken()).trim()
  if (token.startsWith("TEST-")) {
    throw new Error(
      "El token de Mercado Pago de produccion no puede comenzar con TEST-.",
    )
  }
}

/** Sandbox de prueba: token TEST-, force flag, o entorno local/preview. */
export function isMercadoPagoSandboxMode(accessToken?: string): boolean {
  assertMercadoPagoProductionSafe(accessToken)
  if (isMercadoPagoSandboxToken(accessToken)) return true
  if (process.env.MP_FORCE_SANDBOX === "1") return true
  if (process.env.VERCEL_ENV === "production") return false
  return process.env.NODE_ENV !== "production"
}

export function getMercadoPagoSandboxBuyerEmail(): string | null {
  const email =
    process.env.MP_SANDBOX_BUYER_EMAIL?.trim() ||
    process.env.MERCADOPAGO_SANDBOX_BUYER_EMAIL?.trim() ||
    ""
  return email || null
}

export function getMercadoPagoClient() {
  const accessToken = getMercadoPagoAccessToken()
  assertMercadoPagoProductionSafe(accessToken)
  return new MercadoPagoConfig({
    accessToken,
    options: {
      timeout: 8_000,
    },
  })
}

export function getSiteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    ""

  if (configured) {
    let url: URL
    try {
      url = new URL(configured)
    } catch {
      throw new Error("NEXT_PUBLIC_SITE_URL no es una URL válida.")
    }

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("NEXT_PUBLIC_SITE_URL debe usar HTTP o HTTPS.")
    }

    if (url.pathname !== "/" || url.search || url.hash) {
      throw new Error("NEXT_PUBLIC_SITE_URL debe contener únicamente el origen.")
    }

    const isProduction =
      process.env.NODE_ENV === "production" ||
      process.env.VERCEL_ENV === "production"
    if (
      isProduction &&
      (url.protocol !== "https:" ||
        ["localhost", "127.0.0.1"].includes(url.hostname))
    ) {
      throw new Error(
        "NEXT_PUBLIC_SITE_URL debe ser un origen HTTPS público en producción.",
      )
    }

    return url.origin
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "")
  }

  return "http://localhost:3000"
}

export function isLocalSiteUrl(siteUrl?: string): boolean {
  try {
    const host = new URL(siteUrl ?? getSiteUrl()).hostname
    return host === "localhost" || host === "127.0.0.1"
  } catch {
    return true
  }
}

/**
 * En modo sandbox prioriza SIEMPRE `sandbox_init_point`.
 * En producción usa `init_point`.
 * Si estamos en sandbox y no hay sandbox_init_point, retorna null (no usar prod).
 */
export function resolveCheckoutInitPoint(created: {
  init_point?: string | null
  sandbox_init_point?: string | null
}): string | null {
  const sandboxUrl = created.sandbox_init_point?.trim() || null
  const prodUrl = created.init_point?.trim() || null

  if (isMercadoPagoSandboxMode()) {
    if (sandboxUrl) return sandboxUrl
    if (prodUrl && /sandbox/i.test(prodUrl)) return prodUrl
    return null
  }

  return prodUrl ?? sandboxUrl
}
