"use client"

import { ensureGuestCheckoutSessionAction } from "@/app/actions/guest-checkout-session"
import { getBrowserAuthUser } from "@/lib/supabase/browser-auth"

export async function hasCheckoutAuthSession(): Promise<boolean> {
  return Boolean(await getBrowserAuthUser())
}

/**
 * Sesión de invitado para holds / pagar. Nunca `signUp` ni
 * `signInAnonymously` (GoTrue pega eso a /auth/v1/signup → 422).
 */
export async function ensureGuestCheckoutSession(): Promise<boolean> {
  if (await getBrowserAuthUser()) return true
  try {
    return await ensureGuestCheckoutSessionAction()
  } catch {
    return false
  }
}
