import { NextResponse, type NextRequest } from "next/server"

import {
  QUEUE_COOKIE,
  WAITING_ROOM_POLL_MS,
} from "@/lib/waiting-room/config"
import {
  applyQueueCookie,
  applyVipCookie,
  checkoutPassCookieValue,
} from "@/lib/waiting-room/gate"
import { tryAdmitFromQueue } from "@/lib/waiting-room/store"
import {
  newSlotId,
  signQueueTicket,
  signWaitingRoomPass,
  verifyQueueTicket,
  verifyWaitingRoomPass,
} from "@/lib/waiting-room/token"

export const runtime = "edge"

function eventKeyFromRequest(request: NextRequest): string {
  return request.nextUrl.searchParams.get("event")?.trim() || ""
}

export async function GET(request: NextRequest) {
  const eventKey = eventKeyFromRequest(request)
  if (!eventKey) {
    return NextResponse.json(
      { status: "waiting", error: "missing_event", position: -1 },
      { status: 400 },
    )
  }

  const existingPass = await verifyWaitingRoomPass(
    checkoutPassCookieValue(request),
  )
  if (existingPass && existingPass.eventKey === eventKey) {
    return NextResponse.json(
      {
        status: "ready",
        position: 0,
        etaSeconds: 0,
        pollMs: WAITING_ROOM_POLL_MS,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  }

  const queued = await verifyQueueTicket(
    request.cookies.get(QUEUE_COOKIE)?.value,
  )
  const queueId =
    queued && queued.eventKey === eventKey ? queued.queueId : newSlotId()

  try {
    const result = await tryAdmitFromQueue(eventKey, queueId)
    const payload = {
      status: result.admitted ? ("ready" as const) : ("waiting" as const),
      position: result.position,
      etaSeconds: result.etaSeconds,
      active: result.active,
      capacity: result.capacity,
      pollMs: WAITING_ROOM_POLL_MS,
    }

    const response = NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    })

    if (result.admitted && result.slotId) {
      const pass = await signWaitingRoomPass({
        eventKey,
        slotId: result.slotId,
      })
      applyVipCookie(response, pass)
      return response
    }

    if (!queued || queued.eventKey !== eventKey) {
      const ticket = await signQueueTicket({ eventKey, queueId })
      applyQueueCookie(response, ticket)
    }

    return response
  } catch {
    return NextResponse.json(
      {
        status: "waiting",
        position: 1,
        etaSeconds: WAITING_ROOM_POLL_MS / 1000,
        pollMs: WAITING_ROOM_POLL_MS,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  }
}
