"use client"

import { getBrowserAuthUser } from "@/lib/supabase/browser-auth"
import { createClient } from "@/lib/supabase/client"

export async function hasCheckoutAuthSession(): Promise<boolean> {
  return Boolean(await getBrowserAuthUser())
}

/**
 * UID anónimo solo para holds / pagar (RLS). Nunca desde el botón
 * "Continuar como invitado" y nunca via `signUp` / OTP.
 */
export async function ensureGuestCheckoutSession(): Promise<boolean> {
  if (await getBrowserAuthUser()) return true

  const supabase = createClient()
  try {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) return false
    return Boolean(data.session?.user ?? data.user)
  } catch {
    return false
  }
}
