import "server-only"

import { cookies, headers } from "next/headers"

import {
  LEGACY_WAITING_ROOM_COOKIE,
  WAITING_ROOM_COOKIE,
  hasUpstashRedis,
  isWaitingRoomEnabled,
  isWaitingRoomStrictRuntime,
  waitingRoomPassCookieOptions,
} from "@/lib/waiting-room/config"
import { isOrganizerEventPreviewPath } from "@/lib/waiting-room/paths"
import {
  admitWaitingRoomSlot,
  hasWaitingRoomSlot,
  waitingRoomQueueLength,
} from "@/lib/waiting-room/store"
import {
  newSlotId,
  signWaitingRoomPass,
  verifyWaitingRoomPass,
} from "@/lib/waiting-room/token"

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

function preferredEventKey(allowed: Set<string>): string | null {
  return [...allowed][0] ?? null
}

async function isOrganizerPreviewReferer(): Promise<boolean> {
  const referer = (await headers()).get("referer")
  if (!referer?.trim()) return false
  try {
    return isOrganizerEventPreviewPath(new URL(referer).pathname)
  } catch {
    return false
  }
}

async function persistCheckoutPass(
  eventKey: string,
  slotId: string,
): Promise<void> {
  const store = await cookies()
  const token = await signWaitingRoomPass({ eventKey, slotId })
  store.set(WAITING_ROOM_COOKIE, token, waitingRoomPassCookieOptions())
  store.delete(LEGACY_WAITING_ROOM_COOKIE)
}

export async function assertWaitingRoomCheckoutPass(
  eventKeys: Array<string | null | undefined>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isWaitingRoomEnabled()) return { ok: true }
  if (await isOrganizerPreviewReferer()) return { ok: true }

  if (isWaitingRoomStrictRuntime() && !hasUpstashRedis()) {
    return { ok: false, error: WAITING_ROOM_REQUIRED_ERROR }
  }

  if (!hasUpstashRedis() && !isWaitingRoomStrictRuntime()) {
    return { ok: true }
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
  if (pass && allowed.has(pass.eventKey)) {
    try {
      if (await hasWaitingRoomSlot(pass.eventKey, pass.slotId)) {
        return { ok: true }
      }
      if (await admitWaitingRoomSlot(pass.eventKey, pass.slotId)) {
        return { ok: true }
      }
    } catch {
      if (isWaitingRoomStrictRuntime()) {
        return { ok: false, error: WAITING_ROOM_REQUIRED_ERROR }
      }
      return { ok: true }
    }
  }

  const eventKey = preferredEventKey(allowed)
  if (!eventKey) {
    return { ok: false, error: WAITING_ROOM_REQUIRED_ERROR }
  }

  try {
    if ((await waitingRoomQueueLength(eventKey)) > 0) {
      return { ok: false, error: WAITING_ROOM_REQUIRED_ERROR }
    }
    const slotId = newSlotId()
    if (!(await admitWaitingRoomSlot(eventKey, slotId))) {
      return { ok: false, error: WAITING_ROOM_REQUIRED_ERROR }
    }
    await persistCheckoutPass(eventKey, slotId)
    return { ok: true }
  } catch {
    if (isWaitingRoomStrictRuntime()) {
      return { ok: false, error: WAITING_ROOM_REQUIRED_ERROR }
    }
    return { ok: true }
  }
}
