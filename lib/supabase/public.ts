import "server-only"

import { createClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

/**
 * Anon client without cookies. Public catalog/event reads stay ISR-compatible.
 * Do not use for user-scoped Auth or profile checks.
 */
export function createPublicClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    )
  }

  return createClient<Database>(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export type PublicSupabase = ReturnType<typeof createPublicClient>
