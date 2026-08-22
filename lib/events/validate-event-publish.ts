import type { SupabaseClient } from "@supabase/supabase-js"

import { isOnlineDelivery } from "@/lib/events/delivery-mode"
import { scheduleDaysFromEvent } from "@/lib/event-schedule"
import {
  isActiveInventoryTicket,
  scheduleDayMissingTicketsMessage,
  ticketHasSellableOffer,
  uncoveredRegisteredDays,
  type DayCoverageTicket,
} from "@/lib/inventory/day-ticket-coverage"
import type { Database } from "@/types/database"

export type EventPublishCheck = {
  canPublish: boolean
  missingFields: string[]
}

export type EventCompletenessInput = {
  title?: string | null
  flyerUrl?: string | null
  imageUrl?: string | null
  location?: string | null
  venueId?: string | null
  venueName?: string | null
  venueLocation?: string | null
  deliveryMode?: unknown
  date?: string | null
  scheduleDays: Array<{ id: string; title?: string | null }>
  tickets: DayCoverageTicket[]
}

export const MISSING_EVENT_DAY =
  "Registrá al menos un día del evento."
export const MISSING_EVENT_TITLE = "Falta el título del evento."
export const MISSING_EVENT_FLYER = "Subí un flyer de portada."
export const MISSING_EVENT_LOCATION = "Completá una ubicación válida."
export const MISSING_SELLABLE_TICKET =
  "Configurá al menos una entrada activa con precio y cupo mayor a 0."

function hasCoverImage(input: Pick<EventCompletenessInput, "flyerUrl" | "imageUrl">) {
  return Boolean(
    (input.flyerUrl ?? "").trim() || (input.imageUrl ?? "").trim(),
  )
}

function hasValidLocation(input: EventCompletenessInput): boolean {
  if (isOnlineDelivery(input.deliveryMode)) return true
  const venueOk = Boolean(
    input.venueId?.trim() &&
      input.venueName?.trim() &&
      input.venueLocation?.trim(),
  )
  const locationOk = (input.location ?? "").trim().length >= 3
  return venueOk || locationOk
}

/**
 * Validación pura de completitud previa a publicación / envío a revisión.
 */
export function evaluateEventCompleteness(
  input: EventCompletenessInput,
): EventPublishCheck {
  const missingFields: string[] = []
  const title = (input.title ?? "").trim()
  if (title.length < 3) missingFields.push(MISSING_EVENT_TITLE)
  if (!hasCoverImage(input)) missingFields.push(MISSING_EVENT_FLYER)
  if (!hasValidLocation(input)) missingFields.push(MISSING_EVENT_LOCATION)

  const days = input.scheduleDays
  const hasAnchorDate = Boolean(input.date && !Number.isNaN(new Date(input.date).getTime()))
  if (days.length === 0 && !hasAnchorDate) {
    missingFields.push(MISSING_EVENT_DAY)
  }

  const sellableActive = input.tickets.filter(
    (ticket) => isActiveInventoryTicket(ticket) && ticketHasSellableOffer(ticket),
  )
  if (sellableActive.length === 0) {
    missingFields.push(MISSING_SELLABLE_TICKET)
  }

  if (days.length > 0) {
    const uncovered = uncoveredRegisteredDays(days, input.tickets)
    for (const day of uncovered) {
      missingFields.push(
        scheduleDayMissingTicketsMessage(
          day,
          days.findIndex((item) => item.id === day.id),
        ),
      )
    }
  }

  return {
    canPublish: missingFields.length === 0,
    missingFields,
  }
}

function venueFromJoin(raw: unknown): {
  id?: string
  name?: string
  location?: string
} | null {
  if (Array.isArray(raw)) {
    const first = raw[0]
    return first && typeof first === "object"
      ? (first as { id?: string; name?: string; location?: string })
      : null
  }
  if (raw && typeof raw === "object") {
    return raw as { id?: string; name?: string; location?: string }
  }
  return null
}

/**
 * Carga el evento persistido y valida que no queden días sin tarifa,
 * ni identidad/ubicación incompletas, antes de pasar a PUBLISHED.
 */
export async function validateEventCompleteness(
  eventId: string,
  client: SupabaseClient<Database>,
): Promise<EventPublishCheck> {
  if (!eventId.trim()) {
    return { canPublish: false, missingFields: ["Evento inválido."] }
  }

  const { data: event, error: eventError } = await client
    .from("events")
    .select(
      "id, title, date, location, venue_id, flyer_url, image_url, schedule_days, delivery_mode, venues(id, name, location)",
    )
    .eq("id", eventId)
    .maybeSingle()

  if (eventError || !event) {
    return { canPublish: false, missingFields: ["No encontramos este evento."] }
  }

  const { data: scheduleRows } = await client
    .from("event_schedules")
    .select("id, title, start_time, end_time")
    .eq("event_id", eventId)

  const { data: tiers, error: tiersError } = await client
    .from("ticket_tiers")
    .select(
      "id, name, price, capacity, day_id, visibility, tier_type, bundle_type, layout_type",
    )
    .eq("event_id", eventId)

  if (tiersError) {
    return {
      canPublish: false,
      missingFields: ["No se pudieron leer las entradas del evento."],
    }
  }

  const venue = venueFromJoin((event as { venues?: unknown }).venues)

  return evaluateEventCompleteness({
    title: event.title,
    flyerUrl: event.flyer_url,
    imageUrl: event.image_url,
    location: event.location,
    venueId: event.venue_id,
    venueName: venue?.name,
    venueLocation: venue?.location,
    deliveryMode: (event as { delivery_mode?: unknown }).delivery_mode,
    date: event.date,
    scheduleDays: scheduleDaysFromEvent({
      relational: scheduleRows ?? null,
      json: (event as { schedule_days?: unknown }).schedule_days,
    }),
    tickets: (tiers ?? []).map((tier) => ({
      id: tier.id,
      name: tier.name,
      price: Number(tier.price),
      capacity: tier.capacity,
      dayId: tier.day_id,
      visibility: tier.visibility,
      tierType: tier.tier_type,
      bundleType: tier.bundle_type,
      layoutType: tier.layout_type,
    })),
  })
}
