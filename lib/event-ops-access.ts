"use server"

import { createClient } from "@/lib/supabase/server"
import type { EventStaffRole } from "@/types/auth"

export async function assertEventOpsAccess(
  eventId: string,
  allowedRoles: EventStaffRole[],
): Promise<
  | { ok: true; userId: string; isOrganizer: boolean }
  | { ok: false; reason: "auth_required" | "forbidden" }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, reason: "auth_required" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role === "super_admin") {
    return { ok: true, userId: user.id, isOrganizer: true }
  }

  const { data: event } = await supabase
    .from("events")
    .select("organizer_id")
    .eq("id", eventId)
    .maybeSingle()

  if (!event) return { ok: false, reason: "forbidden" }

  if (event.organizer_id === user.id) {
    return { ok: true, userId: user.id, isOrganizer: true }
  }

  const { data: eligible } = await supabase.rpc(
    "user_is_event_organizer_or_staff",
    {
      p_event_id: eventId,
      p_user_id: user.id,
      p_roles: allowedRoles,
    },
  )

  if (!eligible) return { ok: false, reason: "forbidden" }

  return { ok: true, userId: user.id, isOrganizer: false }
}

export async function listOperableEvents(input: {
  roles: EventStaffRole[]
}): Promise<
  Array<{
    id: string
    title: string
    date: string
    status: string
    qr_type: string | null
    ticket_tiers?: Array<{
      id: string
      name: string
      price: number
      capacity: number
      sold: number
      admit_count?: number
    }> | null
  }>
> {
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

  const selectCols =
    "id, title, date, status, qr_type, ticket_tiers(id, name, price, capacity, sold, admit_count)"

  if (profile?.role === "admin" || profile?.role === "super_admin") {
    let query = supabase
      .from("events")
      .select(selectCols)
      .in("status", ["published", "draft"])
      .order("date", { ascending: true })

    if (profile.role === "admin") {
      query = query.eq("organizer_id", user.id)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data ?? []) as never
  }

  const { data: assignments, error: assignError } = await supabase
    .from("event_staff_assignments")
    .select("event_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .in("role", input.roles)

  if (assignError) throw new Error(assignError.message)

  const eventIds = [
    ...new Set((assignments ?? []).map((row) => row.event_id)),
  ]
  if (eventIds.length === 0) return []

  const { data, error } = await supabase
    .from("events")
    .select(selectCols)
    .in("id", eventIds)
    .in("status", ["published", "draft"])
    .order("date", { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as never
}
