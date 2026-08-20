import "server-only"

import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

import { MemoryRateLimiter } from "@/lib/checkout/memory-rate-limit"
import { logger } from "@/lib/logger"
import { hasUpstashRedis } from "@/lib/waiting-room/config"

export const RATE_LIMITS = {
  checkoutIp: { limit: 8, windowSeconds: 60 },
  checkoutUser: { limit: 8, windowSeconds: 10 * 60 },
  cartHoldUser: { limit: 20, windowSeconds: 60 },
  paymentPreferenceUser: { limit: 5, windowSeconds: 60 },
  authIp: { limit: 3, windowSeconds: 60 },
  publicStockIp: { limit: 30, windowSeconds: 60 },
} as const

export const RATE_LIMIT_BUSY_ERROR =
  "Estamos procesando muchas solicitudes. Esperá un minuto e intentá de nuevo."

export const AUTH_RATE_LIMIT_ERROR =
  "Demasiados intentos. Esperá un minuto e intentá de nuevo."

const ephemeralCache = new Map()
const redisLimiters = new Map<string, Ratelimit>()
const memoryLimiters = new Map<string, MemoryRateLimiter>()

function limiterSpec(limit: number, windowSeconds: number): string {
  return `${limit}:${windowSeconds}`
}

function getRedisLimiter(limit: number, windowSeconds: number): Ratelimit {
  const spec = limiterSpec(limit, windowSeconds)
  const existing = redisLimiters.get(spec)
  if (existing) return existing

  const redis = Redis.fromEnv()
  const created = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix: "tokepass:rl",
    ephemeralCache,
    analytics: false,
  })
  redisLimiters.set(spec, created)
  return created
}

function consumeMemoryLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): boolean {
  const spec = limiterSpec(limit, windowSeconds)
  const existing = memoryLimiters.get(spec)
  const limiter =
    existing ?? new MemoryRateLimiter(limit, windowSeconds * 1000)
  if (!existing) memoryLimiters.set(spec, limiter)
  return limiter.consume(key)
}

export function redisRateLimitFallback(): "deny" | "memory" {
  if (process.env.NODE_ENV === "production") return "deny"
  return "memory"
}

/**
 * Contador distribuido (Upstash). En produccion sin Redis: fail-closed.
 * En local/test: memoria por isolate.
 */
export async function consumeDistributedRateLimit(input: {
  key: string
  limit: number
  windowSeconds: number
}): Promise<boolean> {
  const key = input.key.trim()
  if (!key) return false

  if (hasUpstashRedis()) {
    try {
      const result = await getRedisLimiter(
        input.limit,
        input.windowSeconds,
      ).limit(key)
      return result.success
    } catch (error) {
      logger.error({
        context: "lib/distributed-rate-limit",
        message: "redis_limit_failed",
        error,
        key,
      })
      return redisRateLimitFallback() === "memory"
        ? consumeMemoryLimit(key, input.limit, input.windowSeconds)
        : false
    }
  }

  if (redisRateLimitFallback() === "deny") {
    logger.error({
      context: "lib/distributed-rate-limit",
      message: "redis_required",
      key,
    })
    return false
  }

  return consumeMemoryLimit(key, input.limit, input.windowSeconds)
}

export async function consumeNamedRateLimit(
  name: keyof typeof RATE_LIMITS,
  key: string,
): Promise<boolean> {
  const spec = RATE_LIMITS[name]
  return consumeDistributedRateLimit({
    key: `${name}:${key}`,
    limit: spec.limit,
    windowSeconds: spec.windowSeconds,
  })
}

export function resetDistributedRateLimitForTests(): void {
  memoryLimiters.clear()
  ephemeralCache.clear()
}
