"use client"

import { useCallback, useEffect, useState } from "react"

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  )

  useEffect(() => {
    function handleOnline() {
      setOnline(true)
    }
    function handleOffline() {
      setOnline(false)
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    setOnline(navigator.onLine)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  return online
}

export function useNetworkListener(
  onOnline?: () => void,
  onOffline?: () => void,
): boolean {
  const online = useOnlineStatus()

  useEffect(() => {
    if (online) onOnline?.()
    else onOffline?.()
  }, [online, onOnline, onOffline])

  return online
}

export function useForceOnlineCheck(): () => boolean {
  return useCallback(() => {
    if (typeof navigator === "undefined") return true
    return navigator.onLine
  }, [])
}
