"use server"

import { revalidatePath } from "next/cache"

import {
  assertLivingMac,
  resolveScanSecret,
} from "@/lib/scan-payload"
import { createClient } from "@/lib/supabase/server"
import type { QrType, TicketStatus } from "@/types/database"

const TICKET_SCAN_SELECT =
  "id, status, event_id, totp_secret, scanned_at, ticket_tiers(name, time_limit, bonus_reward), events(id, title, organizer_id, qr_type)"

export type ScannerEventOption = {
  id: string
  title: string
  date: string
  status: string
  qrType: QrType
}

export type ScanTicketResult =
  | {
      success: true
      status: "granted"
      message: string
      ticket: {
        id: string
        tierName: string
        ownerLabel: string | null
        eventTitle: string
        isFreePass: boolean
      }
      bonus: string | null
    }
  | {
      success: false
      status:
        | "expired_qr"
        | "already_used"
        | "revoked"
        | "transferred"
        | "cancelled"
        | "wrong_event"
        | "not_found"
        | "invalid_payload"
        | "forbidden"
        | "auth_required"
        | "update_failed"
      message: string
      scannedAt?: string | null
    }

type TicketScanRow = {
  id: string
  status: TicketStatus
  event_id: string
  totp_secret?: string
  scanned_at: string | null
  ticket_tiers: {
    name: string
    time_limit: string | null
    bonus_reward: string | null
  } | null
  events: {
    id: string
    title: string
    organizer_id: string
    qr_type: QrType | null
  } | null
}

function isFreePassTier(tierName: string | null | undefined): boolean {
  if (!tierName) return false
  const normalized = tierName.toLowerCase()
  return (
    normalized.includes("freepass") ||
    normalized.includes("cortesía") ||
    normalized.includes("cortesia")
  )
}

function isWithinTimeLimit(timeLimit: string | null): boolean {
  if (!timeLimit) return false

  const [hoursRaw, minutesRaw] = timeLimit.split(":")
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw ?? 0)

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return false
  }

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const limitMinutes = hours * 60 + minutes

  return currentMinutes <= limitMinutes
}

export async function getScannerEvents(): Promise<ScannerEventOption[]> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error("auth_required")
  }

  const { data, error: queryError } = await supabase
    .from("events")
    .select("id, title, date, status, qr_type")
    .eq("organizer_id", user.id)
    .in("status", ["published", "draft"])
    .order("date", { ascending: true })

  if (queryError) {
    throw new Error(queryError.message)
  }

  return (data ?? []).map((event) => ({
    id: event.id,
    title: event.title,
    date: event.date,
    status: event.status,
    qrType: event.qr_type === "static" ? "static" : "dynamic",
  }))
}

export async function scanAndValidateTicket(
  base64Payload: string,
  eventId: string,
): Promise<ScanTicketResult> {
  if (!base64Payload?.trim() || !eventId) {
    return {
      success: false,
      status: "invalid_payload",
      message: "Payload de escaneo inválido",
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      success: false,
      status: "auth_required",
      message: "Sesión requerida",
    }
  }

  const { data: eventMeta } = await supabase
    .from("events")
    .select("id, qr_type, organizer_id")
    .eq("id", eventId)
    .maybeSingle()

  if (!eventMeta) {
    return {
      success: false,
      status: "not_found",
      message: "Evento no encontrado",
    }
  }

  const qrType: QrType =
    eventMeta.qr_type === "static" ? "static" : "dynamic"

  const resolved = resolveScanSecret(base64Payload, qrType)
  if (!resolved) {
    return {
      success: false,
      status: "invalid_payload",
      message:
        qrType === "static"
          ? "QR estático inválido"
          : "QR inválido o corrupto",
    }
  }

  if (resolved.enforceFreshness && resolved.expired) {
    return {
      success: false,
      status: "expired_qr",
      message: "QR Expirado (Captura de pantalla)",
    }
  }

  let ticket: unknown = null

  if (resolved.mode === "v2") {
    const { data } = await supabase
      .from("tickets")
      .select(TICKET_SCAN_SELECT)
      .eq("id", resolved.ticketId)
      .maybeSingle()
    ticket = data

    if (ticket) {
      const preview = ticket as TicketScanRow
      const secret = preview.totp_secret || preview.id
      const ok = await assertLivingMac(secret, resolved)
      if (!ok) {
        return {
          success: false,
          status: "invalid_payload",
          message: "QR inválido o manipulado",
        }
      }
    }
  } else {
    const { data: ticketBySecret } = await supabase
      .from("tickets")
      .select(TICKET_SCAN_SELECT)
      .eq("totp_secret", resolved.totpSecret)
      .maybeSingle()

    ticket = ticketBySecret

    if (!ticket) {
      const { data: ticketById } = await supabase
        .from("tickets")
        .select(TICKET_SCAN_SELECT)
        .eq("id", resolved.totpSecret)
        .maybeSingle()
      ticket = ticketById
    }
  }

  if (!ticket) {
    return {
      success: false,
      status: "not_found",
      message: "Ticket no encontrado",
    }
  }

  const row = ticket as TicketScanRow

  if (!row.events || row.events.organizer_id !== user.id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profile?.role !== "super_admin") {
      return {
        success: false,
        status: "forbidden",
        message: "No tenés permiso para validar este ticket",
      }
    }
  }

  if (row.event_id !== eventId) {
    return {
      success: false,
      status: "wrong_event",
      message: "Ticket de otro evento",
    }
  }

  const { data: guestEntryRow } = await supabase
    .from("guest_list_entries")
    .select("id, status, guest_lists(valid_until, name)")
    .eq("ticket_id", row.id)
    .maybeSingle()

  const guestEntry = guestEntryRow as {
    id: string
    status: string
    guest_lists: { valid_until: string; name: string } | null
  } | null

  const listValidUntil = guestEntry?.guest_lists?.valid_until
  if (listValidUntil && new Date(listValidUntil).getTime() < Date.now()) {
    return {
      success: false,
      status: "expired_qr",
      message: "Horario de lista vencido",
    }
  }

  if (row.status === "transferred") {
    return {
      success: false,
      status: "transferred",
      message: "ENTRADA INVÁLIDA: Este ticket fue transferido a otro usuario",
    }
  }

  if (row.status === "used" || row.status === "scanned") {
    return {
      success: false,
      status: "already_used",
      message: "Ticket ya escaneado",
      scannedAt: row.scanned_at,
    }
  }

  if (row.status === "cancelled" || row.status === "revoked") {
    return {
      success: false,
      status: "cancelled",
      message: "Ticket cancelado / revocado",
    }
  }

  if (row.status !== "valid") {
    return {
      success: false,
      status: "already_used",
      message: "Ticket no válido para ingreso",
      scannedAt: row.scanned_at,
    }
  }

  const scannedAt = new Date().toISOString()
  const { data: updated, error: updateError } = await supabase
    .from("tickets")
    .update({ status: "used", scanned_at: scannedAt })
    .eq("id", row.id)
    .eq("status", "valid")
    .select("id, scanned_at")
    .maybeSingle()

  if (updateError || !updated) {
    const { data: again } = await supabase
      .from("tickets")
      .select("scanned_at")
      .eq("id", row.id)
      .maybeSingle()

    return {
      success: false,
      status: "already_used",
      message: "Ticket ya escaneado",
      scannedAt: again?.scanned_at ?? null,
    }
  }

  await supabase.rpc("mark_guest_entry_checked_in", {
    p_ticket_id: row.id,
  })

  const tier = row.ticket_tiers
  const isFreePass = isFreePassTier(tier?.name)
  const bonus =
    isFreePass
      ? "CORTESÍA / FREEPASS"
      : tier?.bonus_reward && isWithinTimeLimit(tier.time_limit)
        ? tier.bonus_reward
        : null

  revalidatePath("/admin/scanner")
  revalidatePath("/my-tickets")
  if (guestEntry) {
    revalidatePath("/admin/lists")
  }

  return {
    success: true,
    status: "granted",
    message: "ACCESO PERMITIDO",
    ticket: {
      id: row.id,
      tierName: isFreePass
        ? "Cortesía / FreePass"
        : (tier?.name ?? "Entrada"),
      ownerLabel: null,
      eventTitle: row.events?.title ?? "Evento",
      isFreePass,
    },
    bonus,
  }
}

export type EventTicketManifestPayload = {
  eventId: string
  eventTitle: string
  qrType: QrType
  hash: string
  tickets: Array<{
    id: string
    event_id: string
    totp_secret: string
    status: "valid" | "used" | "transferred" | "cancelled" | "scanned" | "revoked"
    owner_name: string
    dni: string | null
    ticket_tier: string
    scanned_at: string | null
    scanned_at_local: number | null
  }>
}

/** Manifiesto completo de tickets válidos/usados para IndexedDB del escáner. */
export async function fetchEventTicketManifest(
  eventId: string,
): Promise<EventTicketManifestPayload> {
  if (!eventId) {
    throw new Error("eventId requerido")
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("auth_required")
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, title, qr_type, organizer_id")
    .eq("id", eventId)
    .maybeSingle()

  if (eventError || !event) {
    throw new Error("Evento no encontrado")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (
    event.organizer_id !== user.id &&
    profile?.role !== "super_admin"
  ) {
    throw new Error("Sin permiso para descargar este manifiesto")
  }

  const { data, error } = await supabase
    .from("tickets")
    .select(
      "id, event_id, totp_secret, status, scanned_at, owner_id, ticket_tiers(name)",
    )
    .eq("event_id", eventId)
    .in("status", ["valid", "used", "scanned"])

  if (error) {
    throw new Error(error.message)
  }

  type Row = {
    id: string
    event_id: string
    totp_secret: string
    status: EventTicketManifestPayload["tickets"][number]["status"]
    scanned_at: string | null
    owner_id: string | null
    ticket_tiers: { name: string } | null
  }

  const rows = (data ?? []) as unknown as Row[]
  const ownerIds = [
    ...new Set(rows.map((row) => row.owner_id).filter(Boolean)),
  ] as string[]

  const ownerMap = new Map<
    string,
    { full_name: string | null; email: string; dni: string | null }
  >()

  if (ownerIds.length > 0) {
    let owners:
      | Array<{
          id: string
          full_name: string | null
          email: string
          dni?: string | null
        }>
      | null = null

    const withDni = await supabase
      .from("profiles")
      .select("id, full_name, email, dni")
      .in("id", ownerIds)

    if (withDni.error) {
      const fallback = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ownerIds)
      owners = fallback.data
    } else {
      owners = withDni.data
    }

    for (const owner of owners ?? []) {
      ownerMap.set(owner.id, {
        full_name: owner.full_name,
        email: owner.email,
        dni: owner.dni ?? null,
      })
    }
  }

  const tickets = rows.map((row) => {
    const owner = row.owner_id ? ownerMap.get(row.owner_id) : null
    return {
      id: row.id,
      event_id: row.event_id,
      totp_secret: row.totp_secret,
      status: row.status,
      owner_name: owner?.full_name?.trim() || owner?.email || "Sin nombre",
      dni: owner?.dni ?? null,
      ticket_tier: row.ticket_tiers?.name ?? "Entrada",
      scanned_at: row.scanned_at,
      scanned_at_local: row.scanned_at
        ? new Date(row.scanned_at).getTime()
        : null,
    }
  })

  const hashSource = tickets
    .map((t) => `${t.id}:${t.status}:${t.totp_secret}`)
    .sort()
    .join("|")

  const hash = Buffer.from(hashSource).toString("base64url").slice(0, 48)

  return {
    eventId: event.id,
    eventTitle: event.title,
    qrType: event.qr_type === "static" ? "static" : "dynamic",
    hash,
    tickets,
  }
}

export type OfflineSyncItem = {
  ticketId: string
  scannedAtLocal: number
}

export type SyncOfflineResult =
  | {
      success: true
      data: {
        syncedIds: string[]
        conflicts: Array<{ ticketId: string; reason: string }>
      }
    }
  | { success: false; error: string }

/** Batch update desde la cola offline del escáner. */
export async function syncOfflineScansBatch(
  items: OfflineSyncItem[],
): Promise<SyncOfflineResult> {
  const syncedIds: string[] = []
  const conflicts: Array<{ ticketId: string; reason: string }> = []

  if (items.length === 0) {
    return { success: true, data: { syncedIds, conflicts } }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "auth_required" }
  }

  for (const item of items) {
    const scannedAt = new Date(item.scannedAtLocal).toISOString()

    const { data: updated, error } = await supabase
      .from("tickets")
      .update({ status: "used", scanned_at: scannedAt })
      .eq("id", item.ticketId)
      .eq("status", "valid")
      .select("id")
      .maybeSingle()

    if (error) {
      conflicts.push({ ticketId: item.ticketId, reason: error.message })
      continue
    }

    if (updated) {
      syncedIds.push(item.ticketId)
      await supabase.rpc("mark_guest_entry_checked_in", {
        p_ticket_id: item.ticketId,
      })
      continue
    }

    // Ya estaba used en servidor: consideramos sync OK (idempotente).
    const { data: existing } = await supabase
      .from("tickets")
      .select("id, status")
      .eq("id", item.ticketId)
      .maybeSingle()

    if (existing && (existing.status === "used" || existing.status === "scanned")) {
      syncedIds.push(item.ticketId)
    } else {
      conflicts.push({
        ticketId: item.ticketId,
        reason: existing?.status ?? "not_found",
      })
    }
  }

  revalidatePath("/admin/scanner")
  return { success: true, data: { syncedIds, conflicts } }
}
