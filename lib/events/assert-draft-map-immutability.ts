import "server-only"

import {
  ACTIVE_SALE_LAYOUT_DELETE_ERROR,
  collectDraftLayoutItemKeys,
  isActiveSeatingHold,
  missingProtectedLayoutItems,
  type ProtectedLayoutItem,
} from "@/lib/events/draft-map-immutability-v2"
import { formatSupabaseError } from "@/lib/errors/supabase-error"
import { createAdminClient } from "@/lib/supabase/admin"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

const ACTIVE_TICKET_STATUSES = [
  "valid",
  "pending_payment",
  "used",
  "transferred",
  "scanned",
] as const

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export async function assertDraftMapLayoutImmutable(input: {
  eventId: string
  draft: Pick<EventDraftV2, "seatingMaps" | "seatingMap" | "schedule">
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const incomingKeys = collectDraftLayoutItemKeys(input.draft)
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  const protectedItems: ProtectedLayoutItem[] = []

  const [soldUnits, reservedUnits, heldUnits, soldTiers, activeTickets] =
    await Promise.all([
      admin
        .from("event_seating_units")
        .select("layout_item_id, sector_id, event_date_id, status, sold_order_id")
        .eq("event_id", input.eventId)
        .in("status", ["sold", "reserved"]),
      admin
        .from("event_seating_units")
        .select("layout_item_id, sector_id, event_date_id, status, sold_order_id")
        .eq("event_id", input.eventId)
        .not("sold_order_id", "is", null),
      admin
        .from("event_seating_units")
        .select(
          "layout_item_id, sector_id, event_date_id, status, sold_order_id, reserved_until",
        )
        .eq("event_id", input.eventId)
        .gt("reserved_until", nowIso),
      admin
        .from("ticket_tiers")
        .select("seating_sector_id, day_id, sold")
        .eq("event_id", input.eventId)
        .gt("sold", 0),
      admin
        .from("tickets")
        .select(
          "id, status, event_seating_units(layout_item_id, sector_id, event_date_id)",
        )
        .eq("event_id", input.eventId)
        .in("status", [...ACTIVE_TICKET_STATUSES])
        .not("seating_unit_id", "is", null)
        .limit(4000),
    ])

  const queryError =
    soldUnits.error ??
    reservedUnits.error ??
    heldUnits.error ??
    soldTiers.error ??
    activeTickets.error
  if (queryError) {
    return { ok: false, error: formatSupabaseError(queryError) }
  }

  const pushUnit = (row: {
    layout_item_id?: string | null
    sector_id?: string | null
    event_date_id?: string | null
    status?: string | null
    sold_order_id?: string | null
    reserved_until?: string | null
  }) => {
    if (
      !isActiveSeatingHold({
        status: row.status,
        soldOrderId: row.sold_order_id,
        reservedUntil: row.reserved_until,
      })
    ) {
      return
    }
    const dateId = row.event_date_id ?? null
    if (row.layout_item_id?.trim()) {
      protectedItems.push({ itemId: row.layout_item_id, dateId })
    }
    if (row.sector_id?.trim()) {
      protectedItems.push({ itemId: row.sector_id, dateId })
    }
  }

  for (const row of soldUnits.data ?? []) pushUnit(row)
  for (const row of reservedUnits.data ?? []) pushUnit(row)
  for (const row of heldUnits.data ?? []) pushUnit(row)

  for (const tier of soldTiers.data ?? []) {
    const sectorId = tier.seating_sector_id?.trim()
    if (!sectorId) continue
    protectedItems.push({
      itemId: sectorId,
      dateId: tier.day_id ?? null,
    })
  }

  for (const ticket of activeTickets.data ?? []) {
    const unit = one(
      ticket.event_seating_units as
        | {
            layout_item_id?: string | null
            sector_id?: string | null
            event_date_id?: string | null
          }
        | Array<{
            layout_item_id?: string | null
            sector_id?: string | null
            event_date_id?: string | null
          }>
        | null,
    )
    if (!unit) continue
    const dateId = unit.event_date_id ?? null
    if (unit.layout_item_id?.trim()) {
      protectedItems.push({ itemId: unit.layout_item_id, dateId })
    }
    if (unit.sector_id?.trim()) {
      protectedItems.push({ itemId: unit.sector_id, dateId })
    }
  }

  if (missingProtectedLayoutItems(incomingKeys, protectedItems).length > 0) {
    return { ok: false, error: ACTIVE_SALE_LAYOUT_DELETE_ERROR }
  }
  return { ok: true }
}
