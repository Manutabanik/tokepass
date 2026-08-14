"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { ZoneTierPriceDraft } from "@/lib/stores/event-form-store"
import {
  draftEventSchema,
  type EventFormValues,
} from "@/lib/validations/event-form"
import {
  createCompleteEvent,
  updateCompleteEvent,
} from "@/app/actions/events"

export type AutosaveEventDraftResult =
  | { ok: true; eventId: string; mode: "created" | "updated" | "skipped" }
  | { ok: false; error: string }

function hasMinimumDraftContent(values: EventFormValues): boolean {
  return values.basics.title.trim().length >= 3
}

function sanitizeAutosaveValues(values: EventFormValues): EventFormValues {
  return {
    ...values,
    venue: {
      ...values.venue,
      existingVenueId: values.venue.existingVenueId || null,
    },
    tickets: (values.tickets ?? []).map((tier) => ({
      ...tier,
      price: Number.isFinite(Number(tier.price)) ? Number(tier.price) : 0,
    })),
  }
}

/**
 * Autoguarda borrador con esquema relajado. No exige descripción, precio
 * ni venue completo. Los fallos de validación se omiten en silencio.
 */
export async function autosaveEventDraft(input: {
  eventId: string | null
  values: EventFormValues
  zoneTierPricing?: ZoneTierPriceDraft[]
  targetOrganizerId?: string | null
}): Promise<AutosaveEventDraftResult> {
  const values = sanitizeAutosaveValues(input.values)
  if (!hasMinimumDraftContent(values)) {
    return { ok: true, eventId: input.eventId ?? "", mode: "skipped" }
  }

  const parsed = draftEventSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: true, eventId: input.eventId ?? "", mode: "skipped" }
  }

  const formData = new FormData()
  formData.set("payload", JSON.stringify(values))
  formData.set("draftMode", "1")
  if (input.targetOrganizerId) {
    formData.set("targetOrganizerId", input.targetOrganizerId)
  }

  let eventId = input.eventId

  if (eventId) {
    formData.set("eventId", eventId)
    const result = await updateCompleteEvent(formData)
    if (!result.success) {
      return { ok: false, error: result.error }
    }
    eventId = result.eventId
  } else {
    const result = await createCompleteEvent(formData)
    if (!result.success) {
      return { ok: false, error: result.error }
    }
    eventId = result.eventId
  }

  if (input.zoneTierPricing && input.zoneTierPricing.length > 0) {
    await syncZoneTierPricing({
      eventId,
      rows: input.zoneTierPricing,
    })
  }

  return {
    ok: true,
    eventId,
    mode: input.eventId ? "updated" : "created",
  }
}

export type ZoneTierPricingRow = {
  id: string
  eventId: string
  zoneId: string | null
  sectorKey: string
  ticketTierId: string
  price: number
  tableNumberStart: number | null
  tableNumberEnd: number | null
}

function rangeLo(start: number | null): number {
  return start ?? 1
}

function rangeHi(end: number | null): number {
  return end ?? Number.MAX_SAFE_INTEGER
}

function findOverlappingZoneTierRanges(
  rows: Array<{
    sector_key: string
    ticket_tier_id: string
    table_number_start: number | null
    table_number_end: number | null
  }>,
): string | null {
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i]
      const b = rows[j]
      if (
        a.sector_key !== b.sector_key ||
        a.ticket_tier_id !== b.ticket_tier_id
      ) {
        continue
      }
      const aLo = rangeLo(a.table_number_start)
      const aHi = rangeHi(a.table_number_end)
      const bLo = rangeLo(b.table_number_start)
      const bHi = rangeHi(b.table_number_end)
      if (aLo <= bHi && bLo <= aHi) {
        return "Los rangos de mesa se superponen para el mismo sector y tipo de entrada."
      }
    }
  }
  return null
}

export async function getZoneTierPricing(
  eventId: string,
): Promise<ZoneTierPricingRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("zone_tier_pricing")
    .select(
      "id, event_id, zone_id, sector_key, ticket_tier_id, price, table_number_start, table_number_end",
    )
    .eq("event_id", eventId)
    .order("sector_key")

  if (error || !data) return []

  return data.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    zoneId: row.zone_id,
    sectorKey: row.sector_key,
    ticketTierId: row.ticket_tier_id,
    price: Number(row.price),
    tableNumberStart: row.table_number_start,
    tableNumberEnd: row.table_number_end,
  }))
}

export async function syncZoneTierPricing(input: {
  eventId: string
  rows: ZoneTierPriceDraft[]
}): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Sesión requerida." }

  const { data: event } = await supabase
    .from("events")
    .select("id, organizer_id")
    .eq("id", input.eventId)
    .maybeSingle()

  if (!event) return { success: false, error: "Evento no encontrado." }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (
    event.organizer_id !== user.id &&
    profile?.role !== "super_admin"
  ) {
    return { success: false, error: "Sin permiso." }
  }

  const admin = createAdminClient()

  const { data: zones } = await supabase
    .from("event_zones")
    .select("id, name")
    .eq("event_id", input.eventId)

  const zoneByName = new Map(
    (zones ?? []).map((z) => [z.name.trim().toLocaleLowerCase("es"), z.id]),
  )

  const { data: tiers } = await supabase
    .from("ticket_tiers")
    .select("id, name, seating_sector_id")
    .eq("event_id", input.eventId)

  const validTier = new Set((tiers ?? []).map((t) => t.id))
  const tierIdByName = new Map(
    (tiers ?? []).map((t) => [
      String(t.name).trim().toLocaleLowerCase("es"),
      t.id,
    ]),
  )

  const payload = input.rows
    .map((row) => {
      const resolvedTierId = validTier.has(row.ticketTierId)
        ? row.ticketTierId
        : tierIdByName.get(row.ticketTierName.trim().toLocaleLowerCase("es"))
      if (!row.sectorKey || !resolvedTierId) return null
      const zoneId =
        zoneByName.get(row.sectorName.trim().toLocaleLowerCase("es")) ?? null
      return {
        event_id: input.eventId,
        zone_id: zoneId,
        sector_key: row.sectorKey,
        ticket_tier_id: resolvedTierId,
        price: Math.max(0, Number(row.price) || 0),
        table_number_start: row.tableNumberStart,
        table_number_end: row.tableNumberEnd,
        updated_at: new Date().toISOString(),
      }
    })
    .filter((row): row is NonNullable<typeof row> => row != null)

  const overlapError = findOverlappingZoneTierRanges(payload)
  if (overlapError) {
    return { success: false, error: overlapError }
  }

  // Reemplazo idempotente del set actual del evento
  const { error: delError } = await supabase
    .from("zone_tier_pricing")
    .delete()
    .eq("event_id", input.eventId)

  if (delError) {
    return { success: false, error: delError.message }
  }

  if (payload.length > 0) {
    const { error: upsertError } = await supabase
      .from("zone_tier_pricing")
      .insert(payload)
    if (upsertError) {
      const overlap =
        /superponen|23P01|exclusion|overlap/i.test(upsertError.message)
      return {
        success: false,
        error: overlap
          ? "Los rangos de mesa se superponen para el mismo sector y tipo de entrada."
          : upsertError.message,
      }
    }
  }

  // Sincroniza precio All-In del tier cuando está ligado al sector
  for (const row of payload) {
    const tier = (tiers ?? []).find((t) => t.id === row.ticket_tier_id)
    if (!tier?.seating_sector_id) continue
    if (tier.seating_sector_id !== row.sector_key) continue
    await admin
      .from("ticket_tiers")
      .update({ price: row.price })
      .eq("id", row.ticket_tier_id)
      .eq("event_id", input.eventId)
  }

  revalidatePath(`/admin/events/${input.eventId}`)
  revalidatePath(`/e/${input.eventId}`)
  return { success: true }
}
