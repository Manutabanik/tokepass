"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"

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

const REACHABILITY_PROBE_PATH = "/api/ping"
const REACHABILITY_TIMEOUT_MS = 4_000
const REACHABILITY_INTERVAL_MS = 45_000

async function probeReachable(signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(`${REACHABILITY_PROBE_PATH}?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      signal,
    })
    // Solo el 204 exacto prueba alcance: un portal cautivo contesta 200 + HTML.
    return response.status === 204
  } catch {
    return false
  }
}

/**
 * `navigator.onLine` solo dice si hay una interfaz de red levantada: da `true`
 * en un wifi de bar con portal cautivo, o con router sin salida a internet. En
 * la billetera eso es el peor caso, porque oculta el aviso de "sin señal"
 * justo cuando el usuario está en la puerta del evento.
 *
 * Este hook lo confirma con un sondeo real y arranca optimista para no
 * parpadear un banner de offline mientras la primera prueba está en vuelo.
 */
export function useVerifiedOnlineStatus(): boolean {
  const deviceOnline = useOnlineStatus()
  const [reachable, setReachable] = useState(true)

  useEffect(() => {
    // Sin interfaz de red no hay nada que sondear: el retorno ya da false.
    if (!deviceOnline) return

    let cancelled = false
    let generation = 0
    let activeController: AbortController | null = null

    const run = async () => {
      const current = ++generation
      const controller = new AbortController()
      activeController = controller
      const timeout = window.setTimeout(
        () => controller.abort(),
        REACHABILITY_TIMEOUT_MS,
      )

      const ok = await probeReachable(controller.signal)
      window.clearTimeout(timeout)

      // Un sondeo viejo que llega tarde no puede pisar al más reciente.
      if (!cancelled && current === generation) setReachable(ok)
    }

    const runIfVisible = () => {
      if (document.visibilityState === "visible") void run()
    }

    void run()
    const interval = window.setInterval(runIfVisible, REACHABILITY_INTERVAL_MS)
    document.addEventListener("visibilitychange", runIfVisible)

    return () => {
      cancelled = true
      activeController?.abort()
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", runIfVisible)
    }
  }, [deviceOnline])

  return deviceOnline && reachable
}
