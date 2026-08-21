"use server"

import { revalidatePath } from "next/cache"

import { assertGuestListRateLimit, getClientIpBucket } from "@/app/actions/event-staff"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import {
  firstZodIssue,
  freepassRegisterSchema,
} from "@/lib/validations/freepass"

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
  revalidatePath("/cuenta/entradas")
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
        email: guest.email?.trim().toLowerCase() || null,
        phone: guest.phone?.trim() || null,
      }))
      .filter((guest) => guest.fullName.length > 0)

    if (cleaned.length === 0) {
      return { success: false, error: "No hay invitados para agregar." }
    }

    const admin = createAdminClient()
    const entryIds: string[] = []
    for (const guest of cleaned) {
      const { data: entryId, error } = await admin.rpc(
        "register_guest_list_entry",
        {
          p_list_id: input.listId,
          p_full_name: guest.fullName,
          p_email: guest.email,
          p_phone: guest.phone,
          p_client_key: `organizer:${userId}`,
        },
      )

      if (error) {
        const mapped = mapFreepassSubmitError(error, "No se pudo agregar el invitado.")
        if (entryIds.length > 0) {
          revalidateGuestPaths(list.event_id, input.listId)
          return {
            success: false,
            error: `${mapped} (se agregaron ${entryIds.length} antes del límite).`,
          }
        }
        return { success: false, error: mapped }
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
      const message = mapFreepassSubmitError(error, "No se pudo canjear el FreePass.")
      console.error("[FREEPASS_CLAIM_ERROR]", {
        entryId,
        code: error && typeof error === "object" && "code" in error ? error.code : null,
        message: error instanceof Error ? error.message : error,
      })
      return { success: false, error: message }
    }

    revalidatePath("/cuenta/entradas")
    return { success: true, data: { ticketId: String(ticketId) } }
  } catch (error) {
    console.error("[FREEPASS_CLAIM_ERROR]", error)
    return {
      success: false,
      error: mapFreepassSubmitError(error, "Error al canjear FreePass."),
    }
  }
}

function failFreepass(error: string): ActionFail {
  return { success: false, error }
}

function mapFreepassSubmitError(error: unknown, fallback: string): string {
  const record = error as {
    message?: unknown
    code?: unknown
    details?: unknown
    hint?: unknown
  } | null
  const raw =
    (typeof record?.message === "string" && record.message) ||
    (error instanceof Error ? error.message : "") ||
    ""
  const code = typeof record?.code === "string" ? record.code : ""
  const details = typeof record?.details === "string" ? record.details : ""
  const combined = `${raw} ${code} ${details}`.toLowerCase()

  if (combined.includes("email_required")) {
    return "El email es obligatorio y debe ser válido."
  }
  if (combined.includes("email_already_registered") || combined.includes("23505")) {
    return "Ese email ya confirmó asistencia en esta lista."
  }
  if (combined.includes("email_mismatch")) {
    return "Este FreePass está vinculado a otro email. Ingresá con la cuenta correcta."
  }
  if (combined.includes("rate_limited")) {
    return "Demasiados intentos. Probá más tarde."
  }
  if (combined.includes("lista completa") || combined.includes("no quedan cupos")) {
    return "Lista completa: no quedan cupos."
  }
  if (combined.includes("ya venció") || combined.includes("horario")) {
    return "El horario de esta lista ya venció."
  }
  if (combined.includes("lista no encontrada") || combined.includes("p0002")) {
    return "No encontramos esa lista. Pedí el enlace de nuevo al RRPP."
  }
  if (combined.includes("nombre inválido") || combined.includes("nombre es obligatorio")) {
    return "Ingresá tu nombre completo."
  }
  if (combined.includes("used_guests") || combined.includes("has no field")) {
    return "Error de cupo de lista (used_guests). Aplicá la migración p138 en Supabase."
  }
  if (combined.includes("forbidden") || combined.includes("42501")) {
    return "No se pudo registrar: el servidor no tiene permiso para emitir la lista."
  }
  if (combined.includes("could not find the function") || combined.includes("pgrst202")) {
    return "No se encontró la función de registro de listas. Aplicá la migración p138 en Supabase."
  }
  if (raw.trim()) {
    return code ? `${raw.trim()} (${code})` : raw.trim()
  }
  return fallback
}

export async function registerPublicGuest(input: {
  listId: string
  fullName: string
  email?: string
  phone?: string
  whatsapp?: string
  promoterId?: string | null
}): Promise<
  ActionResult<{ entryId: string; ticketId: string | null; remaining: number }>
> {
  try {
    const parsed = freepassRegisterSchema.safeParse({
      listId: input.listId,
      fullName: input.fullName,
      email: input.email ?? "",
      phone: input.phone ?? input.whatsapp ?? "",
      promoterId: input.promoterId,
    })
    if (!parsed.success) {
      return failFreepass(firstZodIssue(parsed.error))
    }

    const { listId, fullName, email, phone, promoterId } = parsed.data

    const rate = await assertGuestListRateLimit({
      listId,
      email,
    })
    if (!rate.ok) {
      return failFreepass(rate.error)
    }

    const admin = createAdminClient()
    const ipBucket = await getClientIpBucket("ip")
    const clientKey = ipBucket.replace(/^ip:/, "") || "unknown"

    const { data: entryId, error } = await admin.rpc(
      "register_guest_list_entry",
      {
        p_list_id: listId,
        p_full_name: fullName,
        p_email: email,
        p_phone: phone,
        p_client_key: clientKey,
      },
    )

    if (error || !entryId) {
      console.error("[FREEPASS_SUBMIT_ERROR]", {
        stage: "register_guest_list_entry",
        listId,
        code: error?.code ?? null,
        message: error?.message ?? null,
        details: error?.details ?? null,
        hint: error?.hint ?? null,
      })
      return failFreepass(
        mapFreepassSubmitError(error, "No se pudo registrar en la lista."),
      )
    }

    if (promoterId) {
      const { error: promoterError } = await admin
        .from("guest_lists")
        .update({ promoter_id: promoterId })
        .eq("id", listId)
        .is("promoter_id", null)
      if (promoterError) {
        console.error("[FREEPASS_SUBMIT_ERROR]", {
          stage: "promoter_id",
          listId,
          code: promoterError.code,
          message: promoterError.message,
        })
      }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const ownerId =
      user?.id && user.email?.trim().toLowerCase() === email ? user.id : null

    const { data: claimedTicketId, error: claimError } = await admin.rpc(
      "claim_guest_list_entry",
      {
        p_entry_id: String(entryId),
        p_owner_id: ownerId,
      },
    )

    if (claimError) {
      console.error("[FREEPASS_SUBMIT_ERROR]", {
        stage: "claim_guest_list_entry",
        listId,
        entryId,
        code: claimError.code,
        message: claimError.message,
        details: claimError.details,
        hint: claimError.hint,
      })
    }

    const ticketId = claimedTicketId ? String(claimedTicketId) : null

    const publicMeta = await getGuestListPublic(listId)

    await dispatchGuestPassNotification({
      fullName,
      email,
      phone,
      eventTitle: publicMeta?.eventTitle ?? "Evento TokePass",
      listName: publicMeta?.name ?? "Lista",
      claimUrl: ticketId ? undefined : `/lists/claim/${listId}?entry=${entryId}`,
    })

    try {
      revalidatePath(`/lists/claim/${listId}`)
    } catch (revalidateError) {
      console.error("[FREEPASS_SUBMIT_ERROR]", {
        stage: "revalidate",
        listId,
        error: revalidateError,
      })
    }

    return {
      success: true,
      data: {
        entryId: String(entryId),
        ticketId,
        remaining: publicMeta?.remaining ?? 0,
      },
    }
  } catch (error) {
    console.error("[FREEPASS_SUBMIT_ERROR]", error)
    return failFreepass(
      mapFreepassSubmitError(error, "Error al registrarte en la lista."),
    )
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
