"use server"

import { revalidatePath } from "next/cache"

import { notifyOpsAlert } from "@/lib/ops/notify-ops"
import { getEmailAppUrl, sendOpsAlertEmail } from "@/lib/email/resend"
import { logger } from "@/lib/logger"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { SupportMessage, SupportThread } from "@/types/database"

export type SupportActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export type SupportThreadListItem = {
  id: string
  organizerId: string
  organizerName: string
  organizerEmail: string
  organizerPhone: string | null
  eventId: string | null
  eventTitle: string | null
  status: SupportThread["status"]
  lastMessagePreview: string | null
  lastMessageIsAdmin: boolean
  unreadForAdmin: boolean
  unreadForOrganizer: boolean
  updatedAt: string
}

export type SupportMessageItem = {
  id: string
  threadId: string
  senderId: string
  isAdmin: boolean
  content: string
  createdAt: string
}

export type SupportContext = {
  organizerName: string
  organizerEmail: string
  organizerPhone: string | null
  eventId: string | null
  eventTitle: string | null
  eventDate: string | null
  eventLocation: string | null
  eventStatus: string | null
}

async function requireUser() {
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
    .select("id, role, full_name, public_name, email")
    .eq("id", user.id)
    .maybeSingle()
  if (!profile) {
    throw new Error("No se encontró tu perfil.")
  }
  return { user, profile, admin: createAdminClient() }
}

function isSuper(role: string | null | undefined) {
  return role === "super_admin"
}

function previewOf(content: string) {
  return content.trim().slice(0, 160)
}

function mapMessage(row: SupportMessage): SupportMessageItem {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    isAdmin: row.is_admin,
    content: row.content,
    createdAt: row.created_at,
  }
}

function unreadForAdmin(thread: SupportThread) {
  if (thread.last_message_is_admin) return false
  if (!thread.last_message_preview) return false
  if (!thread.last_admin_read_at) return true
  return new Date(thread.updated_at) > new Date(thread.last_admin_read_at)
}

function unreadForOrganizer(thread: SupportThread) {
  if (!thread.last_message_is_admin) return false
  if (!thread.last_organizer_read_at) return true
  return new Date(thread.updated_at) > new Date(thread.last_organizer_read_at)
}

export async function countUnreadSupportForAdmin(): Promise<number> {
  const { profile, admin } = await requireUser()
  if (!isSuper(profile.role)) return 0
  const { data, error } = await admin
    .from("support_threads")
    .select(
      "updated_at, last_admin_read_at, last_message_is_admin, last_message_preview",
    )
    .eq("status", "pending_admin")
  if (error) return 0
  return (data ?? []).filter((row) => unreadForAdmin(row as SupportThread)).length
}

export async function listSupportThreads(): Promise<SupportThreadListItem[]> {
  const { profile, admin } = await requireUser()
  if (!isSuper(profile.role)) {
    throw new Error("Acceso restringido al super administrador.")
  }

  const { data, error } = await admin
    .from("support_threads")
    .select(
      "id, organizer_id, event_id, status, last_message_preview, last_message_is_admin, last_admin_read_at, last_organizer_read_at, updated_at, profiles!support_threads_organizer_id_fkey(full_name, public_name, email, phone), events(title)",
    )
    .order("updated_at", { ascending: false })
    .limit(120)

  if (error) {
    throw new Error(`No se pudieron cargar los chats: ${error.message}`)
  }

  type Row = SupportThread & {
    profiles: {
      full_name: string | null
      public_name: string | null
      email: string
      phone: string | null
    } | null
    events: { title: string } | null
  }

  return ((data ?? []) as unknown as Row[]).map((thread) => ({
    id: thread.id,
    organizerId: thread.organizer_id,
    organizerName:
      thread.profiles?.public_name?.trim() ||
      thread.profiles?.full_name?.trim() ||
      "—",
    organizerEmail: thread.profiles?.email ?? "—",
    organizerPhone: thread.profiles?.phone ?? null,
    eventId: thread.event_id,
    eventTitle: thread.events?.title ?? null,
    status: thread.status,
    lastMessagePreview: thread.last_message_preview,
    lastMessageIsAdmin: thread.last_message_is_admin,
    unreadForAdmin: unreadForAdmin(thread),
    unreadForOrganizer: unreadForOrganizer(thread),
    updatedAt: thread.updated_at,
  }))
}

export async function getSupportThreadContext(
  threadId: string,
): Promise<SupportContext | null> {
  const { profile, admin } = await requireUser()
  if (!isSuper(profile.role)) return null

  const { data } = await admin
    .from("support_threads")
    .select(
      "event_id, profiles!support_threads_organizer_id_fkey(full_name, public_name, email, phone), events(id, title, date, location, status)",
    )
    .eq("id", threadId)
    .maybeSingle()

  if (!data) return null
  const row = data as unknown as {
    event_id: string | null
    profiles: {
      full_name: string | null
      public_name: string | null
      email: string
      phone: string | null
    } | null
    events: {
      id: string
      title: string
      date: string
      location: string
      status: string
    } | null
  }

  return {
    organizerName:
      row.profiles?.public_name?.trim() ||
      row.profiles?.full_name?.trim() ||
      "—",
    organizerEmail: row.profiles?.email ?? "—",
    organizerPhone: row.profiles?.phone ?? null,
    eventId: row.events?.id ?? row.event_id,
    eventTitle: row.events?.title ?? null,
    eventDate: row.events?.date ?? null,
    eventLocation: row.events?.location ?? null,
    eventStatus: row.events?.status ?? null,
  }
}

export async function listSupportMessages(
  threadId: string,
): Promise<SupportMessageItem[]> {
  const { user, profile, admin } = await requireUser()
  const { data: thread } = await admin
    .from("support_threads")
    .select("id, organizer_id")
    .eq("id", threadId)
    .maybeSingle()
  if (!thread) return []
  if (!isSuper(profile.role) && thread.organizer_id !== user.id) {
    throw new Error("No tenés acceso a este chat.")
  }

  const { data, error } = await admin
    .from("support_messages")
    .select("id, thread_id, sender_id, is_admin, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(300)

  if (error) {
    throw new Error(`No se pudieron cargar los mensajes: ${error.message}`)
  }
  return ((data ?? []) as SupportMessage[]).map(mapMessage)
}

export async function getOrCreateOrganizerThread(
  eventId?: string | null,
): Promise<SupportActionResult<{ threadId: string }>> {
  try {
    const { user, profile, admin } = await requireUser()
    if (profile.role !== "admin" && profile.role !== "super_admin") {
      return { success: false, error: "Solo organizadores pueden abrir soporte." }
    }

    let resolvedEventId: string | null = eventId?.trim() || null
    if (resolvedEventId) {
      const { data: event } = await admin
        .from("events")
        .select("id, organizer_id")
        .eq("id", resolvedEventId)
        .maybeSingle()
      if (!event || (event.organizer_id !== user.id && profile.role !== "super_admin")) {
        resolvedEventId = null
      }
    }

    const organizerId =
      profile.role === "super_admin" && resolvedEventId
        ? (
            await admin
              .from("events")
              .select("organizer_id")
              .eq("id", resolvedEventId)
              .maybeSingle()
          ).data?.organizer_id ?? user.id
        : user.id

    let query = admin
      .from("support_threads")
      .select("id")
      .eq("organizer_id", organizerId)
    query = resolvedEventId
      ? query.eq("event_id", resolvedEventId)
      : query.is("event_id", null)

    const existing = await query.maybeSingle()
    if (existing.data?.id) {
      return { success: true, data: { threadId: existing.data.id } }
    }

    const { data: created, error } = await admin
      .from("support_threads")
      .insert({
        organizer_id: organizerId,
        event_id: resolvedEventId,
        status: "open",
      })
      .select("id")
      .maybeSingle()

    if (error || !created) {
      return {
        success: false,
        error: error?.message ?? "No se pudo abrir el chat.",
      }
    }
    return { success: true, data: { threadId: created.id } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo abrir el chat.",
    }
  }
}

export async function openSupportThreadForEvent(
  eventId: string,
  organizerId: string,
): Promise<SupportActionResult<{ threadId: string }>> {
  try {
    const { profile, admin } = await requireUser()
    if (!isSuper(profile.role)) {
      return { success: false, error: "Acceso restringido." }
    }
    const existing = await admin
      .from("support_threads")
      .select("id")
      .eq("organizer_id", organizerId)
      .eq("event_id", eventId)
      .maybeSingle()
    if (existing.data?.id) {
      return { success: true, data: { threadId: existing.data.id } }
    }
    const { data: created, error } = await admin
      .from("support_threads")
      .insert({
        organizer_id: organizerId,
        event_id: eventId,
        status: "open",
      })
      .select("id")
      .maybeSingle()
    if (error || !created) {
      return {
        success: false,
        error: error?.message ?? "No se pudo abrir el chat.",
      }
    }
    return { success: true, data: { threadId: created.id } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo abrir el chat.",
    }
  }
}

export async function sendSupportMessage(
  threadId: string,
  content: string,
): Promise<SupportActionResult<SupportMessageItem>> {
  const text = content.trim()
  if (text.length < 1) {
    return { success: false, error: "Escribí un mensaje." }
  }
  if (text.length > 4000) {
    return { success: false, error: "El mensaje es demasiado largo." }
  }

  try {
    const { user, profile, admin } = await requireUser()
    const { data: thread } = await admin
      .from("support_threads")
      .select("id, organizer_id, event_id")
      .eq("id", threadId)
      .maybeSingle()
    if (!thread) {
      return { success: false, error: "Chat no encontrado." }
    }

    const asAdmin = isSuper(profile.role)
    if (!asAdmin && thread.organizer_id !== user.id) {
      return { success: false, error: "No tenés acceso a este chat." }
    }

    const { data: inserted, error } = await admin
      .from("support_messages")
      .insert({
        thread_id: threadId,
        sender_id: user.id,
        is_admin: asAdmin,
        content: text,
      })
      .select("id, thread_id, sender_id, is_admin, content, created_at")
      .maybeSingle()

    if (error || !inserted) {
      return {
        success: false,
        error: error?.message ?? "No se pudo enviar el mensaje.",
      }
    }

    const now = new Date().toISOString()
    await admin
      .from("support_threads")
      .update(
        asAdmin
          ? { last_admin_read_at: now }
          : { last_organizer_read_at: now },
      )
      .eq("id", threadId)

    revalidatePath("/superadmin")
    revalidatePath("/superadmin/soporte")
    revalidatePath("/admin")

    if (!asAdmin) {
      void notifyOpsAlert({
        kind: "support_message",
        title: "Nuevo mensaje de soporte",
        body: `${profile.public_name?.trim() || profile.full_name?.trim() || profile.email}: ${previewOf(text)}`,
        href: `/superadmin/soporte?thread=${threadId}`,
      })
    } else {
      void notifyOrganizerSupportReply({
        organizerId: thread.organizer_id,
        preview: previewOf(text),
      })
    }

    return { success: true, data: mapMessage(inserted as SupportMessage) }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "No se pudo enviar el mensaje.",
    }
  }
}

export async function markSupportThreadRead(
  threadId: string,
): Promise<SupportActionResult<{ ok: true }>> {
  try {
    const { user, profile, admin } = await requireUser()
    const { data: thread } = await admin
      .from("support_threads")
      .select("id, organizer_id")
      .eq("id", threadId)
      .maybeSingle()
    if (!thread) return { success: false, error: "Chat no encontrado." }
    if (!isSuper(profile.role) && thread.organizer_id !== user.id) {
      return { success: false, error: "No tenés acceso a este chat." }
    }
    const now = new Date().toISOString()
    const patch = isSuper(profile.role)
      ? { last_admin_read_at: now }
      : { last_organizer_read_at: now }
    await admin.from("support_threads").update(patch).eq("id", threadId)
    return { success: true, data: { ok: true } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo marcar leído.",
    }
  }
}

export async function getOrganizerUnreadSupportCount(): Promise<number> {
  try {
    const { user, admin } = await requireUser()
    const { data } = await admin
      .from("support_threads")
      .select(
        "updated_at, last_organizer_read_at, last_message_is_admin, last_message_preview",
      )
      .eq("organizer_id", user.id)
    return (data ?? []).filter((row) =>
      unreadForOrganizer(row as SupportThread),
    ).length
  } catch {
    return 0
  }
}

async function notifyOrganizerSupportReply(input: {
  organizerId: string
  preview: string
}) {
  try {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from("profiles")
      .select("email, full_name, public_name")
      .eq("id", input.organizerId)
      .maybeSingle()
    if (!profile?.email) return
    const name = profile.public_name?.trim() || profile.full_name?.trim() || "hola"
    await sendOpsAlertEmail({
      to: profile.email,
      subject: "TokePass respondió tu consulta",
      text: `${name}, hay una respuesta nueva en Soporte TokePass: ${input.preview}\n\n${getEmailAppUrl()}/admin`,
    })
  } catch (error) {
    logger.error({
      context: "support",
      message: "organizer_reply_email_failed",
      error,
    })
  }
}

export async function requestEventCancellationSupport(
  eventId: string,
): Promise<SupportActionResult<{ threadId: string }>> {
  const id = eventId.trim()
  if (!id) {
    return { success: false, error: "Evento inválido." }
  }

  try {
    const { user, profile, admin } = await requireUser()
    if (profile.role !== "admin" && profile.role !== "super_admin") {
      return { success: false, error: "Solo organizadores pueden pedir esta cancelación." }
    }

    const { data: event } = await admin
      .from("events")
      .select("id, title, organizer_id, status")
      .eq("id", id)
      .maybeSingle()

    if (!event || (event.organizer_id !== user.id && profile.role !== "super_admin")) {
      return { success: false, error: "No tenés permiso sobre este evento." }
    }

    const { data: ticketRows, error: ticketError } = await admin
      .from("tickets")
      .select("order_id")
      .eq("event_id", id)
      .not("order_id", "is", null)

    if (ticketError) {
      return { success: false, error: ticketError.message }
    }

    const orderIds = [
      ...new Set(
        (ticketRows ?? [])
          .map((row) => row.order_id)
          .filter((orderId): orderId is string => Boolean(orderId)),
      ),
    ]

    let paidCount = 0
    if (orderIds.length > 0) {
      const { count, error: paidError } = await admin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "paid")
        .in("id", orderIds)
      if (paidError) {
        return { success: false, error: paidError.message }
      }
      paidCount = count ?? 0
    }

    if (paidCount === 0) {
      return {
        success: false,
        error: "Este evento no tiene compras pagadas. Podés eliminarlo o archivarlo desde el panel.",
      }
    }

    const thread = await getOrCreateOrganizerThread(id)
    if (!thread.success) return thread

    const existing = await listSupportMessages(thread.data.threadId)
    const alreadyAsked = existing.some((message) =>
      message.content.includes("Solicitud de cancelación de evento"),
    )
    if (alreadyAsked) {
      return { success: true, data: { threadId: thread.data.threadId } }
    }

    const sent = await sendSupportMessage(
      thread.data.threadId,
      [
        "Solicitud de cancelación de evento",
        `Evento: ${event.title}`,
        `Estado actual: ${event.status}`,
        `Compras pagadas: ${paidCount}`,
        "No puedo cancelar el evento desde el panel porque ya hay dinero recaudado. Pedimos que soporte evalúe la cancelación y el reembolso por la pasarela de pago.",
      ].join("\n"),
    )

    if (!sent.success) return sent
    return { success: true, data: { threadId: thread.data.threadId } }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo enviar la solicitud a soporte.",
    }
  }
}
