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

export type OperableEventTier = {
  id: string
  name: string
  price: number
  capacity: number
  sold: number
  admit_count?: number
  seating_sector_id?: string | null
  ticket_type?: string | null
  tier_type?: string | null
  category?: string | null
}

export type OperableEventRow = {
  id: string
  title: string
  date: string
  location: string | null
  status: string
  qr_type: string | null
  ticket_tiers?: OperableEventTier[] | null
}

const OPERABLE_TIER_SELECTS = [
  "id, name, price, capacity, sold, admit_count, seating_sector_id, ticket_type, tier_type, category",
  "id, name, price, capacity, sold, admit_count, seating_sector_id, tier_type, category",
  "id, name, price, capacity, sold, admit_count, seating_sector_id",
] as const

function operableEventsSelect(tierSelect: string) {
  return `id, title, date, location, status, qr_type, ticket_tiers(${tierSelect})`
}

function isMissingOperableTierColumn(message: string) {
  return /ticket_type|tier_type|category|schema cache|PGRST204|42703/i.test(
    message,
  )
}

async function queryOperableEvents(
  run: (select: string) => PromiseLike<{
    data: unknown
    error: { message: string } | null
  }>,
): Promise<OperableEventRow[]> {
  let lastError: { message: string } | null = null
  for (const tierSelect of OPERABLE_TIER_SELECTS) {
    const { data, error } = await run(operableEventsSelect(tierSelect))
    if (!error) return (data ?? []) as OperableEventRow[]
    lastError = error
    if (!isMissingOperableTierColumn(error.message)) {
      throw new Error(error.message)
    }
  }
  throw new Error(lastError?.message ?? "No se pudieron leer los eventos.")
}

export async function listOperableEvents(input: {
  roles: EventStaffRole[]
}): Promise<OperableEventRow[]> {
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

  if (profile?.role === "admin" || profile?.role === "super_admin") {
    return queryOperableEvents((selectCols) => {
      let query = supabase
        .from("events")
        .select(selectCols)
        .in("status", ["published", "draft"])
        .order("date", { ascending: true })
      if (profile.role === "admin") {
        query = query.eq("organizer_id", user.id)
      }
      return query
    })
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

  return queryOperableEvents((selectCols) =>
    supabase
      .from("events")
      .select(selectCols)
      .in("id", eventIds)
      .in("status", ["published", "draft"])
      .order("date", { ascending: true }),
  )
}
