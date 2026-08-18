/* Tokepass PWA Service Worker — Offline-First billetera /cuenta/entradas */

const CACHE_VERSION = "tokepass-wallet-v8"
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

function isLocalhost() {
  return (
    self.location.hostname === "localhost" ||
    self.location.hostname === "127.0.0.1"
  )
}

function isStaticAsset(url) {
  if (url.pathname.startsWith("/_next/")) return false

  return (
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/") ||
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

/**
 * Extrae assets reales de Next. El character class NO puede incluir `\\s`
 * como si fuera whitespace: en un regex literal `\\s` excluye la letra "s"
 * y corta `/_next/static/chunks/...` en `/_next/static/chunk`.
 */
const NEXT_STATIC_ASSET_RE =
  /\/_next\/static\/[a-zA-Z0-9/_.,%-]+\.(?:js|css|woff2|woff|png|svg|webp)(?:\?[^"' \t\n\r>]*)?/g

function extractNextStaticUrls(html) {
  return [...new Set(html.match(NEXT_STATIC_ASSET_RE) ?? [])]
}

function isCacheableNextStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") &&
    /\.(?:js|css|woff2|woff|png|svg|webp)$/i.test(url.pathname)
  )
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
            if (response.ok && !response.redirected) {
              await cache.put(url, response.clone())
              if (url === "/offline/billetera") {
                const html = await response.text()
                await Promise.allSettled(
                  extractNextStaticUrls(html).map(async (asset) => {
                    const assetRes = await fetch(asset, {
                      credentials: "same-origin",
                    })
                    if (assetRes.ok) await cache.put(asset, assetRes.clone())
                  }),
                )
              }
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
  if (cached) return cached

  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin

  try {
    const fresh = sameOrigin
      ? await fetch(request)
      : await fetch(request, { mode: "no-cors" }).catch(() => fetch(request))
    if (fresh && (fresh.ok || (!sameOrigin && fresh.type === "opaque"))) {
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

async function networkFirstSameOrigin(request) {
  const cache = await caches.open(ASSET_CACHE)
  try {
    const fresh = await fetch(request)
    if (fresh.ok) {
      await cache.put(request, fresh.clone())
    }
    return fresh
  } catch {
    const cached = await cache.match(request)
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
    if (fresh.ok) {
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
        const sameOrigin = url.origin === self.location.origin

        if (sameOrigin && shouldSkipDocumentCache(url)) {
          return
        }

        if (
          sameOrigin &&
          !url.pathname.startsWith("/offline/") &&
          !isStaticAsset(url) &&
          !isCacheableNextStatic(url)
        ) {
          return
        }

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

        await assets.put(url.href, response.clone())

        if (sameOrigin && url.pathname.startsWith("/offline/")) {
          const html = await response.text()
          await Promise.allSettled(
            extractNextStaticUrls(html).map(async (asset) => {
              const assetRes = await fetch(asset, { credentials: "same-origin" })
              if (assetRes.ok) await assets.put(asset, assetRes.clone())
            }),
          )
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

  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/")) {
    if (
      !isLocalhost() &&
      isCacheableNextStatic(url)
    ) {
      event.respondWith(networkFirstSameOrigin(request))
    }
    return
  }

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

  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
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
