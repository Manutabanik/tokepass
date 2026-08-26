"use client"

import type { User } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/client"

/**
 * Reads the local Auth session. Does not call `/auth/v1/user`.
 * Preview origins are often missing from Supabase CORS / redirect allowlists;
 * `getUser()` then fails in the browser even when cookies are valid.
 */
export async function getBrowserAuthUser(): Promise<User | null> {
  const supabase = createClient()
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.user ?? null
  } catch {
    return null
  }
}
