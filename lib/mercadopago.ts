import "server-only"

import { MercadoPagoConfig } from "mercadopago"

export function getMercadoPagoClient() {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN

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
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) {
    return configured.replace(/\/$/, "")
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "")
  }

  return "http://localhost:3000"
}
