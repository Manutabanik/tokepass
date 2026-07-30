"use server"

import { revalidatePath } from "next/cache"

import { assertGuestListRateLimit, getClientIpBucket } from "@/app/actions/event-staff"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type GuestListStatus = "pending" | "claimed" | "checked_in"

export type GuestListSummary = {
  id: string
  eventId: string
  name: string
  maxGuests: number
  validUntil: string
  usedGuests: number
  claimed: number
  checkedIn: number
  remaining: number
  createdAt: string
}

export type GuestListEntryRow = {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  status: GuestListStatus
  ticketId: string | null
  createdAt: string
}

export type GuestListPublicMeta = {
  id: string
  name: string
  maxGuests: number
  usedGuests: number
  remaining: number
  validUntil: string
  eventId: string
  eventTitle: string
  eventDate: string
}

export type GuestListMetrics = {
  totalCapacity: number
  claimed: number
  checkedIn: number
  pending: number
}

type ActionOk<T = undefined> = { success: true; data: T }
type ActionFail = { success: false; error: string }
type ActionResult<T = undefined> = ActionOk<T> | ActionFail

async function requireOrganizer() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error("auth_required")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "super_admin")
  ) {
    throw new Error("forbidden")
  }

  return { supabase, userId: user.id, role: profile.role }
}

async function assertCanManageEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  role: string,
  eventId: string,
) {
  if (role === "super_admin") return

  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("organizer_id", userId)
    .maybeSingle()

  if (!event) {
    throw new Error("forbidden")
  }
}

function revalidateGuestPaths(eventId: string, listId?: string) {
  revalidatePath(`/admin/events/${eventId}/lists`)
  revalidatePath("/admin/lists")
  revalidatePath("/admin/scanner")
  revalidatePath("/my-tickets")
  if (listId) {
    revalidatePath(`/lists/claim/${listId}`)
  }
}

/** Stub de notificaciones (WhatsApp / email) — listo para cablear proveedor real. */
export async function dispatchGuestPassNotification(input: {
  fullName: string
  email?: string | null
  phone?: string | null
  eventTitle: string
  listName: string
  claimUrl?: string
}): Promise<void> {
  // Dispatcher no-op con log estructurado para observabilidad.
  console.info("[guest-lists.notify]", {
    channel: input.phone ? "whatsapp" : input.email ? "email" : "none",
    to: input.phone ?? input.email ?? null,
    fullName: input.fullName,
    eventTitle: input.eventTitle,
    listName: input.listName,
    claimUrl: input.claimUrl ?? null,
  })
}

export async function createGuestList(input: {
  eventId: string
  name: string
  maxGuests: number
  validUntil: string
}): Promise<ActionResult<{ listId: string }>> {
  try {
    const { supabase, userId, role } = await requireOrganizer()
    await assertCanManageEvent(supabase, userId, role, input.eventId)

    const name = input.name.trim()
    if (name.length < 2) {
      return { success: false, error: "El nombre de la lista es obligatorio." }
    }

    if (!Number.isInteger(input.maxGuests) || input.maxGuests < 1) {
      return { success: false, error: "Los cupos deben ser un entero ≥ 1." }
    }

    const validUntil = new Date(input.validUntil)
    if (Number.isNaN(validUntil.getTime())) {
      return { success: false, error: "La hora límite no es válida." }
    }

    const { data, error } = await supabase
      .from("guest_lists")
      .insert({
        event_id: input.eventId,
        name,
        max_guests: input.maxGuests,
        valid_until: validUntil.toISOString(),
      })
      .select("id")
      .single()

    if (error || !data) {
      return {
        success: false,
        error: error?.message ?? "No se pudo crear la lista.",
      }
    }

    revalidateGuestPaths(input.eventId, data.id)
    return { success: true, data: { listId: data.id } }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al crear la lista.",
    }
  }
}

export async function addGuestsToList(input: {
  listId: string
  guests: Array<{ fullName: string; email?: string; phone?: string }>
}): Promise<ActionResult<{ added: number; entryIds: string[] }>> {
  try {
    const { supabase, userId, role } = await requireOrganizer()

    const { data: list, error: listError } = await supabase
      .from("guest_lists")
      .select("id, event_id, max_guests")
      .eq("id", input.listId)
      .maybeSingle()

    if (listError || !list) {
      return { success: false, error: "Lista no encontrada." }
    }

    await assertCanManageEvent(supabase, userId, role, list.event_id)

    const cleaned = input.guests
      .map((guest) => ({
        fullName: guest.fullName.trim(),
        email: guest.email?.trim() || null,
        phone: guest.phone?.trim() || null,
      }))
      .filter((guest) => guest.fullName.length > 0)

    if (cleaned.length === 0) {
      return { success: false, error: "No hay invitados para agregar." }
    }

    const entryIds: string[] = []
    for (const guest of cleaned) {
      const { data: entryId, error } = await supabase.rpc(
        "register_guest_list_entry",
        {
          p_list_id: input.listId,
          p_full_name: guest.fullName,
          p_email: guest.email,
          p_phone: guest.phone,
        },
      )

      if (error) {
        if (entryIds.length > 0) {
          revalidateGuestPaths(list.event_id, input.listId)
          return {
            success: false,
            error: `${error.message} (se agregaron ${entryIds.length} antes del límite).`,
          }
        }
        return { success: false, error: error.message }
      }

      if (entryId) entryIds.push(String(entryId))
    }

    revalidateGuestPaths(list.event_id, input.listId)
    return {
      success: true,
      data: { added: entryIds.length, entryIds },
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al agregar invitados.",
    }
  }
}

export async function claimFreePass(
  entryId: string,
): Promise<ActionResult<{ ticketId: string }>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: "auth_required" }
    }

    const rate = await assertGuestListRateLimit({
      listId: `claim:${entryId}`,
      email: user.email,
    })
    if (!rate.ok) {
      return { success: false, error: rate.error }
    }

    const { data: ticketId, error } = await supabase.rpc(
      "claim_guest_list_entry",
      {
        p_entry_id: entryId,
        p_owner_id: user.id,
      },
    )

    if (error || !ticketId) {
      const message = error?.message ?? "No se pudo canjear el FreePass."
      if (message.includes("EMAIL_MISMATCH")) {
        return {
          success: false,
          error:
            "Este FreePass está vinculado a otro email. Ingresá con la cuenta correcta.",
        }
      }
      if (message.includes("EMAIL_REQUIRED")) {
        return {
          success: false,
          error: "La cortesía no tiene email. Registrá de nuevo con tu email.",
        }
      }
      return { success: false, error: message }
    }

    revalidatePath("/my-tickets")
    return { success: true, data: { ticketId: String(ticketId) } }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al canjear FreePass.",
    }
  }
}

export async function registerPublicGuest(input: {
  listId: string
  fullName: string
  email?: string
  phone?: string
}): Promise<
  ActionResult<{ entryId: string; ticketId: string | null; remaining: number }>
> {
  try {
    const email = input.email?.trim().toLowerCase()
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return {
        success: false,
        error: "El email es obligatorio para reclamar el FreePass.",
      }
    }

    const rate = await assertGuestListRateLimit({
      listId: input.listId,
      email,
    })
    if (!rate.ok) {
      return { success: false, error: rate.error }
    }

    const admin = createAdminClient()
    const ipBucket = await getClientIpBucket("ip")
    const clientKey = ipBucket.replace(/^ip:/, "") || "unknown"

    const { data: entryId, error } = await admin.rpc(
      "register_guest_list_entry",
      {
        p_list_id: input.listId,
        p_full_name: input.fullName,
        p_email: email,
        p_phone: input.phone?.trim() || null,
        p_client_key: clientKey,
      },
    )

    if (error || !entryId) {
      const message = error?.message ?? "No se pudo registrar en la lista."
      if (message.includes("EMAIL_REQUIRED")) {
        return {
          success: false,
          error: "El email es obligatorio para reclamar el FreePass.",
        }
      }
      if (
        message.includes("EMAIL_ALREADY_REGISTERED") ||
        message.includes("23505")
      ) {
        return {
          success: false,
          error: "Ese email ya reclamó un pase en esta lista.",
        }
      }
      if (message.includes("RATE_LIMITED")) {
        return {
          success: false,
          error: "Demasiados intentos. Probá más tarde.",
        }
      }
      return { success: false, error: message }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    let ticketId: string | null = null

    if (user) {
      const claim = await claimFreePass(String(entryId))
      if (claim.success) {
        ticketId = claim.data.ticketId
      }
    }

    const publicMeta = await getGuestListPublic(input.listId)

    await dispatchGuestPassNotification({
      fullName: input.fullName.trim(),
      email,
      phone: input.phone,
      eventTitle: publicMeta?.eventTitle ?? "Evento Tokepass",
      listName: publicMeta?.name ?? "Lista",
      claimUrl: ticketId
        ? undefined
        : `/lists/claim/${input.listId}?entry=${entryId}`,
    })

    revalidatePath(`/lists/claim/${input.listId}`)

    return {
      success: true,
      data: {
        entryId: String(entryId),
        ticketId,
        remaining: publicMeta?.remaining ?? 0,
      },
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al registrarte en la lista.",
    }
  }
}

export async function getGuestListPublic(
  listId: string,
): Promise<GuestListPublicMeta | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_guest_list_public", {
    p_list_id: listId,
  })

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    return null
  }

  const row = Array.isArray(data) ? data[0] : data

  return {
    id: row.id,
    name: row.name,
    maxGuests: Number(row.max_guests),
    usedGuests: Number(row.used_guests),
    remaining: Number(row.remaining),
    validUntil: row.valid_until,
    eventId: row.event_id,
    eventTitle: row.event_title,
    eventDate: row.event_date,
  }
}

export async function getEventGuestLists(
  eventId: string,
): Promise<{ lists: GuestListSummary[]; metrics: GuestListMetrics }> {
  const { supabase, userId, role } = await requireOrganizer()
  await assertCanManageEvent(supabase, userId, role, eventId)

  const { data: lists, error } = await supabase
    .from("guest_lists")
    .select("id, event_id, name, max_guests, valid_until, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  const listIds = (lists ?? []).map((list) => list.id)
  const entriesByList = new Map<
    string,
    { used: number; claimed: number; checkedIn: number }
  >()

  if (listIds.length > 0) {
    const { data: entries } = await supabase
      .from("guest_list_entries")
      .select("guest_list_id, status")
      .in("guest_list_id", listIds)

    for (const entry of entries ?? []) {
      const current = entriesByList.get(entry.guest_list_id) ?? {
        used: 0,
        claimed: 0,
        checkedIn: 0,
      }
      current.used += 1
      if (entry.status === "claimed") current.claimed += 1
      if (entry.status === "checked_in") {
        current.checkedIn += 1
        current.claimed += 1
      }
      entriesByList.set(entry.guest_list_id, current)
    }
  }

  const mapped: GuestListSummary[] = (lists ?? []).map((list) => {
    const stats = entriesByList.get(list.id) ?? {
      used: 0,
      claimed: 0,
      checkedIn: 0,
    }
    return {
      id: list.id,
      eventId: list.event_id,
      name: list.name,
      maxGuests: list.max_guests,
      validUntil: list.valid_until,
      usedGuests: stats.used,
      claimed: stats.claimed,
      checkedIn: stats.checkedIn,
      remaining: Math.max(0, list.max_guests - stats.used),
      createdAt: list.created_at,
    }
  })

  const metrics: GuestListMetrics = {
    totalCapacity: mapped.reduce((sum, list) => sum + list.maxGuests, 0),
    claimed: mapped.reduce((sum, list) => sum + list.claimed, 0),
    checkedIn: mapped.reduce((sum, list) => sum + list.checkedIn, 0),
    pending: mapped.reduce(
      (sum, list) => sum + Math.max(0, list.usedGuests - list.claimed),
      0,
    ),
  }

  return { lists: mapped, metrics }
}

export async function getGuestListEntries(
  listId: string,
): Promise<GuestListEntryRow[]> {
  const { supabase, userId, role } = await requireOrganizer()

  const { data: list } = await supabase
    .from("guest_lists")
    .select("event_id")
    .eq("id", listId)
    .maybeSingle()

  if (!list) {
    throw new Error("Lista no encontrada")
  }

  await assertCanManageEvent(supabase, userId, role, list.event_id)

  const { data, error } = await supabase
    .from("guest_list_entries")
    .select("id, full_name, email, phone, status, ticket_id, created_at")
    .eq("guest_list_id", listId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((entry) => ({
    id: entry.id,
    fullName: entry.full_name,
    email: entry.email,
    phone: entry.phone,
    status: entry.status as GuestListStatus,
    ticketId: entry.ticket_id,
    createdAt: entry.created_at,
  }))
}
