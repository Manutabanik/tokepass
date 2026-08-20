import { headers } from "next/headers"

export async function getRequestIp(): Promise<string> {
  try {
    const store = await headers()
    return (
      store.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      store.get("x-real-ip")?.trim() ||
      store.get("cf-connecting-ip")?.trim() ||
      "unknown"
    )
  } catch {
    return "unknown"
  }
}

export async function getRequestUserAgent(): Promise<string> {
  try {
    const store = await headers()
    return (store.get("user-agent") ?? "").trim().slice(0, 512)
  } catch {
    return ""
  }
}

export function isRateLimitableIp(ip: string): boolean {
  return Boolean(ip) && ip !== "unknown"
}
