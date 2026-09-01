import "server-only"

import { cookies } from "next/headers"

import { AUTH_NEXT_COOKIE } from "@/lib/auth/callback-url"
import {
  expiredAuthCookieOptions,
  isSupabaseAuthCookieName,
} from "@/lib/auth/session-cookies"

export async function clearSupabaseAuthCookies(): Promise<void> {
  const store = await cookies()
  const names = new Set(
    store
      .getAll()
      .map((cookie) => cookie.name)
      .filter(isSupabaseAuthCookieName),
  )
  names.add(AUTH_NEXT_COOKIE)

  const secure =
    process.env.VERCEL === "1" || process.env.VERCEL_ENV === "production"

  for (const name of names) {
    store.delete(name)
    store.set(name, "", expiredAuthCookieOptions(secure))
  }
}
