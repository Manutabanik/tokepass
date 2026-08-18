"use client"

import { useEffect } from "react"

/**
 * Registra el Service Worker de la billetera PWA.
 * En desarrollo: desregistra SW residuales para no romper HMR/Turbopack.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return
    }

    const enableInDev = process.env.NEXT_PUBLIC_PWA === "1"
    const isProd = process.env.NODE_ENV === "production"

    if (!isProd && !enableInDev) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) {
          void reg.unregister()
        }
      })
      if ("caches" in window) {
        void caches.keys().then((keys) => {
          for (const key of keys) {
            if (key.startsWith("tokepass-wallet-")) {
              void caches.delete(key)
            }
          }
        })
      }
      return
    }

    let cancelled = false
    let reloading = false

    const onControllerChange = () => {
      if (reloading || cancelled) return
      reloading = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    )

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (cancelled) return
        registration.update().catch(() => {})
        if (registration.waiting) {
          registration.waiting.postMessage("SKIP_WAITING")
        }
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing
          if (!worker) return
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage("SKIP_WAITING")
            }
          })
        })
        registration.active?.postMessage({
          type: "CACHE_TICKET_ASSETS",
          urls: ["/offline/billetera"],
        })
      })
      .catch((error: unknown) => {
        console.warn("[pwa] SW register failed", error)
      })

    return () => {
      cancelled = true
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      )
    }
  }, [])

  return null
}
