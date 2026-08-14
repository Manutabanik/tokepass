"use server"

import { assertEventOpsAccess } from "@/lib/event-ops-access"
import type { LiveOpsSnapshot } from "@/lib/live-ops"
import { createClient } from "@/lib/supabase/server"

type LiveStatsRpc = {
  ok?: boolean
  event_id?: string
  event_title?: string
  event_date?: string | null
  capacity?: number
  sold?: number
  checked_in?: number
  remaining?: number
  rpm_5?: number
  rpm_15?: number
  recent_checkin_at?: string[]
  hour_buckets?: Array<{ hour: string; count: number }>
  recent_access?: Array<{
    ticket_id: string
    holder_name: string
    tier_name: string
    at: string
  }>
  tier_breakdown?: Array<{
    tier_id: string
    name: string
    sold: number
    checked_in: number
  }>
  sector_breakdown?: Array<{
    sector_key: string
    sector_name: string
    sold: number
    checked_in: number
  }>
  tier_names?: Record<string, string>
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
  const { data, error } = await supabase.rpc("get_live_dashboard_stats", {
    p_event_id: eventId,
  })

  if (error || !data) {
    return { ok: false, error: "No se pudieron cargar las métricas en vivo." }
  }

  const payload = data as LiveStatsRpc
  if (payload.ok === false) {
    return { ok: false, error: "Evento no encontrado." }
  }

  const sold = Number(payload.sold) || 0
  const checkedIn = Number(payload.checked_in) || 0

  return {
    ok: true,
    data: {
      eventId: payload.event_id ?? eventId,
      eventTitle: payload.event_title ?? "Evento",
      eventDate: payload.event_date ?? null,
      capacity: Number(payload.capacity) || sold,
      sold,
      checkedIn,
      remaining: Number(payload.remaining) || Math.max(0, sold - checkedIn),
      rpm5: Number(payload.rpm_5) || 0,
      rpm15: Number(payload.rpm_15) || 0,
      recentCheckInAt: Array.isArray(payload.recent_checkin_at)
        ? payload.recent_checkin_at.filter(Boolean)
        : [],
      hourBuckets: (payload.hour_buckets ?? []).map((bucket) => ({
        startIso: bucket.hour,
        count: Number(bucket.count) || 0,
      })),
      recentAccess: (payload.recent_access ?? []).map((row) => ({
        ticketId: row.ticket_id,
        holderName: row.holder_name,
        tierName: row.tier_name,
        at: row.at,
      })),
      tierBreakdown: (payload.tier_breakdown ?? []).map((row) => ({
        tierId: row.tier_id,
        name: row.name,
        sold: Number(row.sold) || 0,
        checkedIn: Number(row.checked_in) || 0,
      })),
      sectorBreakdown: (payload.sector_breakdown ?? []).map((row) => ({
        sectorKey: row.sector_key,
        sectorName: row.sector_name,
        sold: Number(row.sold) || 0,
        checkedIn: Number(row.checked_in) || 0,
      })),
      tierNamesById: payload.tier_names ?? {},
    },
  }
}
