"use server"

import { assertEventOpsAccess } from "@/lib/event-ops-access"
import { createClient } from "@/lib/supabase/server"

export type LiveOpsAccessEntry = {
  ticketId: string
  holderName: string
  tierName: string
  at: string
}

export type LiveOpsSnapshot = {
  eventId: string
  eventTitle: string
  sold: number
  checkedIn: number
  remaining: number
  recentAccess: LiveOpsAccessEntry[]
  tierNamesById: Record<string, string>
  checkedInTicketIds: string[]
}

const SOLD_STATUSES = ["valid", "used", "scanned"] as const

function isCheckedIn(row: {
  status: string
  admissions_used: number
  scanned_at: string | null
}): boolean {
  return (
    row.status === "used" ||
    row.status === "scanned" ||
    row.admissions_used > 0 ||
    Boolean(row.scanned_at)
  )
}

function accessAt(row: {
  validated_at: string | null
  scanned_at: string | null
  updated_at: string
}): string {
  return row.validated_at ?? row.scanned_at ?? row.updated_at
}

export async function getLiveOpsSnapshot(
  eventId: string,
): Promise<
  | { ok: true; data: LiveOpsSnapshot }
  | { ok: false; error: string }
> {
  const access = await assertEventOpsAccess(eventId, ["door_staff"])
  if (!access.ok) {
    return {
      ok: false,
      error:
        access.reason === "auth_required"
          ? "Iniciá sesión para ver el monitor."
          : "No tenés permiso para este evento.",
    }
  }

  const supabase = await createClient()

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, title")
    .eq("id", eventId)
    .maybeSingle()

  if (eventError || !event) {
    return { ok: false, error: "Evento no encontrado." }
  }

  const [{ data: tiers }, { data: tickets, error: ticketsError }] =
    await Promise.all([
      supabase.from("ticket_tiers").select("id, name").eq("event_id", eventId),
      supabase
        .from("tickets")
        .select(
          "id, status, admissions_used, scanned_at, validated_at, updated_at, holder_name, tier_id, is_test",
        )
        .eq("event_id", eventId)
        .eq("is_test", false)
        .in("status", [...SOLD_STATUSES]),
    ])

  if (ticketsError) {
    return { ok: false, error: "No se pudieron cargar las entradas." }
  }

  const tierNamesById: Record<string, string> = {}
  for (const tier of tiers ?? []) {
    tierNamesById[tier.id] = tier.name
  }

  const rows = tickets ?? []
  const sold = rows.length
  const checkedInRows = rows.filter(isCheckedIn)
  const checkedIn = checkedInRows.length
  const remaining = Math.max(0, sold - checkedIn)

  const recentAccess: LiveOpsAccessEntry[] = [...checkedInRows]
    .sort(
      (a, b) =>
        new Date(accessAt(b)).getTime() - new Date(accessAt(a)).getTime(),
    )
    .slice(0, 10)
    .map((row) => ({
      ticketId: row.id,
      holderName: (row.holder_name ?? "").trim() || "Titular sin nombre",
      tierName: tierNamesById[row.tier_id] ?? "General",
      at: accessAt(row),
    }))

  return {
    ok: true,
    data: {
      eventId: event.id,
      eventTitle: event.title,
      sold,
      checkedIn,
      remaining,
      recentAccess,
      tierNamesById,
      checkedInTicketIds: checkedInRows.map((r) => r.id),
    },
  }
}
