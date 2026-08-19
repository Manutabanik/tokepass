const DOOR_PRECACHE_URLS = [
  "/puerta",
  "/puerta/escanear",
  "/wasm/zxing_reader.wasm",
  "/brand/tokepass-mark.png",
]

/** Pide al SW cachear shell de puerta + WASM de inmediato. */
export function requestDoorAssetCache(extraUrls: string[] = []) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

  const urls = [...new Set([...DOOR_PRECACHE_URLS, ...extraUrls])]

  void navigator.serviceWorker.ready
    .then((registration) => {
      registration.active?.postMessage({
        type: "CACHE_DOOR_ASSETS",
        urls,
      })
    })
    .catch(() => {})

  void fetch("/wasm/zxing_reader.wasm", { credentials: "same-origin" }).catch(
    () => {},
  )
}
