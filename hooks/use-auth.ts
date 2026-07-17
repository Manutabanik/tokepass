"use client"

import type { User } from "@supabase/supabase-js"
import { useEffect, useMemo, useState } from "react"

import { createClient } from "@/lib/supabase/client"

export function useAuth() {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true

    supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setUser(data.user)
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
