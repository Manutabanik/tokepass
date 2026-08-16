export const WAITING_ROOM_COOKIE = "tokepass_vip_pass"
export const WAITING_ROOM_TTL_SECONDS = 15 * 60
export const WAITING_ROOM_POLL_MS = 12_000
export const DEFAULT_WAITING_ROOM_CAPACITY = 2000

export function waitingRoomCapacity(): number {
  const raw = process.env.WAITING_ROOM_MAX_CAPACITY?.trim()
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_WAITING_ROOM_CAPACITY
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_WAITING_ROOM_CAPACITY
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

export function waitingRoomSecret(): Uint8Array {
  const raw =
    process.env.WAITING_ROOM_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "tokepass-waiting-room-dev-secret"
  return new TextEncoder().encode(raw)
}

export function activeSetKey(eventKey: string): string {
  return `waiting-room:active:${eventKey}`
}
