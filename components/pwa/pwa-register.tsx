"use client"

import { useEffect } from "react"

const SW_RESET_KEY = "tokepass-sw-reset-v11"

/**
 * Registra el Service Worker de la billetera PWA.
 * En desarrollo: desregistra SW residuales para no romper HMR/Turbopack.
 * En producción: no recarga el documento al tomar control — eso aborta
 * prefetch RSC y server actions (POST del checkout).
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

    async function resetLegacyWorkers(): Promise<boolean> {
      try {
        if (window.localStorage.getItem(SW_RESET_KEY) === "1") return false
      } catch {
        // private mode
      }

      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((reg) => reg.unregister()))
      if ("caches" in window) {
        const keys = await caches.keys()
        await Promise.all(
          keys
            .filter((key) => key.startsWith("tokepass-wallet-"))
            .map((key) => caches.delete(key)),
        )
      }
      try {
        window.localStorage.setItem(SW_RESET_KEY, "1")
      } catch {
        // ignore
      }
      return regs.length > 0
    }

    void (async () => {
      const hadLegacy = await resetLegacyWorkers()
      if (cancelled) return
      if (hadLegacy) {
        window.location.reload()
        return
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        })
        if (cancelled) return
        registration.update().catch(() => {})
        if (registration.waiting) {
          registration.waiting.postMessage("SKIP_WAITING")
        }
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing
          if (!worker) return
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && registration.waiting) {
              registration.waiting.postMessage("SKIP_WAITING")
            }
          })
        })
        registration.active?.postMessage({
          type: "CACHE_TICKET_ASSETS",
          urls: ["/offline/billetera"],
        })
      } catch (error: unknown) {
        console.warn("[pwa] SW register failed", error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
