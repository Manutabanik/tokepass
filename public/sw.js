/* Tokepass PWA Service Worker — Offline-First billetera /cuenta/entradas */

const CACHE_VERSION = "tokepass-wallet-v11"
const ASSET_CACHE = `${CACHE_VERSION}-assets`

const PRECACHE_URLS = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/manifest.webmanifest",
  "/brand/tokepass-mark.png",
  "/offline/billetera",
]

const OFFLINE_WALLET_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Tokepass Offline</title><style>body{margin:0;background:#090014;color:#fff;font-family:system-ui;display:grid;min-height:100vh;place-items:center;padding:24px;text-align:center}a{color:#e879f9}p{color:#a1a1aa;line-height:1.5}</style></head><body><div><h1>Modo sin conexion</h1><p>Las entradas viven en este dispositivo. Abri la billetera offline para mostrar el QR.</p><p><a href="/offline/billetera">Abrir entradas</a></p></div></body></html>`

function isImagePath(url) {
  return /\.(?:png|jpe?g|webp|gif|svg|avif)$/i.test(url.pathname)
}

function isSupabaseHost(url) {
  return url.hostname.includes("supabase")
}

function isPublicStorageImage(url) {
  return (
    isSupabaseHost(url) &&
    url.pathname.includes("/storage/v1/object/public/") &&
    isImagePath(url)
  )
}

function isSameOrigin(url) {
  return url.origin === self.location.origin
}

function isStaticAsset(url) {
  if (!isSameOrigin(url)) return false
  if (url.pathname.startsWith("/_next/")) return false

  return (
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".woff2") ||
    isImagePath(url)
  )
}

function isWalletRoute(url) {
  return (
    url.pathname === "/cuenta/entradas" ||
    url.pathname.startsWith("/cuenta/entradas/") ||
    url.pathname === "/my-tickets" ||
    url.pathname.startsWith("/my-tickets/") ||
    url.pathname.startsWith("/tickets/")
  )
}

function shouldSkipDocumentCache(url) {
  if (url.pathname.startsWith("/offline/")) return false
  return (
    url.pathname.startsWith("/cuenta/") ||
    url.pathname === "/cuenta" ||
    url.pathname.startsWith("/tickets/") ||
    url.pathname === "/my-tickets" ||
    url.pathname.startsWith("/my-tickets/") ||
    url.pathname === "/mis-tickets" ||
    url.pathname.startsWith("/mis-tickets/")
  )
}

function isIncompleteNextStatic(url) {
  const path = url.pathname
  if (!path.startsWith("/_next/")) return false
  if (path === "/_next/static/chunk" || path.endsWith("/chunk")) return true
  if (path.endsWith("-") || path.endsWith("/")) return true
  return !/\.(?:js|css|woff2|woff|png|svg|webp)$/i.test(path)
}

function shouldBypass(request, url) {
  if (request.method !== "GET") return true
  if (url.searchParams.has("_rsc")) return true
  if (request.headers.get("RSC") === "1") return true
  if (url.pathname.startsWith("/api/")) return true
  if (url.pathname.startsWith("/auth/")) return true
  if (url.pathname === "/sw.js") return true

  // Next internals and RSC payloads must hit the network untouched.
  if (url.pathname.startsWith("/_next/")) return true

  // <img> / preload use no-cors. Rewriting those as 502 Opaque breaks flyers.
  if (request.mode === "no-cors") return true

  // Auth / REST / Realtime / Storage: never synthesize a response.
  if (isSupabaseHost(url)) return true

  if (isIncompleteNextStatic(url)) return true

  return false
}

function usableResponse(response) {
  return Boolean(response && response.ok && response.type !== "opaque")
}

function offlineHtmlResponse() {
  return new Response(OFFLINE_WALLET_HTML, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(ASSET_CACHE)
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { credentials: "same-origin" })
            if (usableResponse(response) && !response.redirected) {
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

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  if (cached && cached.type !== "opaque") return cached

  try {
    const fresh = await fetch(request)
    if (usableResponse(fresh)) {
      await cache.put(request, fresh.clone())
    }
    if (fresh) return fresh
    return (
      cached ||
      new Response("", {
        status: 503,
        statusText: "Offline",
      })
    )
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

async function networkFirstOfflineShell(request) {
  const cache = await caches.open(ASSET_CACHE)
  try {
    const fresh = await fetch(request)
    if (usableResponse(fresh)) {
      await cache.put("/offline/billetera", fresh.clone())
      return fresh
    }
  } catch {
    // fall through
  }
  return (await cache.match("/offline/billetera")) || offlineHtmlResponse()
}

async function networkThenOfflineWallet(request) {
  try {
    return await fetch(request)
  } catch {
    const cache = await caches.open(ASSET_CACHE)
    if (await cache.match("/offline/billetera")) {
      return Response.redirect(
        new URL("/offline/billetera", self.location.origin),
        302,
      )
    }
    return offlineHtmlResponse()
  }
}

async function cacheUrls(urls) {
  const assets = await caches.open(ASSET_CACHE)

  await Promise.allSettled(
    urls.map(async (raw) => {
      try {
        const url = new URL(raw, self.location.origin)
        const sameOrigin = isSameOrigin(url)

        if (isIncompleteNextStatic(url)) return
        if (url.pathname.startsWith("/_next/")) return
        if (isSupabaseHost(url) && !isPublicStorageImage(url)) return

        if (sameOrigin && shouldSkipDocumentCache(url)) return

        if (
          sameOrigin &&
          !url.pathname.startsWith("/offline/") &&
          !isStaticAsset(url)
        ) {
          return
        }

        if (!sameOrigin && !isPublicStorageImage(url)) return

        const response = await fetch(url.href, {
          credentials: sameOrigin ? "same-origin" : "omit",
          mode: sameOrigin ? "same-origin" : "cors",
        })

        if (!usableResponse(response)) return
        if (response.redirected && sameOrigin) return

        await assets.put(url.href, response.clone())
      } catch {
        // best-effort — never fall back to no-cors
      }
    }),
  )
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (shouldBypass(request, url)) return

  if (!isSameOrigin(url)) {
    return
  }

  if (request.mode === "navigate" && url.pathname.startsWith("/offline/")) {
    event.respondWith(networkFirstOfflineShell(request))
    return
  }

  if (request.mode === "navigate" && isWalletRoute(url)) {
    event.respondWith(networkThenOfflineWallet(request))
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
