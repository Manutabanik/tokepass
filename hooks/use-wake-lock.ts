"use client"

import { useEffect, useRef, useState } from "react"

type WakeLockSentinelLike = {
  released: boolean
  release: () => Promise<void>
  addEventListener: (type: "release", listener: () => void) => void
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>
  }
}

/** Mantiene la pantalla encendida mientras el turno de puerta esta activo. */
export function useScreenWakeLock(enabled: boolean): boolean {
  const [held, setHeld] = useState(false)
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    if (!enabled) {
      const current = sentinelRef.current
      sentinelRef.current = null
      void current?.release().catch(() => {})
      return
    }

    let cancelled = false

    async function requestLock() {
      if (document.visibilityState !== "visible") return
      const nav = navigator as WakeLockNavigator
      if (!nav.wakeLock) return

      try {
        const previous = sentinelRef.current
        sentinelRef.current = null
        await previous?.release().catch(() => {})
        const sentinel = await nav.wakeLock.request("screen")
        if (cancelled) {
          await sentinel.release().catch(() => {})
          return
        }
        sentinelRef.current = sentinel
        setHeld(!sentinel.released)
        sentinel.addEventListener("release", () => {
          if (sentinelRef.current === sentinel) {
            setHeld(false)
          }
        })
      } catch {
        if (!cancelled) setHeld(false)
      }
    }

    void requestLock()

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void requestLock()
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisibilityChange)
      const current = sentinelRef.current
      sentinelRef.current = null
      void current?.release().catch(() => {})
    }
  }, [enabled])

  return enabled && held
}
