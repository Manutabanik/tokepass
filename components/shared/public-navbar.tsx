"use client"

import { useEffect, useState } from "react"

import { PublicNavbarClient } from "@/components/shared/public-navbar-client"
import { getInitials } from "@/lib/format"
import { getBrowserAuthUser } from "@/lib/supabase/browser-auth"
import { createClient } from "@/lib/supabase/client"

type NavbarSession = {
  isAuthenticated: boolean
  userLabel: string
  userEmail: string
  userInitials: string
  avatarUrl: string | null
}

const GUEST_SESSION: NavbarSession = {
  isAuthenticated: false,
  userLabel: "Mi cuenta",
  userEmail: "",
  userInitials: "?",
  avatarUrl: null,
}

export function PublicNavbar() {
  const [session, setSession] = useState<NavbarSession>(GUEST_SESSION)

  useEffect(() => {
    let cancelled = false

    async function loadSession() {
      const supabase = createClient()
      const user = await getBrowserAuthUser()
      if (cancelled) return
      if (!user) {
        setSession(GUEST_SESSION)
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email, avatar_url")
        .eq("id", user.id)
        .maybeSingle()
      if (cancelled) return

      const userEmail = profile?.email?.trim() || user.email || ""
      const userLabel = profile?.full_name?.trim() || userEmail || "Mi cuenta"
      setSession({
        isAuthenticated: true,
        userLabel,
        userEmail,
        userInitials: getInitials(profile?.full_name ?? null, userEmail || "U"),
        avatarUrl: profile?.avatar_url?.trim() || null,
      })
    }

    void loadSession().catch(() => {
      if (!cancelled) setSession(GUEST_SESSION)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return <PublicNavbarClient {...session} />
}
