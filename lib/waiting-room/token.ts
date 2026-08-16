import { SignJWT, jwtVerify } from "jose"

import {
  WAITING_ROOM_TTL_SECONDS,
  waitingRoomSecret,
} from "@/lib/waiting-room/config"

export type WaitingRoomPass = {
  eventKey: string
  slotId: string
}

export async function signWaitingRoomPass(
  pass: WaitingRoomPass,
): Promise<string> {
  return new SignJWT({
    ev: pass.eventKey,
    sid: pass.slotId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${WAITING_ROOM_TTL_SECONDS}s`)
    .sign(waitingRoomSecret())
}

export async function verifyWaitingRoomPass(
  token: string | undefined | null,
): Promise<WaitingRoomPass | null> {
  if (!token?.trim()) return null
  try {
    const { payload } = await jwtVerify(token, waitingRoomSecret(), {
      algorithms: ["HS256"],
    })
    const eventKey = String(payload.ev ?? "").trim()
    const slotId = String(payload.sid ?? "").trim()
    if (!eventKey || !slotId) return null
    return { eventKey, slotId }
  } catch {
    return null
  }
}

export function newSlotId(): string {
  return crypto.randomUUID()
}
