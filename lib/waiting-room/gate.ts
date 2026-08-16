import { NextResponse, type NextRequest } from "next/server"

import {
  WAITING_ROOM_COOKIE,
  WAITING_ROOM_TTL_SECONDS,
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
} from "@/lib/waiting-room/store"
import {
  newSlotId,
  signWaitingRoomPass,
  verifyWaitingRoomPass,
} from "@/lib/waiting-room/token"

export type WaitingRoomGate =
  | { kind: "bypass" }
  | { kind: "block"; response: NextResponse }
  | { kind: "admit"; cookie: string }

function vipCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WAITING_ROOM_TTL_SECONDS,
  }
}

export function applyVipCookie(response: NextResponse, token: string) {
  response.cookies.set(WAITING_ROOM_COOKIE, token, vipCookieOptions())
  return response
}

export async function evaluateWaitingRoomGate(
  request: NextRequest,
): Promise<WaitingRoomGate> {
  if (!isWaitingRoomEnabled()) return { kind: "bypass" }

  const { pathname } = request.nextUrl
  if (isWaitingRoomBypassPath(pathname)) return { kind: "bypass" }

  const pathKey = resolveProtectedEventKey(pathname)
  if (!pathKey) return { kind: "bypass" }

  const eventKey =
    pathKey === "__checkout__"
      ? request.nextUrl.searchParams.get("event")?.trim() ||
        (await verifyWaitingRoomPass(
          request.cookies.get(WAITING_ROOM_COOKIE)?.value,
        ))?.eventKey ||
        null
      : pathKey

  if (!eventKey) return { kind: "bypass" }

  const existing = await verifyWaitingRoomPass(
    request.cookies.get(WAITING_ROOM_COOKIE)?.value,
  )
  if (
    existing &&
    existing.eventKey === eventKey &&
    (await hasWaitingRoomSlot(eventKey, existing.slotId))
  ) {
    return { kind: "bypass" }
  }

  try {
    const slotId = newSlotId()
    const admitted = await admitWaitingRoomSlot(eventKey, slotId)
    if (admitted) {
      const cookie = await signWaitingRoomPass({ eventKey, slotId })
      return { kind: "admit", cookie }
    }
  } catch {
    return { kind: "bypass" }
  }

  const nextPath = `${pathname}${request.nextUrl.search}`
  const response = NextResponse.redirect(
    waitingRoomUrl(request.nextUrl, eventKey, nextPath),
  )
  response.cookies.delete(WAITING_ROOM_COOKIE)
  return { kind: "block", response }
}
