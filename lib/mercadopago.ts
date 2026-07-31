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

export function getMercadoPagoClient() {
  return new MercadoPagoConfig({
    accessToken: getMercadoPagoAccessToken(),
    options: {
      timeout: 10_000,
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

/** Preferencia sandbox si el access token es TEST-; si no, init_point productivo. */
export function resolveCheckoutInitPoint(created: {
  init_point?: string | null
  sandbox_init_point?: string | null
}): string | null {
  if (isMercadoPagoSandboxToken()) {
    return created.sandbox_init_point ?? created.init_point ?? null
  }
  return created.init_point ?? created.sandbox_init_point ?? null
}
