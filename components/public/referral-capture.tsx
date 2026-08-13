"use client"

import { useEffect, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"

import { trackReferralVisit } from "@/app/actions/promoters"
import {
  getStoredReferralCode,
  normalizeReferralCode,
  persistReferralCode,
  REFERRAL_STORAGE_KEY,
} from "@/lib/referral"

function visitorKey(): string {
  try {
    const existing = sessionStorage.getItem("tokepass_visitor")
    if (existing) return existing
    const next =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `v_${Date.now().toString(36)}`
    sessionStorage.setItem("tokepass_visitor", next)
    return next
  } catch {
    return `v_${Date.now().toString(36)}`
  }
}

/**
 * Captura ?ref= en cualquier ruta B2C: sessionStorage + cookie + visita.
 * También rehidrata sessionStorage desde la cookie si el usuario vuelve.
 */
export function ReferralCapture() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const lastTracked = useRef<string | null>(null)

  useEffect(() => {
    const fromQuery = normalizeReferralCode(searchParams.get("ref"))
    const stored = getStoredReferralCode()
    const code = fromQuery ?? stored
    if (!code) return

    persistReferralCode(code)

    // Evita doble track en Strict Mode / navegación idéntica.
    const trackKey = `${code}:${pathname}`
    if (lastTracked.current === trackKey) return
    lastTracked.current = trackKey

    // Solo contamos visita cuando llega un ?ref= fresco (nuevo clic).
    if (!fromQuery) return

    void trackReferralVisit({
      referralCode: code,
      path: pathname,
      visitorKey: visitorKey(),
    })
  }, [pathname, searchParams])

  // Rehidratación temprana si hay cookie pero no sessionStorage.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(REFERRAL_STORAGE_KEY)) return
      const stored = getStoredReferralCode()
      if (stored) persistReferralCode(stored)
    } catch {
      // ignore
    }
  }, [])

  return null
}
