"use server"

import { revalidatePath } from "next/cache"
import { revalidatePublicEventCache } from "@/lib/events/revalidate-public-event"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  isMissingIsDeletedColumn,
  withActiveEvents,
} from "@/lib/events/soft-delete"
import { publicEventPreviewPath } from "@/lib/preview/sandbox"
import { getSeoOrigin } from "@/lib/seo/site"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { isPlatformOwnerRole } from "@/lib/auth/platform-owner"
import {
  validateEventCompleteness as runEventPublishCheck,
} from "@/lib/events/validate-event-publish"
import { splitAbsorbFee } from "@/lib/pricing/absorb-fee-split"
import {
  DEFAULT_PLATFORM_FEE_PERCENTAGE,
  type EventFeeConfig,
} from "@/lib/pricing/event-fees"
import type { Database, Event, EventStatus, Json, Venue } from "@/types/database"
import {
  parseVenueMap,
  serializeVenueMap,
  type InteractiveVenueMap,
} from "@/types/venue-map"
import { assertDraftMapLayoutImmutable } from "@/lib/events/assert-draft-map-immutability"
import { draftLayoutSourceFromSavedVenueMap } from "@/lib/events/draft-map-immutability-v2"
import { hardReplacePublishedSeatingMaps } from "@/lib/events/hard-replace-seating-maps-v2"
import { seatingMapsFromSavedVenueMap } from "@/lib/events/publish-seating-inventory"
import { seatingPersistUserMessage } from "@/lib/events/sanitize-ticket-tiers"
import { purgeSandboxInventoryForEvent } from "@/lib/events/purge-sandbox-inventory-admin"
import {
  venueMapHasInventory,
  venueMapToSeatingLayout,
} from "@/lib/seating/venue-map-geometry"
import {
  applyMapCapacityToTickets,
  layoutTypeForMapSectorId,
  priceGroupSectorId,
} from "@/lib/seating/venue-map-pricing"
import { listVenuePriceGroups } from "@/lib/seating/venue-price-groups"
import { notifyOrganizerEventAudit } from "@/lib/events/notify-event-audit"
import { eventSoftDeleteDecision } from "@/lib/events/event-delete-policy"
import { isSandboxEventStatus } from "@/lib/events/review-status"
import { logger } from "@/lib/logger"
import { mapUnknownError } from "@/lib/errors/error-handler"
import { formatSupabaseError } from "@/lib/errors/supabase-error"
import type { AppErrorCode } from "@/lib/errors/app-error"
import {
  logPersistError,
  persistErrorLogLabel,
  persistErrorUserMessage,
  type PersistErrorSource,
} from "@/lib/errors/persist-error"
import { fieldFromAppError } from "@/lib/errors/form-field"
import { actionHintFromError } from "@/lib/errors/guided-action"
import { type WizardConflict } from "@/lib/seating/venue-map-sku-consistency"

export type OrganizerEvent = Pick<
  Event,
  | "id"
  | "title"
  | "description"
  | "date"
  | "location"
  | "image_url"
  | "status"
  | "venue_id"
  | "created_at"
  | "is_featured"
  | "featured_tier"
  | "featured_until"
  | "review_note"
> & {
  venues: Pick<Venue, "id" | "name" | "location"> | null
  ticketsSold: number
  paidOrderCount: number
}

async function requireAuthenticatedUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error("Debes iniciar sesión para administrar eventos.")
  }

  return { supabase, user }
}

async function countPaidOrdersByEventIds(
  eventIds: string[],
): Promise<Map<string, number>> {
  const paidByEvent = new Map<string, number>()
  if (eventIds.length === 0) return paidByEvent

  const admin = createAdminClient()
  const { data: ticketRows, error } = await admin
    .from("tickets")
    .select("event_id, order_id")
    .in("event_id", eventIds)
    .not("order_id", "is", null)

  if (error) {
    throw new Error(`No se pudieron leer las ventas pagadas: ${error.message}`)
  }

  const orderIds = [
    ...new Set(
      (ticketRows ?? [])
        .map((row) => row.order_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  if (orderIds.length === 0) return paidByEvent

  const { data: paidOrders, error: paidError } = await admin
    .from("orders")
    .select("id")
    .eq("status", "paid")
    .in("id", orderIds)

  if (paidError) {
    throw new Error(`No se pudieron leer las órdenes pagadas: ${paidError.message}`)
  }

  const paidIds = new Set((paidOrders ?? []).map((row) => row.id))
  const uniquePaid = new Map<string, Set<string>>()
  for (const row of ticketRows ?? []) {
    if (!row.order_id || !paidIds.has(row.order_id)) continue
    const bucket = uniquePaid.get(row.event_id) ?? new Set<string>()
    bucket.add(row.order_id)
    uniquePaid.set(row.event_id, bucket)
  }
  for (const [eventId, orders] of uniquePaid) {
    paidByEvent.set(eventId, orders.size)
  }
  return paidByEvent
}

async function countPaidOrdersForEvent(eventId: string): Promise<number> {
  const counts = await countPaidOrdersByEventIds([eventId])
  return counts.get(eventId) ?? 0
}

export async function getOrganizerEvents(): Promise<OrganizerEvent[]> {
  const { supabase, user } = await requireAuthenticatedUser()
  let organizerQuery = await withActiveEvents(
    supabase
      .from("events")
      .select(
        "id, title, description, date, location, image_url, status, venue_id, created_at, is_featured, featured_tier, featured_until, review_note, venues(id, name, location)",
      )
      .eq("organizer_id", user.id),
    true,
  ).order("date", { ascending: true })

  if (
    organizerQuery.error &&
    isMissingIsDeletedColumn(organizerQuery.error.message)
  ) {
    organizerQuery = await withActiveEvents(
      supabase
        .from("events")
        .select(
          "id, title, description, date, location, image_url, status, venue_id, created_at, is_featured, featured_tier, featured_until, review_note, venues(id, name, location)",
        )
        .eq("organizer_id", user.id),
      false,
    ).order("date", { ascending: true })
  }

  const { data, error } = organizerQuery

  if (error) {
    throw new Error(`No se pudieron cargar los eventos: ${error.message}`)
  }

  const events = data ?? []
  if (events.length === 0) return []

  const eventIds = events.map((event) => event.id)
  const { data: ticketRows, error: ticketsError } = await supabase
    .from("tickets")
    .select("event_id, status")
    .in("event_id", eventIds)
    .in("status", ["valid", "used", "scanned", "pending_payment"])

  if (ticketsError) {
    throw new Error(
      `No se pudo calcular ventas por evento: ${ticketsError.message}`,
    )
  }

  const soldByEvent = new Map<string, number>()
  for (const row of ticketRows ?? []) {
    soldByEvent.set(row.event_id, (soldByEvent.get(row.event_id) ?? 0) + 1)
  }

  const paidByEvent = await countPaidOrdersByEventIds(eventIds)

  return events.map((event) => ({
    ...event,
    ticketsSold: soldByEvent.get(event.id) ?? 0,
    paidOrderCount: paidByEvent.get(event.id) ?? 0,
  }))
}

async function revalidatePersistedEvent(
  client: SupabaseClient<Database>,
  eventId: string,
  previousSlug?: string | null,
) {
  const { data } = await client
    .from("events")
    .select("slug")
    .eq("id", eventId)
    .maybeSingle()
  revalidatePublicEventCache({
    eventId,
    slug: data?.slug,
    previousSlug,
  })
}

function persistFailure(error: unknown): {
  success: false
  error: string
  code: AppErrorCode
  source: PersistErrorSource
  title?: string
  field?: string
  actionHint?: string
  wizardConflict?: WizardConflict
} {
  const source = logPersistError("event-persist", error)
  const message = persistErrorUserMessage(error)
  logger.error({
    context: "event-persist",
    message: persistErrorLogLabel(source),
    error,
  })
  const mapped = mapUnknownError(error)
  const code = mapped.code === "UNKNOWN" ? "SAVE_FAILED" : mapped.code
  const field = fieldFromAppError(mapped)
  return {
    success: false,
    error: message,
    code,
    source,
    title: mapped.title,
    ...(field ? { field } : {}),
    actionHint: actionHintFromError(mapped),
    ...(mapped.action
      ? {
          wizardConflict: {
            summary: message,
            actions: [mapped.action],
          },
        }
      : {}),
  }
}

const OPTIONAL_EVENT_FLAG_COLUMNS_RE =
  /has_seating_plan|has_schedule|delivery_mode|access_link|accepts_mercado_pago|accepts_pos_payments|refund_policy|schema cache|PGRST204|42703/i

export async function materializeEventSeatingUnits(
  client: SupabaseClient<Database>,
  eventId: string,
): Promise<string | null> {
  const { error } = await client.rpc("materialize_event_seating_units", {
    p_event_id: eventId,
  })
  if (!error) return null
  logger.error({
    context: "materialize_event_seating_units",
    event_id: eventId,
    error,
  })
  return seatingPersistUserMessage(error) ?? formatSupabaseError(error)
}

function normalizeSectorLabel(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^sector\s+/, "")
}

async function syncMapBackedTiersAfterMapSave(
  client: SupabaseClient<Database>,
  eventId: string,
  map: InteractiveVenueMap,
): Promise<string | null> {
  if (!venueMapHasInventory(map)) return null
  const { data: tiers, error } = await client
    .from("ticket_tiers")
    .select("id, name, seating_sector_id, layout_type, capacity, sold, capacity_per_unit")
    .eq("event_id", eventId)
  if (error) return formatSupabaseError(error)

  const groups = listVenuePriceGroups(map)
  const liveIds = new Set(groups.map((group) => priceGroupSectorId(group)))
  const linked = (tiers ?? []).map((tier) => {
    const existing = (tier.seating_sector_id ?? "").trim()
    if (existing && liveIds.has(existing)) {
      return { ...tier, seatingSectorId: existing }
    }
    const name = normalizeSectorLabel(tier.name)
    const group = groups.find(
      (item) => normalizeSectorLabel(item.name) === name,
    )
    return {
      ...tier,
      seatingSectorId: group ? priceGroupSectorId(group) : existing || null,
    }
  })

  const healed = applyMapCapacityToTickets(linked, map)
  for (const tier of healed) {
    const sectorId = (tier.seatingSectorId ?? "").trim()
    if (!sectorId) continue
    const layoutType =
      layoutTypeForMapSectorId(map, sectorId) ?? tier.layout_type
    if (layoutType !== "numbered_seat" && layoutType !== "table_combo") {
      continue
    }
    const sold = Math.max(0, Number(tier.sold) || 0)
    const capacity = Math.max(1, Number(tier.capacity) || 1, sold)
    const { error: updateError } = await client
      .from("ticket_tiers")
      .update({
        id: tier.id,
        event_id: eventId,
        seating_sector_id: sectorId,
        layout_type: layoutType,
        capacity,
        capacity_per_unit: Math.max(1, Number(tier.capacity_per_unit) || 1),
      } as never)
      .eq("id", tier.id)
      .eq("event_id", eventId)
    if (updateError) return formatSupabaseError(updateError)
  }
  return null
}

async function syncTicketCapacityFromSeatingUnits(
  client: SupabaseClient<Database>,
  eventId: string,
): Promise<string | null> {
  const [{ data: units, error: unitsError }, { data: tiers, error: tiersError }] =
    await Promise.all([
      client
        .from("event_seating_units")
        .select("sector_id, capacity_per_unit")
        .eq("event_id", eventId),
      client
        .from("ticket_tiers")
        .select("id, seating_sector_id, layout_type, capacity, sold")
        .eq("event_id", eventId),
    ])
  if (unitsError) return formatSupabaseError(unitsError)
  if (tiersError) return formatSupabaseError(tiersError)
  if (!units?.length) return null

  const placesBySector = new Map<string, number>()
  for (const unit of units) {
    const sectorId = unit.sector_id?.trim()
    if (!sectorId) continue
    placesBySector.set(
      sectorId,
      (placesBySector.get(sectorId) ?? 0) +
        Math.max(1, Number(unit.capacity_per_unit) || 1),
    )
  }

  for (const tier of tiers ?? []) {
    const sectorId = tier.seating_sector_id?.trim()
    if (!sectorId) continue
    if (tier.layout_type !== "numbered_seat" && tier.layout_type !== "table_combo") {
      continue
    }
    const generated = placesBySector.get(sectorId)
    if (generated == null || generated <= 0) continue
    const sold = Math.max(0, Number(tier.sold) || 0)
    const nextCapacity = Math.max(generated, sold)
    if (nextCapacity === Number(tier.capacity)) continue
    const { error } = await client
      .from("ticket_tiers")
      .update({
        id: tier.id,
        event_id: eventId,
        capacity: nextCapacity,
      } as never)
      .eq("id", tier.id)
      .eq("event_id", eventId)
    if (error) return formatSupabaseError(error)
  }
  return null
}

export type PublishEventResult =
  | { success: true; purgedTestTickets?: number; status: EventStatus }
  | {
      success: false
      error: string
      code?: AppErrorCode
      missingFields?: string[]
    }

export async function validateEventCompleteness(eventId: string) {
  if (!eventId?.trim()) {
    return { canPublish: false, missingFields: ["Evento inválido."] }
  }
  const { supabase, user } = await requireAuthenticatedUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  const reader =
    profile?.role === "super_admin" ? createAdminClient() : supabase
  return runEventPublishCheck(eventId, reader)
}

/**
 * El organizador envía el evento a auditoría (`pending_approval`).
 * No publica ni habilita cobros. Sin CUIT / DNI.
 */
export async function publishEvent(
  eventId: string,
  options: { purgeTestTickets?: boolean } = {},
): Promise<PublishEventResult> {
  if (!eventId?.trim()) {
    return { success: false, error: "Evento inválido." }
  }

  const { supabase, user } = await requireAuthenticatedUser()

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", user.id)
    .maybeSingle()

  const approval = (profile as { organizer_approval_status?: string } | null)
    ?.organizer_approval_status
  const isSuperAdmin = profile?.role === "super_admin"
  const isApprovedOrganizer =
    isSuperAdmin || (profile?.role === "admin" && approval === "approved")

  if (!isApprovedOrganizer) {
    return {
      success: false,
      error: "Tu cuenta de organizador aún no está aprobada.",
    }
  }

  const reader = isSuperAdmin ? createAdminClient() : supabase
  const { data: event, error: eventError } = await reader
    .from("events")
    .select(
      "id, organizer_id, status, date, title, location, venue_id, flyer_url, image_url, schedule_days, delivery_mode, venues(id, name, location)",
    )
    .eq("id", eventId)
    .maybeSingle()

  if (eventError) {
    return persistFailure(eventError)
  }

  if (!event || (event.organizer_id !== user.id && !isSuperAdmin)) {
    return { success: false, error: "No tenés permiso para publicar este evento." }
  }

  if (event.status === "published") {
    return { success: true, purgedTestTickets: 0, status: "published" }
  }

  if (event.status === "pending_approval") {
    return { success: true, purgedTestTickets: 0, status: "pending_approval" }
  }

  if (
    event.status !== "draft" &&
    event.status !== "needs_revision" &&
    event.status !== "rejected"
  ) {
    return {
      success: false,
      error: "Solo se pueden enviar a revisión los borradores o eventos con cambios pedidos.",
    }
  }

  const startsAt = new Date(event.date)
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
    return persistFailure({ code: "INVALID_EVENT_DATE" })
  }

  const mutationClient =
    event.organizer_id !== user.id ? createAdminClient() : supabase

  const completeness = await runEventPublishCheck(eventId, mutationClient)
  if (!completeness.canPublish) {
    return {
      success: false,
      error:
        completeness.missingFields.join(" ") ||
        "El evento todavía tiene datos pendientes.",
      code: "INCOMPLETE_DAY_TICKETS",
      missingFields: completeness.missingFields,
    }
  }

  let purgedTestTickets = 0
  if (options.purgeTestTickets !== false) {
    try {
      const purged = await purgeSandboxInventoryForEvent(eventId)
      purgedTestTickets = purged.ticketsPurged
    } catch (error) {
      return persistFailure(
        error instanceof Error ? error : { message: "purge_failed" },
      )
    }
  }

  const { data: updated, error: updateError } = await mutationClient
    .from("events")
    .update({
      status: "pending_approval",
      review_note: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .eq("organizer_id", event.organizer_id)
    .in("status", ["draft", "needs_revision", "rejected"])
    .select("id")
    .maybeSingle()

  if (updateError) {
    return persistFailure(updateError)
  }

  if (!updated) {
    return {
      success: false,
      error: "No se pudo enviar el evento a revisión. Recargá e intentá de nuevo.",
    }
  }

  await revalidatePersistedEvent(mutationClient, eventId)
  revalidatePath("/admin")
  revalidatePath("/superadmin/events")
  revalidatePath("/superadmin/auditoria")
  revalidatePath("/superadmin")
  revalidatePath("/superadmin/soporte")

  void notifyOrganizerEventAudit({
    eventId,
    kind: "submitted",
  })

  return { success: true, purgedTestTickets, status: "pending_approval" }
}

export type UpdateEventSalesStatusResult =
  | { success: true; status: EventStatus }
  | { success: false; error: string }

/**
 * Control de venta del organizador: publicar / pausar / volver a borrador.
 * No toca cancelled/archived/completed.
 */
export async function updateEventSalesStatus(
  eventId: string,
  nextStatus: "published" | "paused" | "draft",
): Promise<UpdateEventSalesStatusResult> {
  if (!eventId?.trim()) {
    return { success: false, error: "Evento inválido." }
  }

  const { supabase, user } = await requireAuthenticatedUser()

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", user.id)
    .maybeSingle()

  const isSuper = profile?.role === "super_admin"
  const reader = isSuper ? createAdminClient() : supabase
  const { data: event, error: eventError } = await reader
    .from("events")
    .select("id, organizer_id, status")
    .eq("id", eventId)
    .maybeSingle()

  if (eventError) return persistFailure(eventError)
  if (!event) return { success: false, error: "Evento no encontrado." }

  const isOwner = event.organizer_id === user.id
  if (!isOwner && !isSuper) {
    return { success: false, error: "No tenés permiso para cambiar el estado." }
  }

  const mutationClient = isOwner ? supabase : createAdminClient()
  const current = event.status as EventStatus

  if (nextStatus === "published") {
    if (current === "published") {
      return { success: true, status: "published" }
    }
    if (current === "paused") {
      const { error } = await mutationClient
        .from("events")
        .update({ status: "published", updated_at: new Date().toISOString() })
        .eq("id", eventId)
      if (error) return persistFailure(error)
      revalidateEventSalesPaths(eventId)
      return { success: true, status: "published" }
    }
    const reviewed = await publishEvent(eventId, { purgeTestTickets: true })
    if (!reviewed.success) return reviewed
    return { success: true, status: reviewed.status }
  }

  if (nextStatus === "paused") {
    if (current !== "published" && current !== "paused") {
      return {
        success: false,
        error: "Solo podés pausar un evento publicado.",
      }
    }
    const { error } = await mutationClient
      .from("events")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", eventId)
    if (error) return persistFailure(error)
    revalidateEventSalesPaths(eventId)
    return { success: true, status: "paused" }
  }

  // draft
  if (current !== "paused" && current !== "draft" && current !== "published") {
    return {
      success: false,
      error: "No se puede pasar este evento a borrador.",
    }
  }
  const { error } = await mutationClient
    .from("events")
    .update({ status: "draft", updated_at: new Date().toISOString() })
    .eq("id", eventId)
  if (error) return persistFailure(error)
  revalidateEventSalesPaths(eventId)
  return { success: true, status: "draft" }
}

function revalidateEventSalesPaths(eventId: string) {
  revalidatePublicEventCache({ eventId, slug: eventId })
  revalidatePath("/admin")
  revalidatePath("/superadmin/events")
}

export async function countEventTestTickets(
  eventId: string,
): Promise<number> {
  if (!eventId?.trim()) return 0
  const { supabase, user } = await requireAuthenticatedUser()

  const { data: event } = await supabase
    .from("events")
    .select("organizer_id")
    .eq("id", eventId)
    .maybeSingle()

  if (!event || event.organizer_id !== user.id) return 0

  const { count, error } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("is_test", true)

  if (error) return 0
  return count ?? 0
}

export async function getOrganizerPreviewShareUrl(
  eventId: string,
): Promise<
  { success: true; url: string } | { success: false; error: string }
> {
  if (!eventId?.trim()) {
    return { success: false, error: "Evento inválido." }
  }

  const { supabase, user } = await requireAuthenticatedUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  const isSuper = profile?.role === "super_admin"
  const reader = isSuper ? createAdminClient() : supabase

  const { data: event, error } = await reader
    .from("events")
    .select("id, slug, organizer_id, status, preview_key")
    .eq("id", eventId)
    .maybeSingle()

  if (error || !event) {
    return { success: false, error: "Evento no encontrado." }
  }
  if (event.organizer_id !== user.id && !isSuper) {
    return { success: false, error: "No tenés permiso para copiar este enlace." }
  }
  if (!isSandboxEventStatus(event.status)) {
    return {
      success: false,
      error: "El enlace de prueba solo está disponible antes de publicar.",
    }
  }

  const path = publicEventPreviewPath(event, event.preview_key)
  return { success: true, url: `${getSeoOrigin()}${path}` }
}

export type DeleteOrArchiveEventResult =
  | { success: true; mode: "deleted" | "cancelled" | "archived" }
  | { success: false; error: string }

/**
 * Soft delete:
 * - Con ventas confirmadas → bloqueado
 * - Sin ventas → `is_deleted = true` (nunca DELETE físico)
 */
export async function deleteOrArchiveEvent(
  eventId: string,
): Promise<DeleteOrArchiveEventResult> {
  if (!eventId?.trim()) {
    return { success: false, error: "Evento inválido." }
  }

  const { supabase, user } = await requireAuthenticatedUser()

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, organizer_id, status, title, is_deleted")
    .eq("id", eventId)
    .maybeSingle()

  if (eventError) {
    return persistFailure(eventError)
  }
  if (!event || event.organizer_id !== user.id) {
    return { success: false, error: "No tenés permiso sobre este evento." }
  }

  if (event.status === "cancelled") {
    return { success: false, error: "El evento ya está cancelado." }
  }

  const paidOrderCount = await countPaidOrdersForEvent(eventId)
  const { count, error: countError } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .in("status", ["valid", "used", "scanned", "transferred"])

  if (countError) {
    return persistFailure(countError)
  }

  const decision = eventSoftDeleteDecision({
    isDeleted: Boolean(event.is_deleted),
    paidOrders: paidOrderCount,
    confirmedTickets: count ?? 0,
  })
  if (!decision.ok) {
    return { success: false, error: decision.error }
  }

  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await supabase
    .from("events")
    .update({
      is_deleted: true,
      deleted_at: now,
      updated_at: now,
    })
    .eq("id", eventId)
    .eq("organizer_id", user.id)
    .eq("is_deleted", false)
    .select("id")
    .maybeSingle()

  if (updateError) {
    return persistFailure(updateError)
  }
  if (!updated) {
    return {
      success: false,
      error: "No se pudo eliminar el evento. Recargá e intentá de nuevo.",
    }
  }

  revalidatePath("/admin")
  revalidatePath("/admin/events")
  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath(`/events/${eventId}`)
  revalidatePath("/events")
  revalidatePath("/")
  revalidatePath("/superadmin/events")

  return { success: true, mode: "deleted" }
}

export async function archiveEvent(
  eventId: string,
): Promise<DeleteOrArchiveEventResult> {
  if (!eventId?.trim()) {
    return { success: false, error: "Evento inválido." }
  }

  const { supabase, user } = await requireAuthenticatedUser()

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, organizer_id, status")
    .eq("id", eventId)
    .maybeSingle()

  if (eventError) {
    return persistFailure(eventError)
  }
  if (!event || event.organizer_id !== user.id) {
    return { success: false, error: "No tenés permiso sobre este evento." }
  }

  if (event.status === "archived") {
    return { success: true, mode: "archived" }
  }

  if (event.status === "cancelled") {
    return {
      success: false,
      error: "Un evento cancelado no se puede archivar.",
    }
  }

  const { count, error: countError } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .in("status", ["valid", "used", "scanned", "pending_payment"])

  if (countError) {
    return persistFailure(countError)
  }

  const paidOrderCount = await countPaidOrdersForEvent(eventId)
  if (paidOrderCount > 0) {
    return {
      success: false,
      error:
        "Este evento tiene compras pagadas. Solicitá la cancelación a soporte.",
    }
  }

  if ((count ?? 0) > 0 && event.status === "published") {
    return {
      success: false,
      error:
        "Hay entradas vendidas. Usá Eliminar para cancelar el evento y preservar la auditoría.",
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("events")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .eq("organizer_id", user.id)
    .select("id")
    .maybeSingle()

  if (updateError) {
    return persistFailure(updateError)
  }
  if (!updated) {
    return { success: false, error: "No se pudo archivar el evento." }
  }

  revalidatePath("/admin")
  revalidatePath("/admin/events")
  revalidatePath(`/events/${eventId}`)
  revalidatePath("/events")
  revalidatePath("/")

  return { success: true, mode: "archived" }
}

export type EventCommercialSettings = EventFeeConfig & {
  eventId: string
  title: string
}

export async function getEventCommercialSettings(
  eventId: string,
): Promise<EventCommercialSettings | null> {
  if (!eventId?.trim()) return null
  const { supabase, user } = await requireAuthenticatedUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (!isPlatformOwnerRole(profile?.role)) return null

  const admin = createAdminClient()
  const { data: event } = await admin
    .from("events")
    .select(
      "id, title, platform_fee_percentage, platform_fixed_fee, max_free_tickets, is_sponsored_by_tokepass",
    )
    .eq("id", eventId)
    .maybeSingle()

  if (!event) return null

  return {
    eventId: event.id,
    title: event.title,
    platformFeePercentage: Number(
      event.platform_fee_percentage ?? DEFAULT_PLATFORM_FEE_PERCENTAGE,
    ),
    platformFixedFee: Number(event.platform_fixed_fee ?? 0),
    maxFreeTickets: Number(event.max_free_tickets ?? 100),
    isSponsoredByTokePass: Boolean(event.is_sponsored_by_tokepass),
  }
}

export type UpdateEventCommercialSettingsResult =
  | { success: true; recalculatedTiers: number }
  | { success: false; error: string }

/**
 * Platform owner only (super_admin / PLATFORM_OWNER): fees, free-ticket cap,
 * TokePass sponsorship. Recomputes tier base_price / platform_fee from public
 * All-In price.
 *
 * Auth: misma fuente que `app/(superadmin)/layout.tsx` → `profiles.role === "super_admin"`.
 * Persistencia: service-role (bypass RLS de organizer). El trigger P28/P38 permite
 * mutar columnas comerciales cuando `auth.role() = 'service_role'`.
 */
export async function updateEventCommercialSettings(
  eventId: string,
  input: {
    platformFeePercentage: number
    platformFixedFee: number
    maxFreeTickets: number
    isSponsoredByTokePass: boolean
  },
): Promise<UpdateEventCommercialSettingsResult> {
  if (!eventId?.trim()) {
    return { success: false, error: "Evento inválido." }
  }

  const { supabase, user } = await requireAuthenticatedUser()
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError || !isPlatformOwnerRole(profile?.role)) {
    return {
      success: false,
      error: "Solo el dueño de la plataforma puede editar estos valores.",
    }
  }

  const percentage = Number(input.platformFeePercentage)
  const fixed = Number(input.platformFixedFee)
  const maxFree = Math.floor(Number(input.maxFreeTickets))
  const sponsored = Boolean(input.isSponsoredByTokePass)

  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 95) {
    return { success: false, error: "El porcentaje debe estar entre 0 y 95." }
  }
  if (!Number.isFinite(fixed) || fixed < 0) {
    return { success: false, error: "El cargo fijo no puede ser negativo." }
  }
  if (!Number.isFinite(maxFree) || maxFree < 0) {
    return { success: false, error: "El máximo de entradas gratis es inválido." }
  }

  const feeConfig: EventFeeConfig = {
    platformFeePercentage: percentage,
    platformFixedFee: fixed,
    maxFreeTickets: maxFree,
    isSponsoredByTokePass: sponsored,
  }

  const admin = createAdminClient()

  const { error: updateError } = await admin
    .from("events")
    .update({
      platform_fee_percentage: feeConfig.platformFeePercentage,
      platform_fixed_fee: feeConfig.platformFixedFee,
      max_free_tickets: feeConfig.maxFreeTickets,
      is_sponsored_by_tokepass: feeConfig.isSponsoredByTokePass,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)

  if (updateError) {
    return persistFailure(updateError)
  }

  const absorbQuery = await admin
    .from("events")
    .select("absorb_fees")
    .eq("id", eventId)
    .maybeSingle()
  const absorbFees =
    !absorbQuery.error && absorbQuery.data?.absorb_fees === true

  const { data: tiers, error: tiersError } = await admin
    .from("ticket_tiers")
    .select("id, price")
    .eq("event_id", eventId)

  if (tiersError) {
    return persistFailure(tiersError)
  }

  let recalculatedTiers = 0
  for (const tier of tiers ?? []) {
    const breakdown = splitAbsorbFee({
      ticketPrice: tier.price,
      feeRate: sponsored ? 0 : percentage,
      absorbFees,
      fixedFee: sponsored ? 0 : fixed,
    })
    const { error } = await admin
      .from("ticket_tiers")
      .update({
        id: tier.id,
        event_id: eventId,
        base_price: breakdown.organizerEarnings,
        platform_fee: breakdown.feeAmount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tier.id)
      .eq("event_id", eventId)
    if (!error) recalculatedTiers += 1
  }

  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath(`/admin/events/${eventId}/edit`)
  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/superadmin/events/${eventId}`)
  revalidatePath("/superadmin/events")
  revalidatePath("/")

  return { success: true, recalculatedTiers }
}

export async function saveVenueMapOnly(
  eventId: string,
  venueMapData: unknown,
): Promise<{ success: true } | { success: false; error: string }> {
  const id = eventId.trim()
  if (!id) {
    return { success: false, error: "Evento inválido." }
  }

  let supabase: Awaited<ReturnType<typeof createClient>>
  let userId: string
  try {
    const session = await requireAuthenticatedUser()
    supabase = session.supabase
    userId = session.user.id
  } catch {
    return { success: false, error: "Debes iniciar sesión para guardar el mapa." }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", userId)
    .maybeSingle()

  const isSuperAdmin = isPlatformOwnerRole(profile?.role)
  const reader = isSuperAdmin ? createAdminClient() : supabase

  const { data: event, error: eventError } = await reader
    .from("events")
    .select("id, organizer_id")
    .eq("id", id)
    .maybeSingle()

  if (eventError) {
    return { success: false, error: formatSupabaseError(eventError) }
  }
  if (!event) {
    return { success: false, error: "Evento no encontrado." }
  }

  if (!isSuperAdmin) {
    const isApprovedOrganizer =
      profile?.role === "admin" &&
      profile.organizer_approval_status === "approved"
    if (!isApprovedOrganizer) {
      return {
        success: false,
        error: "Tu cuenta de organizador no está habilitada para editar eventos.",
      }
    }
    if (event.organizer_id !== userId) {
      return { success: false, error: "No tenés permiso para editar este evento." }
    }
  }

  let payload: Json
  try {
    payload = serializeVenueMap(parseVenueMap(venueMapData)) as unknown as Json
  } catch {
    return { success: false, error: "El mapa tiene un formato inválido." }
  }

  const mutationClient =
    event.organizer_id !== userId ? createAdminClient() : supabase

  const parsedMap = parseVenueMap(venueMapData)
  const seatingLayout = venueMapToSeatingLayout(parsedMap) as unknown as Json
  const now = new Date().toISOString()
  const [{ data: eventRow, error: eventReadError }, schedules] = await Promise.all([
    mutationClient.from("events").select("venue_id").eq("id", id).maybeSingle(),
    mutationClient
      .from("event_schedules")
      .select("id")
      .eq("event_id", id)
      .order("start_time", { ascending: true }),
  ])
  if (eventReadError) {
    return { success: false, error: formatSupabaseError(eventReadError) }
  }
  if (schedules.error) {
    return { success: false, error: formatSupabaseError(schedules.error) }
  }
  const scheduleDayIds = (schedules.data ?? []).map((row) => row.id)
  const inventoryMaps = seatingMapsFromSavedVenueMap({
    mapConfig: payload,
    seatingLayout,
    scheduleDayIds,
  })
  if (!inventoryMaps.ok) {
    return {
      success: false,
      error:
        "Este evento tiene varias jornadas. Editá el mapa de cada día en el editor y publicá.",
    }
  }

  const locked = await assertDraftMapLayoutImmutable({
    eventId: id,
    draft: draftLayoutSourceFromSavedVenueMap({
      map: parsedMap,
      scheduleDayIds,
    }),
  })
  if (!locked.ok) {
    return { success: false, error: locked.error }
  }

  const mapPatch = {
    venue_map: payload,
    has_seating_plan: true,
    updated_at: now,
  }
  const { error } = await mutationClient
    .from("events")
    .update(mapPatch as never)
    .eq("id", id)

  if (error && OPTIONAL_EVENT_FLAG_COLUMNS_RE.test(error.message)) {
    const retry = await mutationClient
      .from("events")
      .update({
        venue_map: payload,
        updated_at: now,
      } as never)
      .eq("id", id)
    if (retry.error) {
      return { success: false, error: formatSupabaseError(retry.error) }
    }
  } else if (error) {
    return { success: false, error: formatSupabaseError(error) }
  }

  if (eventRow?.venue_id && scheduleDayIds.length < 2) {
    const venueWrite = await mutationClient
      .from("venues")
      .update({
        venue_map: payload,
        seating_layout: seatingLayout,
        updated_at: now,
      } as never)
      .eq("id", eventRow.venue_id)
    if (venueWrite.error) {
      return { success: false, error: formatSupabaseError(venueWrite.error) }
    }
  }

  try {
    await hardReplacePublishedSeatingMaps({
      eventId: id,
      maps: inventoryMaps.maps,
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : formatSupabaseError(error),
    }
  }

  const healError = await syncMapBackedTiersAfterMapSave(
    mutationClient,
    id,
    parsedMap,
  )
  if (healError) {
    return { success: false, error: healError }
  }

  const materializeError = await materializeEventSeatingUnits(mutationClient, id)
  if (materializeError) {
    return { success: false, error: materializeError }
  }
  const capacitySyncError = await syncTicketCapacityFromSeatingUnits(
    mutationClient,
    id,
  )
  if (capacitySyncError) {
    return { success: false, error: capacitySyncError }
  }

  await revalidatePersistedEvent(mutationClient, id)
  return { success: true }
}

