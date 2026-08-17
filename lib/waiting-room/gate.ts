import { NextResponse, type NextRequest } from "next/server"

import {
  LEGACY_WAITING_ROOM_COOKIE,
  QUEUE_COOKIE,
  QUEUE_TTL_SECONDS,
  WAITING_ROOM_COOKIE,
  WAITING_ROOM_TTL_SECONDS,
  hasUpstashRedis,
  isWaitingRoomEnabled,
} from "@/lib/waiting-room/config"
import {
  isWaitingRoomBypassPath,
  resolveProtectedEventKey,
  waitingRoomUrl,
} from "@/lib/waiting-room/paths"
import {
  admitWaitingRoomSlot,
  hasWaitingRoomSlot,
  tryAdmitFromQueue,
  waitingRoomQueueLength,
} from "@/lib/waiting-room/store"
import {
  newSlotId,
  signQueueTicket,
  signWaitingRoomPass,
  verifyQueueTicket,
  verifyWaitingRoomPass,
} from "@/lib/waiting-room/token"

export type WaitingRoomGate =
  | { kind: "bypass" }
  | { kind: "block"; response: NextResponse }
  | { kind: "admit"; cookie: string }

function passCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WAITING_ROOM_TTL_SECONDS,
  }
}

function queueCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: QUEUE_TTL_SECONDS,
  }
}

export function applyVipCookie(response: NextResponse, token: string) {
  response.cookies.set(WAITING_ROOM_COOKIE, token, passCookieOptions())
  response.cookies.delete(LEGACY_WAITING_ROOM_COOKIE)
  response.cookies.delete(QUEUE_COOKIE)
  return response
}

export function applyQueueCookie(response: NextResponse, token: string) {
  response.cookies.set(QUEUE_COOKIE, token, queueCookieOptions())
  return response
}

export function checkoutPassCookieValue(
  request: NextRequest,
): string | undefined {
  return (
    request.cookies.get(WAITING_ROOM_COOKIE)?.value ||
    request.cookies.get(LEGACY_WAITING_ROOM_COOKIE)?.value
  )
}

export async function evaluateWaitingRoomGate(
  request: NextRequest,
): Promise<WaitingRoomGate> {
  if (!isWaitingRoomEnabled()) return { kind: "bypass" }

  if (process.env.NODE_ENV === "production" && !hasUpstashRedis()) {
    return {
      kind: "block",
      response: NextResponse.json(
        { error: "Sala de espera no disponible." },
        { status: 503 },
      ),
    }
  }

  const { pathname } = request.nextUrl
  if (isWaitingRoomBypassPath(pathname)) return { kind: "bypass" }

  const pathKey = resolveProtectedEventKey(pathname)
  if (!pathKey) return { kind: "bypass" }

  const eventKey =
    pathKey === "__checkout__"
      ? request.nextUrl.searchParams.get("event")?.trim() ||
        (await verifyWaitingRoomPass(checkoutPassCookieValue(request)))
          ?.eventKey ||
        null
      : pathKey

  if (!eventKey) return { kind: "bypass" }

  const existing = await verifyWaitingRoomPass(checkoutPassCookieValue(request))
  if (
    existing &&
    existing.eventKey === eventKey &&
    (await hasWaitingRoomSlot(eventKey, existing.slotId))
  ) {
    return { kind: "bypass" }
  }

  try {
    const queued = await verifyQueueTicket(
      request.cookies.get(QUEUE_COOKIE)?.value,
    )
    const knownQueueId =
      queued && queued.eventKey === eventKey ? queued.queueId : null

    if (!knownQueueId) {
      const waiting = await waitingRoomQueueLength(eventKey)
      if (waiting === 0) {
        const slotId = newSlotId()
        const admitted = await admitWaitingRoomSlot(eventKey, slotId)
        if (admitted) {
          const cookie = await signWaitingRoomPass({ eventKey, slotId })
          return { kind: "admit", cookie }
        }
      }
    }

    const queueId = knownQueueId ?? newSlotId()
    const result = await tryAdmitFromQueue(eventKey, queueId)
    if (result.admitted && result.slotId) {
      const cookie = await signWaitingRoomPass({
        eventKey,
        slotId: result.slotId,
      })
      return { kind: "admit", cookie }
    }

    return {
      kind: "block",
      response: await redirectToQueue(request, eventKey, queueId),
    }
  } catch {
    if (process.env.NODE_ENV === "production") {
      return {
        kind: "block",
        response: NextResponse.json(
          { error: "Sala de espera no disponible." },
          { status: 503 },
        ),
      }
    }
    return { kind: "bypass" }
  }
}

async function redirectToQueue(
  request: NextRequest,
  eventKey: string,
  queueId: string,
): Promise<NextResponse> {
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`
  const response = NextResponse.redirect(
    waitingRoomUrl(request.nextUrl, eventKey, nextPath),
  )
  const ticket = await signQueueTicket({ eventKey, queueId })
  response.cookies.set(QUEUE_COOKIE, ticket, queueCookieOptions())
  response.cookies.delete(WAITING_ROOM_COOKIE)
  response.cookies.delete(LEGACY_WAITING_ROOM_COOKIE)
  return response
}
