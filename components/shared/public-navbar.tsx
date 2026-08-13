import { createClient } from "@/lib/supabase/server"
import { getInitials } from "@/lib/format"

import { PublicNavbarClient } from "@/components/shared/public-navbar-client"

export async function PublicNavbar() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let userLabel = "Mi cuenta"
  let userEmail = ""
  let userInitials = "?"
  let avatarUrl: string | null = null

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, avatar_url")
      .eq("id", user.id)
      .maybeSingle()

    userEmail = profile?.email?.trim() || user.email || ""
    userLabel = profile?.full_name?.trim() || userEmail || "Mi cuenta"
    userInitials = getInitials(
      profile?.full_name ?? null,
      userEmail || "U",
    )
    avatarUrl = profile?.avatar_url?.trim() || null
  }

  return (
    <PublicNavbarClient
      isAuthenticated={Boolean(user)}
      userLabel={userLabel}
      userEmail={userEmail}
      userInitials={userInitials}
      avatarUrl={avatarUrl}
    />
  )
}
