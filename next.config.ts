import type { NextConfig } from "next"

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
  "https://vitals.vercel-insights.com",
  "https://va.vercel-scripts.com",
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
]
  .filter(Boolean)
  .join(" ")

const unsafeEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
const vercelPreviewManifestSource =
  process.env.VERCEL_ENV === "preview" ? " https://vercel.com" : ""

/**
 * Production-oriented CSP. Inline scripts remain until the app adopts a nonce
 * pipeline; eval is enabled only by the development runtime.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  `manifest-src 'self'${vercelPreviewManifestSource}`,
  "form-action 'self' https://*.mercadopago.com https://*.mercadopago.com.ar",
  `script-src 'self' 'unsafe-inline'${unsafeEval} https://sdk.mercadopago.com https://www.mercadopago.com https://*.mercadopago.com https://*.mercadopago.com.ar https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src ${imgSrc}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-src 'self' https://www.mercadopago.com https://*.mercadopago.com https://*.mercadopago.com.ar https://www.google.com",
  `connect-src ${connectSrc}`,
]
  .join("; ")
  .replace(/\s+/g, " ")
  .trim()

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Event flyers are capped at 5 MB in the action itself. Leave headroom for
    // multipart encoding while still bounding request memory usage.
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  images: {
    remotePatterns: [
      ...(supabaseHostname
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseHostname,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
      {
        protocol: "http",
        hostname: "127.0.0.1",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
