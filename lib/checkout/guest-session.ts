"use client"

import { createClient } from "@/lib/supabase/client"

/** Best-effort anonymous session so guest checkout can reserve against a user id. */
export async function ensureGuestCheckoutSession(): Promise<boolean> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) return true

  const { error } = await supabase.auth.signInAnonymously()
  return !error
}
