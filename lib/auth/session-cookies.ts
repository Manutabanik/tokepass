import { AUTH_NEXT_COOKIE } from "@/lib/auth/callback-url"

export function isSupabaseAuthCookieName(name: string): boolean {
  return name.startsWith("sb-") || name === AUTH_NEXT_COOKIE
}

export function shouldPurgeAuthSessionOnLoginError(
  error: string | null | undefined,
): boolean {
  return Boolean(error?.trim())
}

export function expiredAuthCookieOptions(secure: boolean): {
  path: string
  maxAge: number
  sameSite: "lax"
  secure: boolean
} {
  return {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    secure,
  }
}
