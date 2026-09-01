"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

import { purgeStaleAuthSession } from "@/app/actions/auth"
import { shouldPurgeAuthSessionOnLoginError } from "@/lib/auth/session-cookies"
import { clearClientSessionArtifacts } from "@/lib/session-cleanup"

export function LoginErrorSessionPurge({
  error,
}: {
  error?: string | null
}) {
  const router = useRouter()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current || !shouldPurgeAuthSessionOnLoginError(error)) return
    ran.current = true

    let cancelled = false
    void (async () => {
      try {
        await clearClientSessionArtifacts()
      } catch {
        // El purge de cookies del server sigue igual.
      }
      try {
        await purgeStaleAuthSession()
      } catch {
        // Ya se limpió lo local; no bloquear el login.
      }
      if (!cancelled) router.refresh()
    })()

    return () => {
      cancelled = true
    }
  }, [error, router])

  return null
}
