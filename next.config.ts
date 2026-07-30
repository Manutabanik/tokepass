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
]
  .filter(Boolean)
  .join(" ")

/**
 * Production-oriented CSP. `'unsafe-inline'` / `'unsafe-eval'` remain for Next.js
 * runtime/hydration; tighten further with nonces when adopting a CSP nonce pipeline.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://*.mercadopago.com https://*.mercadopago.com.ar",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com https://www.mercadopago.com https://*.mercadopago.com https://*.mercadopago.com.ar https://va.vercel-scripts.com",
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
