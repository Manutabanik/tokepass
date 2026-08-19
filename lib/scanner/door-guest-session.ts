import "server-only"

import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"

import {
  DOOR_ACCESS_PIN_TTL_MS,
  DOOR_STAFF_GUEST_ROLE,
} from "@/lib/scanner/door-pin"
import { createAdminClient } from "@/lib/supabase/admin"
import type { QrType } from "@/types/database"

export const DOOR_GUEST_COOKIE = "tp_door_guest"
export const DOOR_GUEST_PURPOSE = "door-staff-guest"

export type DoorGuestClaims = {
  pinId: string
  eventId: string
  organizerId: string
  role: typeof DOOR_STAFF_GUEST_ROLE
}

export type DoorGuestSession = DoorGuestClaims & {
  eventTitle: string
  eventDate: string
  eventStatus: string
  qrType: QrType
  expiresAt: string
}

let localDevDoorSecret: Uint8Array | null = null

function doorSessionSecret(): Uint8Array {
  const raw = process.env.GUEST_TICKET_SECRET?.trim() || ""
  if (raw) return new TextEncoder().encode(raw)
  if (process.env.NODE_ENV === "production") {
    throw new Error("GUEST_TICKET_SECRET is required in production")
  }
  if (!localDevDoorSecret) {
    localDevDoorSecret = crypto.getRandomValues(new Uint8Array(32))
  }
  return localDevDoorSecret
}

export function doorGuestCookieAttrs(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(60, Math.min(maxAgeSeconds, DOOR_ACCESS_PIN_TTL_MS / 1000)),
  }
}

export async function signDoorGuestToken(input: {
  pinId: string
  eventId: string
  organizerId: string
  expiresAt: Date
}): Promise<string> {
  return new SignJWT({
    purpose: DOOR_GUEST_PURPOSE,
    role: DOOR_STAFF_GUEST_ROLE,
    pinId: input.pinId,
    organizerId: input.organizerId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.eventId)
    .setIssuedAt()
    .setExpirationTime(input.expiresAt)
    .sign(doorSessionSecret())
}

export async function verifyDoorGuestToken(
  token: string,
): Promise<DoorGuestClaims | null> {
  try {
    const { payload } = await jwtVerify(token, doorSessionSecret(), {
      algorithms: ["HS256"],
    })
    if (payload.purpose !== DOOR_GUEST_PURPOSE) return null
    if (payload.role !== DOOR_STAFF_GUEST_ROLE) return null
    const eventId = typeof payload.sub === "string" ? payload.sub : ""
    const pinId = typeof payload.pinId === "string" ? payload.pinId : ""
    const organizerId =
      typeof payload.organizerId === "string" ? payload.organizerId : ""
    if (!eventId || !pinId || !organizerId) return null
    return {
      pinId,
      eventId,
      organizerId,
      role: DOOR_STAFF_GUEST_ROLE,
    }
  } catch {
    return null
  }
}

export async function readValidDoorGuestSession(): Promise<DoorGuestSession | null> {
  const store = await cookies()
  const token = store.get(DOOR_GUEST_COOKIE)?.value
  if (!token) return null
  const claims = await verifyDoorGuestToken(token)
  if (!claims) return null

  const admin = createAdminClient()
  const [{ data: pin }, { data: event }] = await Promise.all([
    admin
      .from("event_door_access_pins")
      .select("id, event_id, expires_at, revoked_at")
      .eq("id", claims.pinId)
      .maybeSingle(),
    admin
      .from("events")
      .select("id, title, date, status, qr_type, organizer_id")
      .eq("id", claims.eventId)
      .maybeSingle(),
  ])

  if (!pin || pin.revoked_at || pin.event_id !== claims.eventId) return null
  if (new Date(pin.expires_at).getTime() <= Date.now()) return null
  if (!event || event.organizer_id !== claims.organizerId) return null

  return {
    ...claims,
    eventTitle: event.title,
    eventDate: event.date,
    eventStatus: event.status,
    qrType: event.qr_type === "static" ? "static" : "dynamic",
    expiresAt: pin.expires_at,
  }
}

export async function writeDoorGuestCookie(input: {
  token: string
  expiresAt: Date
}): Promise<void> {
  const store = await cookies()
  const maxAge = Math.floor((input.expiresAt.getTime() - Date.now()) / 1000)
  store.set(DOOR_GUEST_COOKIE, input.token, doorGuestCookieAttrs(maxAge))
}

export async function clearDoorGuestCookie(): Promise<void> {
  const store = await cookies()
  store.delete(DOOR_GUEST_COOKIE)
}
