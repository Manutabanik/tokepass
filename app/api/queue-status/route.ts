import { NextResponse, type NextRequest } from "next/server"

import {
  hasUpstashRedis,
  waitingRoomCapacity,
} from "@/lib/waiting-room/config"
import { getWaitingRoomSnapshot } from "@/lib/waiting-room/store"

export const runtime = "edge"

export async function GET(request: NextRequest) {
  const eventKey = request.nextUrl.searchParams.get("event")?.trim()
  if (!eventKey) {
    return NextResponse.json(
      { status: "waiting", error: "missing_event" },
      { status: 400 },
    )
  }

  if (!hasUpstashRedis()) {
    const capacity = waitingRoomCapacity()
    return NextResponse.json(
      {
        status: "waiting",
        active: capacity,
        capacity,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  }

  try {
    const snapshot = await getWaitingRoomSnapshot(eventKey)
    const ready = snapshot.active < snapshot.capacity
    return NextResponse.json(
      {
        status: ready ? "ready" : "waiting",
        active: snapshot.active,
        capacity: snapshot.capacity,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    )
  } catch {
    return NextResponse.json(
      {
        status: "waiting",
        active: waitingRoomCapacity(),
        capacity: waitingRoomCapacity(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    )
  }
}
