export const WAITING_ROOM_COOKIE = "checkout_access_token"
export const LEGACY_WAITING_ROOM_COOKIE = "tokepass_vip_pass"
export const QUEUE_COOKIE = "tokepass_queue_ticket"

/** Checkout tunnel pass (signed). */
export const WAITING_ROOM_TTL_SECONDS = 15 * 60

/** Queue ticket lifetime — longer than a typical wait. */
export const QUEUE_TTL_SECONDS = 30 * 60

/** Drop idle waiters so a closed tab cannot block FIFO forever. */
export const QUEUE_HEARTBEAT_TTL_SECONDS = 90

/** Conservative poll so the status endpoint cannot DDoS Redis. */
export const WAITING_ROOM_POLL_MS = 15_000

export const DEFAULT_WAITING_ROOM_CAPACITY = 2000

export function waitingRoomCapacity(): number {
  const raw =
    process.env.MAX_CONCURRENT_USERS?.trim() ||
    process.env.WAITING_ROOM_MAX_CAPACITY?.trim()
  if (!raw) return DEFAULT_WAITING_ROOM_CAPACITY
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_WAITING_ROOM_CAPACITY
  }
  return Math.min(parsed, 100_000)
}

export function isWaitingRoomEnabled(): boolean {
  const flag = process.env.WAITING_ROOM_ENABLED?.trim().toLowerCase()
  if (flag === "0" || flag === "false" || flag === "off") return false
  if (flag === "1" || flag === "true" || flag === "on") return true
  if (hasUpstashRedis()) return true
  return process.env.NODE_ENV !== "production"
}

export function hasUpstashRedis(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  )
}

export function waitingRoomRequiresRedis(): boolean {
  return process.env.NODE_ENV === "production" && isWaitingRoomEnabled()
}

let localDevWaitingRoomSecret: Uint8Array | null = null

export function waitingRoomSecret(): Uint8Array {
  const raw = process.env.WAITING_ROOM_SECRET?.trim() || ""
  if (raw) return new TextEncoder().encode(raw)
  if (process.env.NODE_ENV === "production") {
    throw new Error("WAITING_ROOM_SECRET is required in production")
  }
  if (!localDevWaitingRoomSecret) {
    localDevWaitingRoomSecret = crypto.getRandomValues(new Uint8Array(32))
  }
  return localDevWaitingRoomSecret
}

export function activeSetKey(eventKey: string): string {
  return `waiting-room:active:${eventKey}`
}

export function queueSetKey(eventKey: string): string {
  return `waiting-room:queue:${eventKey}`
}

export function queueHeartbeatKey(eventKey: string): string {
  return `waiting-room:queue-hb:${eventKey}`
}

export function estimatedWaitSeconds(position: number): number {
  if (position <= 0) return 0
  return position * Math.ceil(WAITING_ROOM_POLL_MS / 1000)
}
