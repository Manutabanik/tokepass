"use client"

import { createClient } from "@/lib/supabase/client"

export async function hasCheckoutAuthSession(): Promise<boolean> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return Boolean(user)
}

/**
 * Anonymous Auth for cart holds and pay. Call on Continuar / pagar,
 * not when the buyer only opens the ticket list.
 */
export async function ensureGuestCheckoutSession(): Promise<boolean> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) return true

  const { error } = await supabase.auth.signInAnonymously()
  return !error
}
