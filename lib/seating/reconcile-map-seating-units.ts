import type { SupabaseClient } from "@supabase/supabase-js"

import { resolveSeatingUnitTierId } from "@/lib/seating/sold-unit-tier"
import { venueMapToSeatingLayout } from "@/lib/seating/venue-map-geometry"
import type { Database } from "@/types/database"
import {
  isSellableElement,
  type InteractiveVenueMap,
} from "@/types/venue-map"

export type MapSeatingUnitDraft = {
  layoutItemId: string
  sectorId: string
  sectorName: string
  label: string
  rowId: string | null
  rowNumber: number | null
  rowLabel: string | null
  color: string
  layoutType: "table_combo" | "numbered_seat"
  capacityPerUnit: number
  ticketTypeId?: string
}

export type MapBackedTierRef = {
  id: string
  seatingSectorId?: string | null
  layoutType?: string | null
  visibility?: string | null
  ticketType?: string | null
  dayId?: string | null
}

function ticketTypeForLayoutItem(
  map: InteractiveVenueMap,
  layoutItemId: string,
): string | undefined {
  for (const element of map.elements ?? []) {
    if (element.id === layoutItemId) {
      return element.ticketTypeId?.trim() || undefined
    }
    for (const seat of element.seats ?? []) {
      if (seat.id === layoutItemId) {
        return seat.ticketTypeId?.trim() || element.ticketTypeId?.trim() || undefined
      }
    }
  }
  return undefined
}

export function seatingLayoutUnitDrafts(
  map: InteractiveVenueMap,
): MapSeatingUnitDraft[] {
  const drafts: MapSeatingUnitDraft[] = []
  const seen = new Set<string>()
  for (const sector of venueMapToSeatingLayout(map)) {
    if (sector.layout_type !== "table_combo" && sector.layout_type !== "numbered_seat") {
      continue
    }
    const layoutType = sector.layout_type
    for (const row of sector.rows ?? []) {
      for (const item of row.items ?? []) {
        const layoutItemId = item.id?.trim()
        if (!layoutItemId || seen.has(layoutItemId)) continue
        if (item.status === "blocked") continue
        const capacity = Math.max(
          1,
          Math.floor(Number(item.capacity) || Number(sector.capacity_per_unit) || 1),
        )
        if (capacity <= 0) continue
        seen.add(layoutItemId)
        drafts.push({
          layoutItemId,
          sectorId: sector.id,
          sectorName: sector.sector_name,
          label: item.label?.trim() || layoutItemId,
          rowId: row.row_id?.trim() || null,
          rowNumber: row.row_number ?? null,
          rowLabel: row.row_label?.trim() || null,
          color: sector.color || "#10B981",
          layoutType,
          capacityPerUnit: capacity,
          ticketTypeId: ticketTypeForLayoutItem(map, layoutItemId),
        })
      }
    }
  }
  return drafts
}

export function resolveMapUnitTierId(
  draft: MapSeatingUnitDraft,
  tiers: readonly MapBackedTierRef[],
): string | null {
  const explicit = draft.ticketTypeId?.trim()
  if (explicit && tiers.some((tier) => tier.id === explicit)) return explicit

  const sector = draft.sectorId.trim()
  const bySector = tiers.find(
    (tier) => (tier.seatingSectorId ?? "").trim() === sector,
  )
  if (bySector) return bySector.id

  const seated = tiers.find(
    (tier) =>
      tier.ticketType !== "extra" &&
      (tier.layoutType === "table_combo" || tier.layoutType === "numbered_seat"),
  )
  if (seated) return seated.id

  const publicAdmission = tiers.find(
    (tier) =>
      (tier.visibility ?? "public") === "public" && tier.ticketType !== "extra",
  )
  return publicAdmission?.id ?? tiers[0]?.id ?? null
}

export function reservedFurnitureLayoutType(
  map: InteractiveVenueMap,
  zoneId: string,
): "table_combo" | "numbered_seat" | null {
  const id = zoneId.trim()
  if (!id) return null
  const furniture = (map.elements ?? []).filter(
    (element) =>
      isSellableElement(element) &&
      element.type !== "standing_zone" &&
      (element.zoneId === id || element.groupId === id),
  )
  if (furniture.length === 0) return null
  return furniture.every((element) => element.sellMode === "group")
    ? "table_combo"
    : "numbered_seat"
}

type ExistingUnitRow = {
  id: string
  layout_item_id: string
  sector_id: string
  event_date_id: string | null
  status: string
  tier_id: string
}

export async function reconcileMapSeatingUnitsAfterSave(
  client: SupabaseClient<Database>,
  eventId: string,
  map: InteractiveVenueMap,
  input: {
    venueId?: string | null
    scheduleDayIds?: string[]
  } = {},
): Promise<string | null> {
  const drafts = seatingLayoutUnitDrafts(map)
  if (drafts.length === 0) return null

  const [{ data: tiers, error: tiersError }, { data: units, error: unitsError }] =
    await Promise.all([
      client
        .from("ticket_tiers")
        .select("id, seating_sector_id, layout_type, visibility, ticket_type, day_id")
        .eq("event_id", eventId),
      client
        .from("event_seating_units")
        .select("id, layout_item_id, sector_id, event_date_id, status, tier_id")
        .eq("event_id", eventId)
        .limit(20000),
    ])
  if (tiersError) return tiersError.message
  if (unitsError) return unitsError.message

  const tierRefs: MapBackedTierRef[] = (tiers ?? []).map((tier) => ({
    id: tier.id,
    seatingSectorId: tier.seating_sector_id,
    layoutType: tier.layout_type,
    visibility: tier.visibility,
    ticketType: tier.ticket_type,
    dayId: tier.day_id,
  }))
  if (tierRefs.length === 0) return null

  const dayIds = (input.scheduleDayIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean)
  const dateKeys = dayIds.length >= 2 ? dayIds : [dayIds[0] ?? null]

  const existing = new Map<string, ExistingUnitRow>()
  for (const row of (units ?? []) as ExistingUnitRow[]) {
    existing.set(
      `${row.layout_item_id}::${row.sector_id}::${row.event_date_id ?? ""}`,
      row,
    )
  }

  const inserts: Array<Record<string, unknown>> = []
  for (const dateId of dateKeys) {
    const dayTiers = dateId
      ? tierRefs.filter((tier) => !tier.dayId || tier.dayId === dateId)
      : tierRefs
    for (const draft of drafts) {
      const incomingTierId = resolveMapUnitTierId(draft, dayTiers.length > 0 ? dayTiers : tierRefs)
      if (!incomingTierId) continue
      const key = `${draft.layoutItemId}::${draft.sectorId}::${dateId ?? ""}`
      const current = existing.get(key)
      if (current) {
        const nextTier = resolveSeatingUnitTierId({
          status: current.status,
          existingTierId: current.tier_id,
          incomingTierId,
        })
        if (nextTier === current.tier_id && current.status !== "blocked") continue
        if (current.status === "sold" || current.status === "reserved") continue
        const { error } = await client
          .from("event_seating_units")
          .update({
            tier_id: nextTier,
            sector_name: draft.sectorName,
            label: draft.label,
            row_id: draft.rowId,
            row_number: draft.rowNumber,
            row_label: draft.rowLabel,
            color: draft.color,
            layout_type: draft.layoutType,
            capacity_per_unit: draft.capacityPerUnit,
            status: "available",
          } as never)
          .eq("id", current.id)
        if (error) return error.message
        continue
      }
      inserts.push({
        event_id: eventId,
        venue_id: input.venueId ?? null,
        tier_id: incomingTierId,
        event_date_id: dateId,
        sector_id: draft.sectorId,
        sector_name: draft.sectorName,
        layout_item_id: draft.layoutItemId,
        label: draft.label,
        row_id: draft.rowId,
        row_number: draft.rowNumber,
        row_label: draft.rowLabel,
        color: draft.color,
        layout_type: draft.layoutType,
        capacity_per_unit: draft.capacityPerUnit,
        status: "available",
      })
    }
  }

  const chunkSize = 100
  for (let index = 0; index < inserts.length; index += chunkSize) {
    const chunk = inserts.slice(index, index + chunkSize)
    const { error } = await client.from("event_seating_units").insert(chunk as never)
    if (error) return error.message
  }
  return null
}
