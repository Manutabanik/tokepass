"use server"

import { revalidatePath } from "next/cache"

import { consumeRateLimit } from "@/lib/rate-limit"
import { getRequestIp } from "@/lib/request-ip"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { EventStaffRole } from "@/types/auth"
import { EVENT_STAFF_ROLES } from "@/types/auth"

export type StaffAssignmentRow = {
  id: string
  eventId: string
  eventTitle: string
  userId: string
  userEmail: string
  userName: string | null
  role: EventStaffRole
  createdAt: string
  isActive: boolean
  expiresAt: string | null
  hasPosSecurityPin: boolean
}

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

async function requireOrganizer() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error("auth_required")

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

  return { supabase, userId: user.id, role: profile.role as string }
}

async function assertOwnsEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  role: string,
  eventId: string,
) {
  if (role === "super_admin") return
  const { data } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("organizer_id", userId)
    .maybeSingle()
  if (!data) throw new Error("forbidden")
}

export async function getMyStaffRoles(): Promise<EventStaffRole[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from("event_staff_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)

  return [...new Set((data ?? []).map((row) => row.role as EventStaffRole))]
}

export async function userHasStaffAssignment(): Promise<boolean> {
  const roles = await getMyStaffRoles()
  return roles.length > 0
}

export async function listStaffAssignmentsForOrganizer(): Promise<
  StaffAssignmentRow[]
> {
  const { supabase, userId, role } = await requireOrganizer()

  let eventQuery = supabase.from("events").select("id, title")
  if (role !== "super_admin") {
    eventQuery = eventQuery.eq("organizer_id", userId)
  }
  const { data: events, error: eventsError } = await eventQuery
  if (eventsError) throw new Error(eventsError.message)

  const eventIds = (events ?? []).map((event) => event.id)
  if (eventIds.length === 0) return []

  const eventTitle = new Map(
    (events ?? []).map((event) => [event.id, event.title]),
  )

  const { data: assignments, error } = await supabase
    .from("event_staff_assignments")
    .select(
      "id, event_id, user_id, role, created_at, is_active, expires_at, pos_security_pin_hash",
    )
    .in("event_id", eventIds)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  const query = error
    ? await supabase
        .from("event_staff_assignments")
        .select("id, event_id, user_id, role, created_at, is_active, expires_at")
        .in("event_id", eventIds)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
    : { data: assignments, error }

  if (query.error) throw new Error(query.error.message)
  const rows = query.data

  const userIds = [...new Set((rows ?? []).map((row) => row.user_id))]
  const profileMap = new Map<
    string,
    { email: string; full_name: string | null }
  >()

  if (userIds.length > 0) {
    // Organizer RLS may not see all profiles — use service role for email labels only.
    const admin = createAdminClient()
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds)

    for (const profile of profiles ?? []) {
      profileMap.set(profile.id, {
        email: profile.email,
        full_name: profile.full_name,
      })
    }
  }

  return (rows ?? []).map((row) => {
    const profile = profileMap.get(row.user_id)
    const hash = (row as { pos_security_pin_hash?: string | null })
      .pos_security_pin_hash
    return {
      id: row.id,
      eventId: row.event_id,
      eventTitle: eventTitle.get(row.event_id) ?? "Evento",
      userId: row.user_id,
      userEmail: profile?.email ?? "—",
      userName: profile?.full_name ?? null,
      role: row.role as EventStaffRole,
      createdAt: row.created_at,
      isActive: Boolean(row.is_active),
      expiresAt: row.expires_at ?? null,
      hasPosSecurityPin: Boolean(hash && hash.trim()),
    }
  })
}

export async function setCashierPosSecurityPin(input: {
  assignmentId: string
  pin: string
}): Promise<ActionResult> {
  try {
    const pin = input.pin.trim()
    if (!/^\d{4}$/.test(pin)) {
      return { success: false, error: "El PIN de caja debe tener 4 digitos." }
    }

    const { supabase } = await requireOrganizer()
    const { error } = await supabase.rpc("set_pos_cashier_pin", {
      p_assignment_id: input.assignmentId,
      p_pin: pin,
    })

    if (error) {
      const lower = error.message.toLowerCase()
      if (lower.includes("forbidden")) {
        return { success: false, error: "Solo el organizador puede asignar el PIN." }
      }
      if (lower.includes("pin_invalid") || lower.includes("22023")) {
        return { success: false, error: "El PIN de caja debe tener 4 digitos." }
      }
      return { success: false, error: error.message }
    }

    revalidatePath("/admin/team")
    revalidatePath("/admin/settings/users")
    revalidatePath("/admin/pos")
    return { success: true, data: undefined }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "No se pudo guardar el PIN.",
    }
  }
}

export async function assignEventStaff(input: {
  eventId: string
  email: string
  role: EventStaffRole
}): Promise<ActionResult> {
  try {
    if (!EVENT_STAFF_ROLES.includes(input.role)) {
      return { success: false, error: "Rol de staff inválido." }
    }

    const email = input.email.trim().toLowerCase()
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { success: false, error: "Escribí un correo válido (ej: nombre@gmail.com)" }
    }

    const { supabase, userId, role } = await requireOrganizer()
    await assertOwnsEvent(supabase, userId, role, input.eventId)

    // Lookup by email via service_role — profiles RLS blocks cross-user reads.
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from("profiles")
      .select("id, role")
      .ilike("email", email)
      .maybeSingle()

    if (!profile) {
      return {
        success: false,
        error:
          "No hay usuario TokePass con ese email. Pedile que se registre primero.",
      }
    }

    if (profile.id === userId) {
      return {
        success: false,
        error: "No podés asignarte a vos mismo como staff delegado.",
      }
    }

    if (profile.role === "super_admin") {
      return {
        success: false,
        error: "No se puede reasignar un super admin como staff de evento.",
      }
    }

    const { error } = await supabase.from("event_staff_assignments").insert({
      event_id: input.eventId,
      user_id: profile.id,
      role: input.role,
      created_by: userId,
      is_active: true,
      expires_at: null,
    })

    if (error) {
      if (error.code === "23505") {
        return {
          success: false,
          error: "Ese usuario ya tiene ese rol en el evento.",
        }
      }
      return { success: false, error: error.message }
    }

    revalidatePath("/admin/team")
    revalidatePath("/admin/scanner")
    revalidatePath("/admin/pos")
    revalidatePath("/admin/bar-scanner")
    revalidatePath("/admin/store-scanner")
    return { success: true, data: undefined }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo asignar staff.",
    }
  }
}

export async function revokeEventStaff(
  assignmentId: string,
): Promise<ActionResult> {
  try {
    const { supabase, userId, role } = await requireOrganizer()

    const { data: row } = await supabase
      .from("event_staff_assignments")
      .select("id, event_id")
      .eq("id", assignmentId)
      .maybeSingle()

    if (!row) return { success: false, error: "Asignación no encontrada." }

    await assertOwnsEvent(supabase, userId, role, row.event_id)

    const { error } = await supabase
      .from("event_staff_assignments")
      .update({ is_active: false })
      .eq("id", assignmentId)

    if (error) return { success: false, error: error.message }

    revalidatePath("/admin/team")
    return { success: true, data: undefined }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "No se pudo revocar el staff.",
    }
  }
}

export async function getClientIpBucket(prefix: string): Promise<string> {
  const ip = await getRequestIp()
  return `${prefix}:${ip}`
}

export async function assertGuestListRateLimit(input: {
  listId: string
  email?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ipBucket = await getClientIpBucket(`guestlist:ip:${input.listId}`)
  const ipAllowed = await consumeRateLimit({
    bucketKey: ipBucket,
    limit: 8,
    windowSeconds: 60 * 15,
    useAdmin: true,
  })
  if (!ipAllowed) {
    return {
      ok: false,
      error: "Demasiados intentos desde esta red. Probá más tarde.",
    }
  }

  const email = input.email?.trim().toLowerCase()
  if (email) {
    const emailAllowed = await consumeRateLimit({
      bucketKey: `guestlist:email:${email}`,
      limit: 5,
      windowSeconds: 60 * 60,
      useAdmin: true,
    })
    if (!emailAllowed) {
      return {
        ok: false,
        error: "Demasiados intentos con este email. Probá más tarde.",
      }
    }
  }

  return { ok: true }
}
