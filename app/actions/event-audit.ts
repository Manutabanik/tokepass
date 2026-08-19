"use server"

import { revalidatePath } from "next/cache"

import { materializeEventSeatingUnits } from "@/app/actions/events"
import {
  openSupportThreadForEvent,
  sendSupportMessage,
} from "@/app/actions/support"
import { notifyOrganizerEventAudit } from "@/lib/events/notify-event-audit"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { EventStatus } from "@/types/database"

async function requireSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    throw new Error("Debes iniciar sesión.")
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  if (profile?.role !== "super_admin") {
    throw new Error("Acceso restringido al super administrador.")
  }
  return { admin: createAdminClient(), actorId: user.id }
}

export type AuditEventRow = {
  id: string
  organizerId: string
  title: string
  date: string
  location: string
  flyerUrl: string | null
  imageUrl: string | null
  reviewNote: string | null
  organizerName: string
  organizerEmail: string
  organizerPhone: string | null
  tiers: Array<{ name: string; price: number; capacity: number }>
}

const AUDIT_EVENT_SELECT =
  "id, organizer_id, title, date, location, flyer_url, image_url, review_note, profiles!events_organizer_id_fkey(full_name, public_name, email, phone), ticket_tiers(name, price, capacity)"

type AuditQueryRow = {
  id: string
  organizer_id: string
  title: string
  date: string
  location: string
  flyer_url: string | null
  image_url: string | null
  review_note: string | null
  profiles: {
    full_name: string | null
    public_name: string | null
    email: string
    phone: string | null
  } | null
  ticket_tiers: Array<{ name: string; price: number; capacity: number }> | null
}

function mapAuditRow(event: AuditQueryRow): AuditEventRow {
  return {
    id: event.id,
    organizerId: event.organizer_id,
    title: event.title,
    date: event.date,
    location: event.location,
    flyerUrl: event.flyer_url,
    imageUrl: event.image_url,
    reviewNote: event.review_note,
    organizerName:
      event.profiles?.public_name?.trim() ||
      event.profiles?.full_name?.trim() ||
      "—",
    organizerEmail: event.profiles?.email ?? "—",
    organizerPhone: event.profiles?.phone ?? null,
    tiers: event.ticket_tiers ?? [],
  }
}

async function listAuditEventsByStatus(
  status: Extract<EventStatus, "pending_approval" | "needs_revision">,
): Promise<AuditEventRow[]> {
  const { admin } = await requireSuperAdmin()
  const { data, error } = await admin
    .from("events")
    .select(AUDIT_EVENT_SELECT)
    .eq("status", status)
    .order("updated_at", { ascending: false })
    .limit(100)

  if (error) {
    throw new Error(`No se pudieron cargar los eventos: ${error.message}`)
  }

  return ((data ?? []) as unknown as AuditQueryRow[]).map(mapAuditRow)
}

export async function listPendingAuditEvents(): Promise<AuditEventRow[]> {
  return listAuditEventsByStatus("pending_approval")
}

export async function listRevisionAuditEvents(): Promise<AuditEventRow[]> {
  return listAuditEventsByStatus("needs_revision")
}

export async function getAuditEventDetails(
  eventId: string,
): Promise<AuditEventRow | null> {
  const { admin } = await requireSuperAdmin()
  const { data, error } = await admin
    .from("events")
    .select(AUDIT_EVENT_SELECT)
    .eq("id", eventId)
    .maybeSingle()

  if (error || !data) return null
  return mapAuditRow(data as unknown as AuditQueryRow)
}

export type EventAuditActionResult =
  | { success: true; status: EventStatus; threadId?: string }
  | { success: false; error: string }

export async function approveEventForPublication(
  eventId: string,
): Promise<EventAuditActionResult> {
  if (!eventId.trim()) return { success: false, error: "Evento inválido." }

  let admin: ReturnType<typeof createAdminClient>
  let actorId: string
  try {
    const context = await requireSuperAdmin()
    admin = context.admin
    actorId = context.actorId
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Acceso no autorizado.",
    }
  }

  const { data: event } = await admin
    .from("events")
    .select("id, status")
    .eq("id", eventId)
    .maybeSingle()
  if (!event) return { success: false, error: "Evento no encontrado." }
  if (event.status !== "pending_approval" && event.status !== "needs_revision") {
    return {
      success: false,
      error: "Este evento no está esperando auditoría.",
    }
  }

  const materializeError = await materializeEventSeatingUnits(admin, eventId)
  if (materializeError) {
    return {
      success: false,
      error: `No se pudo generar el inventario de asientos: ${materializeError}`,
    }
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await admin
    .from("events")
    .update({
      status: "published",
      review_note: null,
      reviewed_at: now,
      reviewed_by: actorId,
      updated_at: now,
    })
    .eq("id", eventId)
    .in("status", ["pending_approval", "needs_revision"])
    .select("id")
    .maybeSingle()

  if (error || !updated) {
    return {
      success: false,
      error: error?.message ?? "No se pudo aprobar el evento.",
    }
  }

  revalidateAuditPaths(eventId)
  void notifyOrganizerEventAudit({ eventId, kind: "approved" })
  return { success: true, status: "published" }
}

export async function requestEventRevision(
  eventId: string,
  note?: string,
): Promise<EventAuditActionResult> {
  if (!eventId.trim()) return { success: false, error: "Evento inválido." }
  const reviewNote = note?.trim() || ""

  let admin: ReturnType<typeof createAdminClient>
  let actorId: string
  try {
    const context = await requireSuperAdmin()
    admin = context.admin
    actorId = context.actorId
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Acceso no autorizado.",
    }
  }

  const { data: event } = await admin
    .from("events")
    .select("id, organizer_id, status")
    .eq("id", eventId)
    .maybeSingle()
  if (!event) return { success: false, error: "Evento no encontrado." }

  const now = new Date().toISOString()
  const { data: updated, error } = await admin
    .from("events")
    .update({
      status: "needs_revision",
      review_note: reviewNote ? reviewNote.slice(0, 800) : null,
      reviewed_at: now,
      reviewed_by: actorId,
      updated_at: now,
    })
    .eq("id", eventId)
    .in("status", ["pending_approval", "needs_revision"])
    .select("id")
    .maybeSingle()

  if (error || !updated) {
    return {
      success: false,
      error: error?.message ?? "No se pudo pedir cambios.",
    }
  }

  const thread = await openSupportThreadForEvent(eventId, event.organizer_id)
  if (thread.success && reviewNote) {
    await sendSupportMessage(thread.data.threadId, reviewNote)
  } else if (thread.success) {
    await sendSupportMessage(
      thread.data.threadId,
      "TokePass pidió cambios en este evento. Revisá fecha, locación y condiciones y volvé a enviarlo a revisión.",
    )
  }

  revalidateAuditPaths(eventId)
  void notifyOrganizerEventAudit({
    eventId,
    kind: "needs_revision",
    note: reviewNote || null,
  })
  return {
    success: true,
    status: "needs_revision",
    threadId: thread.success ? thread.data.threadId : undefined,
  }
}

export async function rejectEventForPublication(
  eventId: string,
  note?: string,
): Promise<EventAuditActionResult> {
  if (!eventId.trim()) return { success: false, error: "Evento inválido." }
  const reviewNote = note?.trim() || ""

  let admin: ReturnType<typeof createAdminClient>
  let actorId: string
  try {
    const context = await requireSuperAdmin()
    admin = context.admin
    actorId = context.actorId
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Acceso no autorizado.",
    }
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await admin
    .from("events")
    .update({
      status: "rejected",
      review_note: reviewNote ? reviewNote.slice(0, 800) : "Evento rechazado.",
      reviewed_at: now,
      reviewed_by: actorId,
      updated_at: now,
    })
    .eq("id", eventId)
    .in("status", ["pending_approval", "needs_revision"])
    .select("id")
    .maybeSingle()

  if (error || !updated) {
    return {
      success: false,
      error: error?.message ?? "No se pudo rechazar el evento.",
    }
  }

  revalidateAuditPaths(eventId)
  void notifyOrganizerEventAudit({
    eventId,
    kind: "rejected",
    note: reviewNote || null,
  })
  return { success: true, status: "rejected" }
}

function revalidateAuditPaths(eventId: string) {
  revalidatePath("/superadmin")
  revalidatePath("/superadmin/auditoria")
  revalidatePath("/superadmin/events")
  revalidatePath(`/superadmin/events/${eventId}`)
  revalidatePath("/admin")
  revalidatePath("/admin/events")
  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath("/events")
  revalidatePath(`/events/${eventId}`)
  revalidatePath("/")
}
