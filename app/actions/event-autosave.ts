"use server"

import { revalidatePublicEventCache } from "@/lib/events/revalidate-public-event"

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
import { toUserFacingError } from "@/lib/errors/user-facing-error"
import {
  classifyPersistError,
  logPersistError,
  persistErrorUserMessage,
  type PersistErrorSource,
} from "@/lib/errors/persist-error"
import { writeSecurityAuditLog } from "@/lib/security/audit-log"
import { formHasInventoryOrVenue } from "@/lib/events/event-inventory-fingerprint"
import {
  collectLiveSeatingSectorIds,
  sanitizeEventSubmitPayload,
} from "@/lib/events/sanitize-ticket-tiers"
import { consolidateEventTicketsForPersist } from "@/lib/seating/venue-map-pricing"

export type AutosaveEventDraftResult =
  | {
      ok: true
      eventId: string
      venueId?: string | null
      mode: "created" | "updated" | "skipped"
    }
  | { ok: false; error: string; source: PersistErrorSource }

function hasMinimumDraftContent(values: EventFormValues): boolean {
  return values.basics.title.trim().length >= 3
}

function sanitizeAutosaveValues(
  values: EventFormValues,
  eventId: string | null,
): EventFormValues {
  const tickets = consolidateEventTicketsForPersist({
    ...values,
    tickets: (values.tickets ?? []).map((tier) => ({
      ...tier,
      price: Number.isFinite(Number(tier.price)) ? Number(tier.price) : 0,
    })),
  })
  return {
    ...values,
    venue: {
      ...values.venue,
      existingVenueId: values.venue.existingVenueId || null,
    },
    tickets: sanitizeEventSubmitPayload(
      { ...values, tickets },
      { mode: eventId ? "update" : "create" },
    ).tickets,
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
  identityOnly?: boolean
  flyer?: File | null
}): Promise<AutosaveEventDraftResult> {
  const values = sanitizeAutosaveValues(input.values, input.eventId)
  if (!hasMinimumDraftContent(values)) {
    return { ok: true, eventId: input.eventId ?? "", mode: "skipped" }
  }

  const parsed = draftEventSchema.safeParse(values)
  if (!parsed.success) {
    logPersistError("event-autosave validation", parsed.error)
    return {
      ok: false,
      source: "zod",
      error: persistErrorUserMessage(
        parsed.error,
        "El borrador no se pudo validar. Revisá sectores, combos y el mapa.",
      ),
    }
  }

  console.info("[event-autosave] persist payload", parsed.data)
  const formData = new FormData()
  formData.set("payload", JSON.stringify(parsed.data))
  formData.set("draftMode", "1")
  if (input.targetOrganizerId) {
    formData.set("targetOrganizerId", input.targetOrganizerId)
  }
  if (input.identityOnly && !formHasInventoryOrVenue(parsed.data)) {
    formData.set("identityOnly", "1")
  }
  if (input.flyer && input.flyer.size > 0) {
    formData.set("flyer", input.flyer)
  }

  let eventId = input.eventId
  let venueId: string | null = null

  try {
    if (eventId) {
      formData.set("eventId", eventId)
      const result = await updateCompleteEvent(formData)
      if (!result.success) {
        return {
          ok: false,
          source: result.source ?? classifyPersistError(result.error),
          error: result.error,
        }
      }
      eventId = result.eventId
      venueId = result.venueId
    } else {
      const result = await createCompleteEvent(formData)
      if (!result.success) {
        return {
          ok: false,
          source: result.source ?? classifyPersistError(result.error),
          error: result.error,
        }
      }
      eventId = result.eventId
      venueId = result.venueId
    }
  } catch (error) {
    logPersistError("event-autosave persist", error)
    return {
      ok: false,
      source: classifyPersistError(error),
      error: persistErrorUserMessage(error),
    }
  }

  if (input.zoneTierPricing && input.zoneTierPricing.length > 0) {
    const pricing = await syncZoneTierPricing({
      eventId,
      rows: input.zoneTierPricing,
      revalidate: false,
    })
    if (!pricing.success) {
      logPersistError("event-autosave zone pricing", pricing.error)
      return {
        ok: false,
        source: classifyPersistError(pricing.error),
        error: pricing.error,
      }
    }
  }

  if (eventId) {
    const admin = createAdminClient()
    const { data: row } = await admin
      .from("events")
      .select("slug")
      .eq("id", eventId)
      .maybeSingle()
    revalidatePublicEventCache({
      eventId,
      slug: row?.slug ?? null,
    })
  }

  return {
    ok: true,
    eventId,
    venueId,
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
  revalidate?: boolean
}): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Tu sesión venció por seguridad. Volvé a ingresar con tu cuenta" }

  const { data: event } = await supabase
    .from("events")
    .select("id, organizer_id, slug")
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

  const { data: eventVenue } = await supabase
    .from("events")
    .select("venue_id, venue_map")
    .eq("id", input.eventId)
    .maybeSingle()
  let venueLayout: unknown = null
  let venueMap: unknown = eventVenue?.venue_map ?? null
  if (eventVenue?.venue_id) {
    const { data: venue } = await supabase
      .from("venues")
      .select("seating_layout, venue_map")
      .eq("id", eventVenue.venue_id)
      .maybeSingle()
    venueLayout = venue?.seating_layout ?? null
    venueMap = venue?.venue_map ?? venueMap
  }
  const liveSectorIds = collectLiveSeatingSectorIds({
    venueMap,
    seatingLayout: venueLayout,
  })

  const payload = input.rows
    .map((row) => {
      const resolvedTierId = validTier.has(row.ticketTierId)
        ? row.ticketTierId
        : tierIdByName.get(row.ticketTierName.trim().toLocaleLowerCase("es"))
      if (!row.sectorKey || !resolvedTierId) return null
      if (liveSectorIds.size > 0 && !liveSectorIds.has(row.sectorKey)) {
        return null
      }
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
    return { success: false, error: toUserFacingError(delError.message) }
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
          : toUserFacingError(upsertError.message),
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

  if (input.revalidate !== false) {
    revalidatePublicEventCache({
      eventId: input.eventId,
      slug: event.slug,
    })
  }

  await writeSecurityAuditLog({
    actorId: user.id,
    action: "event_price_update",
    entity: "event",
    entityId: input.eventId,
    details: {
      source: "zone_tier_pricing",
      prices: payload.map((row) => ({
        tierId: row.ticket_tier_id,
        sectorKey: row.sector_key,
        price: row.price,
      })),
    },
  })

  return { success: true }
}
