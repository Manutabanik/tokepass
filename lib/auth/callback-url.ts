import { safeInternalNextPath } from "@/lib/auth/next-path"

export const AUTH_NEXT_COOKIE = "tokepass.auth.next"

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1"
}

export function normalizeAuthOrigin(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

export function isAllowedAuthOrigin(
  origin: string,
  siteUrl?: string | null,
): boolean {
  const normalized = normalizeAuthOrigin(origin)
  if (!normalized) return false
  const url = new URL(normalized)
  if (isLocalHostname(url.hostname)) return true
  if (url.protocol === "https:" && url.hostname.endsWith(".vercel.app")) {
    return true
  }
  const configured = normalizeAuthOrigin(siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL)
  return Boolean(configured && configured === normalized)
}

export function resolveAuthRequestOrigin(input: {
  origin?: string | null
  forwardedHost?: string | null
  forwardedProto?: string | null
  host?: string | null
  siteUrl?: string | null
}): string {
  const siteUrl = input.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? null
  const candidates: string[] = []

  if (input.origin) candidates.push(input.origin)

  const forwardedHost = input.forwardedHost?.split(",")[0]?.trim()
  if (forwardedHost) {
    const proto =
      input.forwardedProto?.split(",")[0]?.trim() ||
      (isLocalHostname(forwardedHost) ? "http" : "https")
    candidates.push(`${proto}://${forwardedHost}`)
  }

  if (input.host) {
    const host = input.host.split(",")[0]?.trim()
    if (host) {
      const proto = isLocalHostname(host) ? "http" : "https"
      candidates.push(`${proto}://${host}`)
    }
  }

  if (siteUrl) candidates.push(siteUrl)

  for (const raw of candidates) {
    const origin = normalizeAuthOrigin(raw)
    if (origin && isAllowedAuthOrigin(origin, siteUrl)) return origin
  }

  return "http://localhost:3000"
}

/** Google OAuth exige esta URL exacta en el allowlist. Sin `?next=`. */
export function buildAuthCallbackUrl(
  origin: string,
  next?: string | null,
): string {
  const base = `${origin.replace(/\/$/, "")}/auth/callback`
  const safe = safeInternalNextPath(next)
  if (!safe) return base
  return `${base}?next=${encodeURIComponent(safe)}`
}

export function authNextCookieOptions(clear = false): {
  path: string
  maxAge: number
  sameSite: "lax"
  httpOnly: true
  secure: boolean
} {
  return {
    path: "/",
    maxAge: clear ? 0 : 60 * 10,
    sameSite: "lax",
    httpOnly: true,
    secure:
      process.env.VERCEL === "1" || process.env.VERCEL_ENV === "production",
  }
}
