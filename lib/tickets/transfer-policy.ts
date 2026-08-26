import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

export const TRANSFER_ONCE_LIMIT = 1
export const TRANSFER_WINDOW_HOURS = 24

export const TRANSFER_WINDOW_CLOSED_ERROR =
  "Las transferencias se cierran 24 horas antes del inicio de la jornada."

export const TRANSFER_ONCE_LIMIT_ERROR =
  "Esta entrada ya fue transferida y no se puede volver a enviar."

export type TransferPolicyBlock = {
  ok: false
  code: "transfer_limit" | "window_closed"
  error: string
}

export function evaluateTransferPolicy(input: {
  transferCount: number
  maxTransfersAllowed?: number | null
  eventStartsAt: Date | string | null
  now?: Date
}): { ok: true } | TransferPolicyBlock {
  const count = Number(input.transferCount ?? 0)
  const maxAllowed = input.maxTransfersAllowed
  if (
    count >= TRANSFER_ONCE_LIMIT ||
    (maxAllowed != null && (maxAllowed < 1 || count >= maxAllowed))
  ) {
    return {
      ok: false,
      code: "transfer_limit",
      error: TRANSFER_ONCE_LIMIT_ERROR,
    }
  }

  if (isTransferWindowClosed(input.eventStartsAt, input.now)) {
    return {
      ok: false,
      code: "window_closed",
      error: TRANSFER_WINDOW_CLOSED_ERROR,
    }
  }

  return { ok: true }
}

export function isTransferWindowClosed(
  eventStartsAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!eventStartsAt) return false
  const start = eventStartsAt instanceof Date ? eventStartsAt : new Date(eventStartsAt)
  if (Number.isNaN(start.getTime())) return false
  const opensUntil = start.getTime() - TRANSFER_WINDOW_HOURS * 60 * 60 * 1000
  return now.getTime() > opensUntil
}

export async function resolveTicketEventStartsAt(
  db: SupabaseClient<Database>,
  ticket: {
    seating_unit_id: string | null
    tier_id: string
    event_id: string
  },
): Promise<string | null> {
  if (ticket.seating_unit_id) {
    const { data: unit } = await db
      .from("event_seating_units")
      .select("event_date_id")
      .eq("id", ticket.seating_unit_id)
      .maybeSingle()
    const scheduleId = unit?.event_date_id
    if (scheduleId) {
      const start = await scheduleStartTime(db, scheduleId)
      if (start) return start
    }
  }

  const { data: tier } = await db
    .from("ticket_tiers")
    .select("day_id")
    .eq("id", ticket.tier_id)
    .maybeSingle()
  if (tier?.day_id) {
    const start = await scheduleStartTime(db, tier.day_id)
    if (start) return start
  }

  const { data: event } = await db
    .from("events")
    .select("date")
    .eq("id", ticket.event_id)
    .maybeSingle()
  return event?.date ?? null
}

async function scheduleStartTime(
  db: SupabaseClient<Database>,
  scheduleId: string,
): Promise<string | null> {
  const { data } = await db
    .from("event_schedules")
    .select("start_time")
    .eq("id", scheduleId)
    .maybeSingle()
  return data?.start_time ?? null
}
