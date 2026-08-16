import {
  WAITING_ROOM_TTL_SECONDS,
  activeSetKey,
  hasUpstashRedis,
  waitingRoomCapacity,
} from "@/lib/waiting-room/config"

type RoomSnapshot = {
  active: number
  capacity: number
}

const memoryRooms = new Map<string, Map<string, number>>()

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function pruneMemory(eventKey: string): Map<string, number> {
  const room = memoryRooms.get(eventKey) ?? new Map<string, number>()
  const now = nowSeconds()
  for (const [slotId, expiresAt] of room) {
    if (expiresAt <= now) room.delete(slotId)
  }
  memoryRooms.set(eventKey, room)
  return room
}

async function redisCommand<T>(command: Array<string | number>): Promise<T> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "")
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  if (!url || !token) {
    throw new Error("upstash_not_configured")
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`upstash_http_${response.status}`)
  }

  const body = (await response.json()) as { result?: T; error?: string }
  if (body.error) throw new Error(body.error)
  return body.result as T
}

export async function getWaitingRoomSnapshot(
  eventKey: string,
): Promise<RoomSnapshot> {
  const capacity = waitingRoomCapacity()
  const now = nowSeconds()

  if (!hasUpstashRedis()) {
    const room = pruneMemory(eventKey)
    return { active: room.size, capacity }
  }

  const key = activeSetKey(eventKey)
  await redisCommand(["ZREMRANGEBYSCORE", key, "-inf", now])
  const active = Number(await redisCommand<number>(["ZCARD", key]))
  return {
    active: Number.isFinite(active) ? active : 0,
    capacity,
  }
}

export async function hasWaitingRoomSlot(
  eventKey: string,
  slotId: string,
): Promise<boolean> {
  if (!hasUpstashRedis()) {
    const room = pruneMemory(eventKey)
    const expiresAt = room.get(slotId)
    return Boolean(expiresAt && expiresAt > nowSeconds())
  }

  const score = await redisCommand<number | null>([
    "ZSCORE",
    activeSetKey(eventKey),
    slotId,
  ])
  if (score == null) return false
  return Number(score) > nowSeconds()
}

export async function admitWaitingRoomSlot(
  eventKey: string,
  slotId: string,
): Promise<boolean> {
  const capacity = waitingRoomCapacity()
  const expiresAt = nowSeconds() + WAITING_ROOM_TTL_SECONDS

  if (!hasUpstashRedis()) {
    const room = pruneMemory(eventKey)
    if (room.size >= capacity) return false
    room.set(slotId, expiresAt)
    return true
  }

  const key = activeSetKey(eventKey)
  await redisCommand(["ZREMRANGEBYSCORE", key, "-inf", nowSeconds()])
  await redisCommand(["ZADD", key, expiresAt, slotId])
  const active = Number(await redisCommand<number>(["ZCARD", key]))
  if (Number.isFinite(active) && active > capacity) {
    await redisCommand(["ZREM", key, slotId])
    return false
  }
  return true
}

export async function releaseWaitingRoomSlot(
  eventKey: string,
  slotId: string,
): Promise<void> {
  if (!hasUpstashRedis()) {
    pruneMemory(eventKey).delete(slotId)
    return
  }

  await redisCommand(["ZREM", activeSetKey(eventKey), slotId])
}
