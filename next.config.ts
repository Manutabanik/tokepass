import { withSentryConfig } from "@sentry/nextjs"
import type { NextConfig } from "next"

const supabaseHostname = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    return url ? new URL(url).hostname : null
  } catch {
    return null
  }
})()

/**
 * CSP is issued per-request from proxy/middleware with a cryptographic nonce
 * (see lib/security/csp.ts). Keep the remaining browser isolation headers here.
 */
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
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@react-pdf/renderer", "qrcode"],
  experimental: {
    // Event flyers are capped at 5 MB in the action itself. Leave headroom for
    // multipart encoding while still bounding request memory usage.
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  images: {
    // Hosts outside this list render via native <img> in EventFlyer.
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
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        pathname: "/vi/**",
      },
      {
        protocol: "https",
        hostname: "i.scdn.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "p.scdn.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "open.spotify.com",
        pathname: "/**",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/admin/canvas-comercial",
        destination: "/organizar-eventos#comparativa",
        permanent: true,
      },
      {
        source: "/admin/support-faqs",
        destination: "/admin",
        permanent: true,
      },
      {
        source: "/my-tickets",
        destination: "/cuenta/entradas",
        permanent: true,
      },
      {
        source: "/my-tickets/:path*",
        destination: "/cuenta/entradas",
        permanent: true,
      },
      {
        source: "/mis-tickets",
        destination: "/cuenta/entradas",
        permanent: true,
      },
      {
        source: "/mis-tickets/:path*",
        destination: "/cuenta/entradas",
        permanent: true,
      },
      {
        source: "/my-orders",
        destination: "/cuenta/compras",
        permanent: true,
      },
      {
        source: "/my-orders/:path*",
        destination: "/cuenta/compras",
        permanent: true,
      },
      {
        source: "/profile",
        destination: "/cuenta/perfil",
        permanent: true,
      },
      {
        source: "/perfil",
        destination: "/cuenta/perfil",
        permanent: true,
      },
      {
        source: "/mis-entradas",
        destination: "/cuenta/entradas",
        permanent: true,
      },
      {
        source: "/mis-entradas/:path*",
        destination: "/cuenta/entradas",
        permanent: true,
      },
      {
        source: "/beneficios",
        destination: "/",
        permanent: true,
      },
      {
        source: "/buscar",
        destination: "/",
        permanent: true,
      },
      {
        source: "/legal/turnstile-privacy",
        destination:
          "https://www.cloudflare.com/en-gb/turnstile-privacy-policy/",
        permanent: true,
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: "/events/:id/queue",
        destination: "/event/:id/queue",
      },
      {
        source: "/eventos/:id/queue",
        destination: "/event/:id/queue",
      },
      {
        source: "/events/:id/checkout",
        destination: "/event/:id/checkout",
      },
      {
        source: "/eventos/:id/checkout",
        destination: "/event/:id/checkout",
      },
    ]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  telemetry: false,
  tunnelRoute: "/monitoring",
  widenClientFileUpload: Boolean(process.env.SENTRY_AUTH_TOKEN),
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeTracing: false,
    excludeReplayShadowDom: true,
    excludeReplayIframe: true,
    excludeReplayWorker: true,
  },
})
