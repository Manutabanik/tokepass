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
 * Anonymous Auth is created only at pay confirmation.
 * Do not call this when entering the tunnel or choosing guest.
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
