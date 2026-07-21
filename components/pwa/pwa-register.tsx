"use client"

import { useEffect } from "react"

/**
 * Registra el Service Worker de la billetera PWA.
 * Solo en producción (o si NEXT_PUBLIC_PWA=1) para no romper HMR en dev.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return
    }

    const enableInDev = process.env.NEXT_PUBLIC_PWA === "1"
    if (process.env.NODE_ENV !== "production" && !enableInDev) {
      return
    }

    let cancelled = false

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (cancelled) return
        registration.update().catch(() => {})
      })
      .catch((error: unknown) => {
        console.warn("[pwa] SW register failed", error)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
