import { headers } from "next/headers"

export type CheckoutRequestContext = {
  ip: string
  ipBucket: string
  userAgent: string
}

function firstForwardedIp(value: string | null): string | null {
  if (!value) return null
  const first = value.split(",")[0]?.trim()
  return first || null
}

export async function getCheckoutRequestContext(): Promise<CheckoutRequestContext> {
  const store = await headers()
  const ip =
    firstForwardedIp(store.get("x-forwarded-for")) ||
    store.get("x-real-ip")?.trim() ||
    store.get("cf-connecting-ip")?.trim() ||
    "unknown"
  const userAgent = (store.get("user-agent") ?? "").slice(0, 512)
  return {
    ip,
    ipBucket: `checkout:fail:ip:${ip}`,
    userAgent,
  }
}

export function sanitizeDeviceHash(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? ""
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(value)) return null
  return value
}

export function sanitizeDwellMs(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null
  const rounded = Math.round(raw)
  if (rounded < 0 || rounded > 60 * 60 * 1000) return null
  return rounded
}
