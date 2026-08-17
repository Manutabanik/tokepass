import { SignJWT, jwtVerify } from "jose"

import {
  QUEUE_TTL_SECONDS,
  WAITING_ROOM_TTL_SECONDS,
  waitingRoomSecret,
} from "@/lib/waiting-room/config"

export type WaitingRoomPass = {
  eventKey: string
  slotId: string
}

export type QueueTicket = {
  eventKey: string
  queueId: string
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

export async function signQueueTicket(ticket: QueueTicket): Promise<string> {
  return new SignJWT({
    ev: ticket.eventKey,
    qid: ticket.queueId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${QUEUE_TTL_SECONDS}s`)
    .sign(waitingRoomSecret())
}

export async function verifyQueueTicket(
  token: string | undefined | null,
): Promise<QueueTicket | null> {
  if (!token?.trim()) return null
  try {
    const { payload } = await jwtVerify(token, waitingRoomSecret(), {
      algorithms: ["HS256"],
    })
    const eventKey = String(payload.ev ?? "").trim()
    const queueId = String(payload.qid ?? "").trim()
    if (!eventKey || !queueId) return null
    return { eventKey, queueId }
  } catch {
    return null
  }
}

export function newSlotId(): string {
  return crypto.randomUUID()
}
