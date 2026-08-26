"use client"

import type { User } from "@supabase/supabase-js"
import { useEffect, useMemo, useState } from "react"

import { getBrowserAuthUser } from "@/lib/supabase/browser-auth"
import { createClient } from "@/lib/supabase/client"

export function useAuth() {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true

    void getBrowserAuthUser().then((nextUser) => {
      if (active) {
        setUser(nextUser)
        setIsLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [supabase])

  return { user, isLoading, supabase }
}
