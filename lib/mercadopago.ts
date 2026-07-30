import "server-only"

import { MercadoPagoConfig } from "mercadopago"

export function getMercadoPagoClient() {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()

  if (!accessToken) {
    throw new Error(
      "Falta MERCADOPAGO_ACCESS_TOKEN. Agregalo en .env.local para habilitar pagos.",
    )
  }

  return new MercadoPagoConfig({
    accessToken,
    options: {
      timeout: 10_000,
    },
  })
}

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
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
