"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"

function subscribeOnline(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange)
  window.addEventListener("offline", onStoreChange)
  return () => {
    window.removeEventListener("online", onStoreChange)
    window.removeEventListener("offline", onStoreChange)
  }
}

function getOnlineSnapshot() {
  return navigator.onLine
}

function getOnlineServerSnapshot() {
  return true
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    getOnlineServerSnapshot,
  )
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
