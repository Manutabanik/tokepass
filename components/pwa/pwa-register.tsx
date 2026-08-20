"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

import { purgeExpiredOfflineTickets } from "@/lib/offline-store"
import { requestDoorAssetCache } from "@/lib/pwa/door-cache"
import { IosInstructionsModal } from "@/components/pwa/ios-instructions-modal"
import { PwaUpdateBanner } from "@/components/pwa/pwa-update-banner"
import {
  ensurePwaInstallCapture,
  setPwaWaitingWorker,
} from "@/lib/pwa/runtime"
import { usePwaRuntimeStore } from "@/lib/stores/pwa-runtime-store"

const SW_RESET_KEY = "tokepass-sw-reset-v11"

function pwaEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return true
  return process.env.NEXT_PUBLIC_PWA === "1"
}

function bindWaitingWorker(registration: ServiceWorkerRegistration) {
  if (registration.waiting && navigator.serviceWorker.controller) {
    setPwaWaitingWorker(registration.waiting)
  }
}

/**
 * Registra el Service Worker de la billetera PWA.
 * En desarrollo: desregistra SW residuales para no romper HMR/Turbopack.
 * En producción: no recarga el documento al tomar control — eso aborta
 * prefetch RSC y server actions (POST del checkout). La recarga la pide
 * el usuario desde el banner de nueva versión.
 */
export function PwaRegister() {
  const pathname = usePathname()

  useEffect(() => {
    ensurePwaInstallCapture()
    void purgeExpiredOfflineTickets().catch(() => {})
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return
    }

    if (!pwaEnabled()) {
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
    let registration: ServiceWorkerRegistration | null = null

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

    function onUpdateFound() {
      if (!registration) return
      const worker = registration.installing
      if (!worker) return
      worker.addEventListener("statechange", () => {
        if (
          worker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          setPwaWaitingWorker(registration?.waiting ?? worker)
        }
      })
    }

    void (async () => {
      const hadLegacy = await resetLegacyWorkers()
      if (cancelled) return
      if (hadLegacy) {
        window.location.reload()
        return
      }

      try {
        registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        })
        if (cancelled) return

        bindWaitingWorker(registration)
        registration.addEventListener("updatefound", onUpdateFound)
        registration.update().catch(() => {})

        if (!navigator.serviceWorker.controller && registration.waiting) {
          registration.waiting.postMessage("SKIP_WAITING")
        }

        registration.active?.postMessage({
          type: "CACHE_TICKET_ASSETS",
          urls: ["/offline/billetera"],
        })
        if (window.location.pathname.startsWith("/puerta")) {
          requestDoorAssetCache()
        }
      } catch (error: unknown) {
        console.warn("[pwa] SW register failed", error)
      }
    })()

    return () => {
      cancelled = true
      registration?.removeEventListener("updatefound", onUpdateFound)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return
    }
    if (!pwaEnabled()) return

    void navigator.serviceWorker.getRegistration("/").then((reg) => {
      if (!reg) return
      bindWaitingWorker(reg)
      void reg.update().catch(() => {})
    })
    if (pathname === "/puerta" || pathname.startsWith("/puerta/")) {
      requestDoorAssetCache()
    }
  }, [pathname])

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return
    }
    if (!pwaEnabled()) return

    function checkForUpdate() {
      if (document.visibilityState !== "visible") return
      void navigator.serviceWorker.getRegistration("/").then((reg) => {
        if (!reg) return
        bindWaitingWorker(reg)
        void reg.update().catch(() => {})
      })
    }

    function onControllerChange() {
      if (usePwaRuntimeStore.getState().applyingUpdate) {
        window.location.reload()
      }
    }

    document.addEventListener("visibilitychange", checkForUpdate)
    window.addEventListener("focus", checkForUpdate)
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    )
    return () => {
      document.removeEventListener("visibilitychange", checkForUpdate)
      window.removeEventListener("focus", checkForUpdate)
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      )
    }
  }, [])

  return (
    <>
      <PwaUpdateBanner />
      <IosInstructionsModal />
    </>
  )
}
