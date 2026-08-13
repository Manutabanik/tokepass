import { createClient } from "@/lib/supabase/server"

import { PublicNavbarClient } from "@/components/shared/public-navbar-client"

export async function PublicNavbar() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return <PublicNavbarClient isAuthenticated={Boolean(user)} />
}
