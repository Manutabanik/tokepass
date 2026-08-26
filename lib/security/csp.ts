/**
 * Content-Security-Policy builder.
 * Production script-src uses a per-request nonce (no 'unsafe-inline').
 * Development keeps 'unsafe-eval' / 'unsafe-inline' for Next.js HMR.
 */

export function createCspNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64")
}

function isVercelHosted(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV)
}

function isVercelPreview(): boolean {
  return process.env.VERCEL_ENV === "preview"
}

export function buildContentSecurityPolicy(nonce?: string | null): string {
  const isDev = process.env.NODE_ENV === "development"
  const wasmUnsafeEval = "'wasm-unsafe-eval'"
  const nonceSrc = nonce ? `'nonce-${nonce}'` : ""
  const scriptInline = isDev || !nonce ? "'unsafe-inline'" : ""
  const scriptEval = isDev ? "'unsafe-eval'" : ""
  const vercelSsoManifestSource = isVercelHosted() ? " https://vercel.com" : ""
  // Preview injects Vercel Live / Comments. Production custom domains do not.
  // https://vercel.com/docs/vercel-toolbar/managing-toolbar
  const vercelLive = isVercelPreview()

  const supabaseHostname = (() => {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      return url ? new URL(url).hostname : null
    } catch {
      return null
    }
  })()

  const supabaseOrigin = (() => {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      return url ? new URL(url).origin : null
    } catch {
      return null
    }
  })()

  const upstashHostname = (() => {
    try {
      const url = process.env.UPSTASH_REDIS_REST_URL
      return url ? new URL(url).hostname : null
    } catch {
      return null
    }
  })()

  const connectSrc = [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    supabaseOrigin,
    "https://api.mercadopago.com",
    "https://*.mercadopago.com",
    "https://*.mercadopago.com.ar",
    "https://*.upstash.io",
    upstashHostname ? `https://${upstashHostname}` : null,
    "https://nominatim.openstreetmap.org",
    "https://apis.datos.gob.ar",
    "https://*.datos.gob.ar",
    "https://vitals.vercel-insights.com",
    "https://va.vercel-scripts.com",
    "https://connect.facebook.net",
    "https://www.facebook.com",
    "https://*.facebook.com",
    "https://analytics.tiktok.com",
    "https://*.tiktok.com",
    "https://www.google-analytics.com",
    "https://*.google-analytics.com",
    "https://analytics.google.com",
    "https://*.analytics.google.com",
    "https://www.googletagmanager.com",
    "https://*.googletagmanager.com",
    "https://www.google.com/recaptcha/",
    "https://www.gstatic.com/recaptcha/",
    "https://challenges.cloudflare.com",
    "https://p.scdn.co",
    "https://*.scdn.co",
    "https://*.spotifycdn.com",
    vercelLive ? "https://vercel.live" : null,
    vercelLive ? "wss://ws-us3.pusher.com" : null,
  ]
    .filter(Boolean)
    .join(" ")

  const imgSrc = [
    "'self'",
    "data:",
    "blob:",
    "https://*.supabase.co",
    supabaseHostname ? `https://${supabaseHostname}` : null,
    "https://*.mercadopago.com",
    "https://*.mercadopago.com.ar",
    "https://*.basemaps.cartocdn.com",
    "https://basemaps.cartocdn.com",
    "https://a.basemaps.cartocdn.com",
    "https://b.basemaps.cartocdn.com",
    "https://c.basemaps.cartocdn.com",
    "https://d.basemaps.cartocdn.com",
    "https://*.tile.openstreetmap.org",
    "https://tile.openstreetmap.org",
    "https://www.facebook.com",
    "https://*.facebook.com",
    "https://www.google-analytics.com",
    "https://*.google-analytics.com",
    "https://www.googletagmanager.com",
    "https://i.scdn.co",
    "https://*.scdn.co",
    "https://*.spotifycdn.com",
    vercelLive ? "https://vercel.live" : null,
    vercelLive ? "https://vercel.com" : null,
  ]
    .filter(Boolean)
    .join(" ")

  const scriptSrc = [
    "'self'",
    nonceSrc,
    wasmUnsafeEval,
    scriptEval,
    scriptInline,
    "https://sdk.mercadopago.com",
    "https://www.mercadopago.com",
    "https://*.mercadopago.com",
    "https://*.mercadopago.com.ar",
    "https://va.vercel-scripts.com",
    vercelLive ? "https://vercel.live" : null,
    "https://connect.facebook.net",
    "https://analytics.tiktok.com",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://www.google.com/recaptcha/",
    "https://www.gstatic.com/recaptcha/",
    "https://challenges.cloudflare.com",
  ]
    .filter(Boolean)
    .join(" ")

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `manifest-src 'self'${vercelSsoManifestSource}`,
    "form-action 'self' https://*.mercadopago.com https://*.mercadopago.com.ar",
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com${vercelLive ? " https://vercel.live" : ""}`,
    `font-src 'self' data: https://fonts.gstatic.com${vercelLive ? " https://vercel.live https://assets.vercel.com" : ""}`,
    `img-src ${imgSrc}`,
    "media-src 'self' blob: https://p.scdn.co https://*.scdn.co https://*.spotifycdn.com",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    `frame-src 'self' https://open.spotify.com https://embed.spotify.com https://www.mercadopago.com https://*.mercadopago.com https://*.mercadopago.com.ar https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.google.com https://recaptcha.google.com https://challenges.cloudflare.com${vercelLive ? " https://vercel.live" : ""}`,
    `connect-src ${connectSrc}`,
  ]
    .join("; ")
    .replace(/\s+/g, " ")
    .trim()
}
