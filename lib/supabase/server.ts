import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import type { Database } from "@/types/database"

/** HTTP a PostgREST. SQL directo: `resolveServerDatabaseUrl()` (pooler 6543). */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            const secure =
              process.env.VERCEL === "1" ||
              process.env.VERCEL_ENV === "production"
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, {
                ...options,
                sameSite: "lax",
                secure,
              })
            })
          } catch {
            // Server Components cannot write cookies. The root proxy refreshes them.
          }
        },
      },
    },
  )
}
