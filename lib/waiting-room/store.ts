import {
  QUEUE_HEARTBEAT_TTL_SECONDS,
  WAITING_ROOM_TTL_SECONDS,
  activeSetKey,
  estimatedWaitSeconds,
  hasUpstashRedis,
  queueHeartbeatKey,
  queueSetKey,
  waitingRoomCapacity,
} from "@/lib/waiting-room/config"

export type RoomSnapshot = {
  active: number
  capacity: number
}

export type QueueAdmitResult = {
  admitted: boolean
  position: number
  etaSeconds: number
  active: number
  capacity: number
  slotId?: string
}

type MemoryQueueEntry = {
  token: string
  enqueuedAt: number
  lastSeen: number
}

const memoryRooms = new Map<string, Map<string, number>>()
const memoryQueues = new Map<string, MemoryQueueEntry[]>()

function queueBackend(): "redis" | "memory" {
  if (hasUpstashRedis()) return "redis"
  if (process.env.NODE_ENV === "production") {
    throw new Error("waiting_room_redis_required")
  }
  return "memory"
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function pruneMemoryRoom(eventKey: string): Map<string, number> {
  const room = memoryRooms.get(eventKey) ?? new Map<string, number>()
  const now = nowSeconds()
  for (const [slotId, expiresAt] of room) {
    if (expiresAt <= now) room.delete(slotId)
  }
  memoryRooms.set(eventKey, room)
  return room
}

function pruneMemoryQueue(eventKey: string): MemoryQueueEntry[] {
  const cutoff = nowSeconds() - QUEUE_HEARTBEAT_TTL_SECONDS
  const next = (memoryQueues.get(eventKey) ?? []).filter(
    (entry) => entry.lastSeen > cutoff,
  )
  memoryQueues.set(eventKey, next)
  return next
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

async function pruneRedisQueue(eventKey: string): Promise<void> {
  const hbKey = queueHeartbeatKey(eventKey)
  const queueKey = queueSetKey(eventKey)
  const cutoff = nowSeconds() - QUEUE_HEARTBEAT_TTL_SECONDS
  const stale = await redisCommand<string[]>([
    "ZRANGEBYSCORE",
    hbKey,
    "-inf",
    cutoff,
  ])
  if (Array.isArray(stale) && stale.length > 0) {
    await redisCommand(["ZREM", queueKey, ...stale])
    await redisCommand(["ZREM", hbKey, ...stale])
  }
}

export async function getWaitingRoomSnapshot(
  eventKey: string,
): Promise<RoomSnapshot> {
  const capacity = waitingRoomCapacity()
  const now = nowSeconds()

  if (queueBackend() === "memory") {
    const room = pruneMemoryRoom(eventKey)
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

export async function waitingRoomQueueLength(eventKey: string): Promise<number> {
  if (queueBackend() === "memory") {
    return pruneMemoryQueue(eventKey).length
  }
  await pruneRedisQueue(eventKey)
  const size = Number(await redisCommand<number>(["ZCARD", queueSetKey(eventKey)]))
  return Number.isFinite(size) ? size : 0
}

export async function hasWaitingRoomSlot(
  eventKey: string,
  slotId: string,
): Promise<boolean> {
  if (queueBackend() === "memory") {
    const room = pruneMemoryRoom(eventKey)
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
  if (capacity <= 0) return false
  const expiresAt = nowSeconds() + WAITING_ROOM_TTL_SECONDS

  if (queueBackend() === "memory") {
    const room = pruneMemoryRoom(eventKey)
    if (room.has(slotId)) {
      room.set(slotId, expiresAt)
      return true
    }
    if (room.size >= capacity) return false
    room.set(slotId, expiresAt)
    return true
  }

  const key = activeSetKey(eventKey)
  await redisCommand(["ZREMRANGEBYSCORE", key, "-inf", nowSeconds()])
  const existing = await redisCommand<number | null>(["ZSCORE", key, slotId])
  if (existing != null && Number(existing) > nowSeconds()) {
    await redisCommand(["ZADD", key, expiresAt, slotId])
    return true
  }
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
  await removeFromQueue(eventKey, slotId)
  if (queueBackend() === "memory") {
    pruneMemoryRoom(eventKey).delete(slotId)
    return
  }

  await redisCommand(["ZREM", activeSetKey(eventKey), slotId])
}

async function removeFromQueue(eventKey: string, queueId: string): Promise<void> {
  if (queueBackend() === "memory") {
    const remaining = pruneMemoryQueue(eventKey).filter(
      (entry) => entry.token !== queueId,
    )
    memoryQueues.set(eventKey, remaining)
    return
  }

  await redisCommand(["ZREM", queueSetKey(eventKey), queueId])
  await redisCommand(["ZREM", queueHeartbeatKey(eventKey), queueId])
}

export async function enqueueWaitingRoom(
  eventKey: string,
  queueId: string,
): Promise<{ position: number }> {
  const now = nowSeconds()

  if (queueBackend() === "memory") {
    const list = pruneMemoryQueue(eventKey)
    const existing = list.find((entry) => entry.token === queueId)
    if (existing) {
      existing.lastSeen = now
      return { position: list.indexOf(existing) + 1 }
    }
    list.push({ token: queueId, enqueuedAt: now, lastSeen: now })
    return { position: list.length }
  }

  await pruneRedisQueue(eventKey)
  const queueKey = queueSetKey(eventKey)
  const hbKey = queueHeartbeatKey(eventKey)
  await redisCommand(["ZADD", queueKey, "NX", now, queueId])
  await redisCommand(["ZADD", hbKey, now, queueId])
  const rank = Number(await redisCommand<number | null>(["ZRANK", queueKey, queueId]))
  return { position: Number.isFinite(rank) ? rank + 1 : 1 }
}

export async function tryAdmitFromQueue(
  eventKey: string,
  queueId: string,
): Promise<QueueAdmitResult> {
  const snapshot = await getWaitingRoomSnapshot(eventKey)
  const capacity = snapshot.capacity

  if (await hasWaitingRoomSlot(eventKey, queueId)) {
    await removeFromQueue(eventKey, queueId)
    const after = await getWaitingRoomSnapshot(eventKey)
    return {
      admitted: true,
      position: 0,
      etaSeconds: 0,
      active: after.active,
      capacity,
      slotId: queueId,
    }
  }

  await enqueueWaitingRoom(eventKey, queueId)

  if (queueBackend() === "memory") {
    const list = pruneMemoryQueue(eventKey)
    const idx = list.findIndex((entry) => entry.token === queueId)
    const position = idx < 0 ? list.length : idx + 1
    if (capacity <= 0 || idx !== 0) {
      return {
        admitted: false,
        position,
        etaSeconds: estimatedWaitSeconds(position),
        active: snapshot.active,
        capacity,
      }
    }
    const admitted = await admitWaitingRoomSlot(eventKey, queueId)
    if (!admitted) {
      return {
        admitted: false,
        position: 1,
        etaSeconds: estimatedWaitSeconds(1),
        active: snapshot.active,
        capacity,
      }
    }
    await removeFromQueue(eventKey, queueId)
    const after = await getWaitingRoomSnapshot(eventKey)
    return {
      admitted: true,
      position: 0,
      etaSeconds: 0,
      active: after.active,
      capacity,
      slotId: queueId,
    }
  }

  const queueKey = queueSetKey(eventKey)
  await pruneRedisQueue(eventKey)
  const rankRaw = await redisCommand<number | null>(["ZRANK", queueKey, queueId])
  const rank = rankRaw == null ? -1 : Number(rankRaw)
  const position = rank < 0 ? 1 : rank + 1

  if (capacity <= 0 || rank !== 0) {
    return {
      admitted: false,
      position,
      etaSeconds: estimatedWaitSeconds(position),
      active: snapshot.active,
      capacity,
    }
  }

  const admitted = await admitWaitingRoomSlot(eventKey, queueId)
  if (!admitted) {
    return {
      admitted: false,
      position: 1,
      etaSeconds: estimatedWaitSeconds(1),
      active: snapshot.active,
      capacity,
    }
  }

  await removeFromQueue(eventKey, queueId)
  const after = await getWaitingRoomSnapshot(eventKey)
  return {
    admitted: true,
    position: 0,
    etaSeconds: 0,
    active: after.active,
    capacity,
    slotId: queueId,
  }
}
