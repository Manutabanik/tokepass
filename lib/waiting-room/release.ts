import { cookies } from "next/headers"

import {
  LEGACY_WAITING_ROOM_COOKIE,
  QUEUE_COOKIE,
  WAITING_ROOM_COOKIE,
} from "@/lib/waiting-room/config"
import { releaseWaitingRoomSlot } from "@/lib/waiting-room/store"
import { verifyWaitingRoomPass } from "@/lib/waiting-room/token"

export async function releaseWaitingRoomPassFromCookies(): Promise<void> {
  const store = await cookies()
  const token =
    store.get(WAITING_ROOM_COOKIE)?.value ||
    store.get(LEGACY_WAITING_ROOM_COOKIE)?.value
  const pass = await verifyWaitingRoomPass(token)
  if (pass) {
    await releaseWaitingRoomSlot(pass.eventKey, pass.slotId)
  }
  store.delete(WAITING_ROOM_COOKIE)
  store.delete(LEGACY_WAITING_ROOM_COOKIE)
  store.delete(QUEUE_COOKIE)
}
