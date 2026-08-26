import { createBrowserClient } from "@supabase/ssr"

import type { Database } from "@/types/database"

/**
 * Browser Auth talks to `NEXT_PUBLIC_SUPABASE_URL` from this origin.
 * Each Vercel preview is a new host: add `https://*.vercel.app/**` to
 * Supabase Authentication → URL Configuration → Additional Redirect URLs
 * or `/auth/v1/user` fails CORS and checkout holds reject.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
