import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import type { NextRequest } from "next/server"

import { getEdgeCheckoutIpLimiter } from "@/lib/checkout/memory-rate-limit"
import {
  RATE_LIMITS,
  RATE_LIMIT_BUSY_ERROR,
} from "@/lib/security/rate-limit-policy"
import { hasUpstashRedis } from "@/lib/waiting-room/config"
import {
  isNextServerActionRequest,
  resolveRequestEventKey,
} from "@/lib/waiting-room/paths"

export const EDGE_CHECKOUT_RATE_LIMIT_ERROR = RATE_LIMIT_BUSY_ERROR

export function requestIpFromHeaders(headers: {
  get(name: string): string | null
}): string {
  return (
    headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  )
}

function isRateLimitableIp(ip: string): boolean {
  return Boolean(ip) && ip !== "unknown"
}

/** Holds, lockTickets y pago viajan como Server Actions en la ficha / checkout. */
export function isBotProtectedCheckoutRequest(request: {
  method: string
  headers: { get(name: string): string | null }
  nextUrl: { pathname: string; origin: string }
}): boolean {
  const pathname = request.nextUrl.pathname
  if (pathname === "/api/scanner/scan" && request.method === "POST") {
    return true
  }
  if (!isNextServerActionRequest(request)) return false
  return resolveRequestEventKey(request) != null
}

let edgeRedisLimiter: Ratelimit | null = null

function getEdgeRedisLimiter(): Ratelimit {
  if (edgeRedisLimiter) return edgeRedisLimiter
  const spec = RATE_LIMITS.checkoutEdgeIp
  edgeRedisLimiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(spec.limit, `${spec.windowSeconds} s`),
    prefix: "tokepass:rl:edge-checkout",
    analytics: false,
  })
  return edgeRedisLimiter
}

export async function edgeCheckoutIpBlocked(
  request: NextRequest,
): Promise<boolean> {
  if (!isBotProtectedCheckoutRequest(request)) return false

  const ip = requestIpFromHeaders(request.headers)
  if (!isRateLimitableIp(ip)) return false

  if (hasUpstashRedis()) {
    try {
      const result = await getEdgeRedisLimiter().limit(ip)
      return !result.success
    } catch {
      return false
    }
  }

  return !getEdgeCheckoutIpLimiter().consume(ip)
}
