"use client"

import { getBrowserAuthUser } from "@/lib/supabase/browser-auth"
import { createClient } from "@/lib/supabase/client"

export async function hasCheckoutAuthSession(): Promise<boolean> {
  return Boolean(await getBrowserAuthUser())
}

/**
 * Anonymous Auth for cart holds and pay. Call on Continuar / pagar,
 * not when the buyer only opens the ticket list.
 */
export async function ensureGuestCheckoutSession(): Promise<boolean> {
  if (await getBrowserAuthUser()) return true

  const supabase = createClient()
  try {
    const { error } = await supabase.auth.signInAnonymously()
    return !error
  } catch {
    return false
  }
}
