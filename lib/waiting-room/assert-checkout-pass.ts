import "server-only"

import { cookies } from "next/headers"

import {
  LEGACY_WAITING_ROOM_COOKIE,
  WAITING_ROOM_COOKIE,
  hasUpstashRedis,
  isWaitingRoomEnabled,
} from "@/lib/waiting-room/config"
import { hasWaitingRoomSlot } from "@/lib/waiting-room/store"
import { verifyWaitingRoomPass } from "@/lib/waiting-room/token"

export const WAITING_ROOM_REQUIRED_ERROR =
  "Hay mucha demanda. Entrá de nuevo desde la ficha del evento."

export function waitingRoomEventKeys(
  ...values: Array<string | null | undefined>
): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim() ?? "")
        .filter((value) => value.length > 0),
    ),
  ]
}

export async function assertWaitingRoomCheckoutPass(
  eventKeys: Array<string | null | undefined>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isWaitingRoomEnabled()) return { ok: true }

  if (process.env.NODE_ENV === "production" && !hasUpstashRedis()) {
    return { ok: false, error: WAITING_ROOM_REQUIRED_ERROR }
  }

  const allowed = new Set(waitingRoomEventKeys(...eventKeys))
  if (allowed.size === 0) {
    return { ok: false, error: WAITING_ROOM_REQUIRED_ERROR }
  }

  const store = await cookies()
  const token =
    store.get(WAITING_ROOM_COOKIE)?.value ||
    store.get(LEGACY_WAITING_ROOM_COOKIE)?.value
  const pass = await verifyWaitingRoomPass(token)
  if (!pass || !allowed.has(pass.eventKey)) {
    return { ok: false, error: WAITING_ROOM_REQUIRED_ERROR }
  }

  try {
    if (!(await hasWaitingRoomSlot(pass.eventKey, pass.slotId))) {
      return { ok: false, error: WAITING_ROOM_REQUIRED_ERROR }
    }
  } catch {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, error: WAITING_ROOM_REQUIRED_ERROR }
    }
  }

  return { ok: true }
}
