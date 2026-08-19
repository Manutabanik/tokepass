"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getClientIpBucket } from "@/app/actions/event-staff"
import { assertEventOpsAccess } from "@/lib/event-ops-access"
import type { QrType } from "@/types/database"
import { consumeRateLimit } from "@/lib/rate-limit"
import {
  doorAccessPinExpiresAt,
  doorPinHashEquals,
  generateDoorAccessPin,
  hashDoorPinLookup,
  hashDoorPinSecret,
  normalizeDoorAccessPin,
} from "@/lib/scanner/door-pin"
import {
  clearDoorGuestCookie,
  readValidDoorGuestSession,
  signDoorGuestToken,
  writeDoorGuestCookie,
} from "@/lib/scanner/door-guest-session"
import { createAdminClient } from "@/lib/supabase/admin"

const PIN_ERROR = "El codigo no es valido o ya vencio."

export type DoorAccessPinStatus = {
  eventId: string
  active: boolean
  expiresAt: string | null
  createdAt: string | null
}

export async function getEventDoorAccessPinStatus(
  eventId: string,
): Promise<DoorAccessPinStatus> {
  const empty: DoorAccessPinStatus = {
    eventId,
    active: false,
    expiresAt: null,
    createdAt: null,
  }
  const access = await assertEventOpsAccess(eventId, [])
  if (!access.ok) return empty

  const admin = createAdminClient()
  const { data } = await admin
    .from("event_door_access_pins")
    .select("expires_at, created_at, revoked_at")
    .eq("event_id", eventId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data || new Date(data.expires_at).getTime() <= Date.now()) {
    return empty
  }

  return {
    eventId,
    active: true,
    expiresAt: data.expires_at,
    createdAt: data.created_at,
  }
}

export async function generateEventDoorAccessPin(
  eventId: string,
): Promise<
  | { success: true; pin: string; expiresAt: string }
  | { success: false; error: string }
> {
  try {
    const access = await assertEventOpsAccess(eventId, [])
    if (!access.ok) {
      return {
        success: false,
        error:
          access.reason === "auth_required"
            ? "Iniciá sesión para generar el PIN."
            : "No tenés permiso para generar este PIN.",
      }
    }

    const allowed = await consumeRateLimit({
      bucketKey: `door-pin-gen:${access.userId}:${eventId}`,
      limit: 12,
      windowSeconds: 3600,
      useAdmin: true,
    })
    if (!allowed) {
      return { success: false, error: "Demasiados intentos. Probá más tarde." }
    }

    const admin = createAdminClient()
    const { data: event } = await admin
      .from("events")
      .select("id, organizer_id")
      .eq("id", eventId)
      .maybeSingle()
    if (!event) {
      return { success: false, error: "Evento no encontrado." }
    }

    await admin
      .from("event_door_access_pins")
      .update({ revoked_at: new Date().toISOString() })
      .eq("event_id", eventId)
      .is("revoked_at", null)

    const expiresAt = doorAccessPinExpiresAt()
    let pin = ""
    let inserted = false

    for (let attempt = 0; attempt < 8; attempt += 1) {
      pin = generateDoorAccessPin()
      const pinLookup = hashDoorPinLookup(pin)
      const { data: collision } = await admin
        .from("event_door_access_pins")
        .select("id, expires_at")
        .eq("pin_lookup", pinLookup)
        .is("revoked_at", null)
        .maybeSingle()

      if (collision) {
        if (new Date(collision.expires_at).getTime() > Date.now()) continue
        await admin
          .from("event_door_access_pins")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", collision.id)
      }

      const { error } = await admin.from("event_door_access_pins").insert({
        event_id: eventId,
        pin_hash: hashDoorPinSecret(eventId, pin),
        pin_lookup: pinLookup,
        expires_at: expiresAt.toISOString(),
        created_by: access.userId,
      })
      if (!error) {
        inserted = true
        break
      }
    }

    if (!inserted || !pin) {
      return {
        success: false,
        error: "No se pudo generar un PIN libre. Intentá de nuevo.",
      }
    }

    revalidatePath(`/admin/events/${eventId}`)
    revalidatePath("/admin/team")
    revalidatePath("/admin/settings/users")
    return { success: true, pin, expiresAt: expiresAt.toISOString() }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "No se pudo generar el PIN.",
    }
  }
}

export async function revokeEventDoorAccessPin(
  eventId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const access = await assertEventOpsAccess(eventId, [])
  if (!access.ok) {
    return { success: false, error: "No tenés permiso para revocar este PIN." }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("event_door_access_pins")
    .update({ revoked_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .is("revoked_at", null)

  if (error) return { success: false, error: error.message }

  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath("/admin/team")
  return { success: true }
}

export async function redeemDoorAccessPin(
  rawPin: string,
): Promise<
  { success: true; eventId: string } | { success: false; error: string }
> {
  const pin = normalizeDoorAccessPin(rawPin)
  if (!pin) {
    return { success: false, error: "Ingresá el código de 6 números." }
  }

  const ipBucket = await getClientIpBucket("door-pin-redeem")
  const allowed = await consumeRateLimit({
    bucketKey: ipBucket,
    limit: 8,
    windowSeconds: 15 * 60,
    useAdmin: true,
  })
  if (!allowed) {
    return { success: false, error: "Demasiados intentos. Esperá unos minutos." }
  }

  const lookup = hashDoorPinLookup(pin)
  const lookupAllowed = await consumeRateLimit({
    bucketKey: `door-pin-try:${lookup}`,
    limit: 8,
    windowSeconds: 15 * 60,
    useAdmin: true,
  })
  if (!lookupAllowed) {
    return { success: false, error: PIN_ERROR }
  }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from("event_door_access_pins")
    .select("id, event_id, pin_hash, expires_at, revoked_at")
    .eq("pin_lookup", lookup)
    .is("revoked_at", null)
    .maybeSingle()

  if (
    !row ||
    new Date(row.expires_at).getTime() <= Date.now() ||
    !doorPinHashEquals(row.pin_hash, hashDoorPinSecret(row.event_id, pin))
  ) {
    return { success: false, error: PIN_ERROR }
  }

  const { data: event } = await admin
    .from("events")
    .select("id, organizer_id")
    .eq("id", row.event_id)
    .maybeSingle()
  if (!event) return { success: false, error: PIN_ERROR }

  const expiresAt = new Date(row.expires_at)
  const token = await signDoorGuestToken({
    pinId: row.id,
    eventId: event.id,
    organizerId: event.organizer_id,
    expiresAt,
  })
  await writeDoorGuestCookie({ token, expiresAt })
  await admin
    .from("event_door_access_pins")
    .update({ last_redeemed_at: new Date().toISOString() })
    .eq("id", row.id)

  return { success: true, eventId: event.id }
}

export type DoorGuestScannerEvent = {
  id: string
  title: string
  date: string
  status: string
  qrType: QrType
}

export async function getDoorGuestScannerContext(): Promise<{
  event: DoorGuestScannerEvent
  expiresAt: string
} | null> {
  const session = await readValidDoorGuestSession()
  if (!session) return null
  return {
    expiresAt: session.expiresAt,
    event: {
      id: session.eventId,
      title: session.eventTitle,
      date: session.eventDate,
      status: session.eventStatus,
      qrType: session.qrType,
    },
  }
}

export async function endDoorGuestSession(): Promise<void> {
  await clearDoorGuestCookie()
  redirect("/puerta")
}
