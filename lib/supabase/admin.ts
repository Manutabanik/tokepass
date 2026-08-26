import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

type AdminClient = SupabaseClient<Database>

const globalForAdmin = globalThis as {
  __tokepassAdminClient?: AdminClient
}

/**
 * Un solo cliente service-role por isolate. El tráfico masivo va a PostgREST;
 * cualquier SQL directo debe usar `resolveServerDatabaseUrl()` (pooler 6543).
 */
export function tryCreateAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return null

  if (globalForAdmin.__tokepassAdminClient) {
    return globalForAdmin.__tokepassAdminClient
  }

  const client = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  globalForAdmin.__tokepassAdminClient = client
  return client
}

export function createAdminClient() {
  const client = tryCreateAdminClient()
  if (!client) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.",
    )
  }
  return client
}
