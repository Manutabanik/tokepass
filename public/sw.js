/* Tokepass PWA Service Worker — Offline-First billetera /my-tickets */

const CACHE_VERSION = "tokepass-wallet-v4"
const SHELL_CACHE = `${CACHE_VERSION}-shell`
const ASSET_CACHE = `${CACHE_VERSION}-assets`

const PRECACHE_URLS = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/manifest.webmanifest",
]

function isNavigableRequest(request) {
  return request.mode === "navigate" || request.destination === "document"
}

function isStaticAsset(url) {
  // Nunca cachear runtime/HMR de Next — provoca módulos stale (factory missing).
  if (url.pathname.startsWith("/_next/")) return false

  return (
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg")
  )
}

function isWalletRoute(url) {
  return (
    url.pathname === "/my-tickets" ||
    url.pathname.startsWith("/my-tickets/") ||
    url.pathname.startsWith("/tickets/")
  )
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { credentials: "same-origin" })
            if (response.ok && !response.redirected) {
              await cache.put(url, response.clone())
            }
          } catch {
            // Precache best-effort
          }
        }),
      )
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("tokepass-wallet-") &&
              !key.startsWith(CACHE_VERSION),
          )
          .map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

async function networkFirstWallet(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const fresh = await fetch(request)
    if (fresh && fresh.ok) {
      await cache.put(request, fresh.clone())
    }
    return fresh
  } catch {
    const cached =
      (await cache.match(request)) ||
      (await cache.match("/my-tickets")) ||
      (await caches.match("/my-tickets"))

    if (cached) return cached

    return new Response(
      "<!doctype html><html lang='es'><head><meta charset='utf-8'/><meta name='viewport' content='width=device-width,initial-scale=1'/><title>Tokepass Offline</title><style>body{margin:0;background:#000;color:#fff;font-family:system-ui;display:grid;min-height:100vh;place-items:center;padding:24px;text-align:center}p{color:#a1a1aa}</style></head><body><div><h1>Tu entrada está en el dispositivo</h1><p>Abrí la billetera al menos una vez con internet. El QR vive offline.</p></div></body></html>",
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    )
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const fresh = await fetch(request, { mode: "no-cors" }).catch(() =>
      fetch(request),
    )
    if (fresh && (fresh.ok || fresh.type === "opaque")) {
      await cache.put(request, fresh.clone())
    }
    return fresh
  } catch {
    return (
      cached ||
      new Response("", {
        status: 503,
        statusText: "Offline",
      })
    )
  }
}

async function cacheUrls(urls) {
  const shell = await caches.open(SHELL_CACHE)
  const assets = await caches.open(ASSET_CACHE)

  await Promise.allSettled(
    urls.map(async (raw) => {
      try {
        const url = new URL(raw, self.location.origin)
        const sameOrigin = url.origin === self.location.origin

        let response
        try {
          response = await fetch(url.href, {
            credentials: sameOrigin ? "same-origin" : "omit",
            mode: sameOrigin ? "same-origin" : "cors",
          })
        } catch {
          if (!sameOrigin) {
            response = await fetch(url.href, { mode: "no-cors" })
          } else {
            return
          }
        }

        if (!response) return
        if (!response.ok && response.type !== "opaque") return
        if (response.redirected && sameOrigin) return

        if (
          sameOrigin &&
          (url.pathname.startsWith("/tickets/") ||
            url.pathname === "/my-tickets")
        ) {
          await shell.put(url.pathname + url.search, response.clone())
        } else {
          await assets.put(url.href, response.clone())
        }
      } catch {
        // best-effort
      }
    }),
  )
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)

  // Dejar que Next/Turbopack manejen su propio runtime y HMR.
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/")) {
    return
  }

  // Assets de flyers en CDN/Supabase: cache-first si ya visitados.
  if (url.origin !== self.location.origin) {
    if (
      isStaticAsset(url) ||
      url.hostname.includes("supabase") ||
      url.pathname.includes("event-flyers")
    ) {
      event.respondWith(cacheFirstAsset(request))
    }
    return
  }

  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/")
  ) {
    return
  }

  if (isNavigableRequest(request) && isWalletRoute(url)) {
    event.respondWith(networkFirstWallet(request))
    return
  }

  if (isWalletRoute(url) && !isNavigableRequest(request)) {
    event.respondWith(networkFirstWallet(request))
    return
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirstAsset(request))
  }
})

self.addEventListener("message", (event) => {
  const data = event.data
  if (data === "SKIP_WAITING") {
    self.skipWaiting()
    return
  }

  if (data && data.type === "CACHE_TICKET_ASSETS" && Array.isArray(data.urls)) {
    event.waitUntil(cacheUrls(data.urls))
  }
})
