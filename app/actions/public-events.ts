"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { Event, TicketTier, Venue } from "@/types/database"

/**
 * TEMPORAL (Fase B — testing):
 * Los eventos del wizard se crean como `draft`. RLS solo deja ver `published`
 * al público anónimo, así que con este flag usamos service role e incluimos
 * drafts para poder probar el storefront.
 *
 * Cuando exista "Publicar evento" en el Command Center, poné esto en `false`.
 */
const TEMP_INCLUDE_DRAFTS = true

export type CatalogEvent = {
  id: string
  title: string
  description: string | null
  date: string
  location: string
  imageUrl: string | null
  status: Event["status"]
  venueName: string | null
  venueLocation: string | null
  organizerName: string | null
  startingPrice: number | null
}

export type EventDetails = {
  id: string
  title: string
  description: string | null
  date: string
  location: string
  imageUrl: string | null
  status: Event["status"]
  /** Fracción decimal del cargo Tokepass (ej. 0.15) */
  serviceChargeRate: number
  venue: Pick<Venue, "id" | "name" | "location" | "capacity"> | null
  tiers: Array<
    Pick<
      TicketTier,
      | "id"
      | "name"
      | "price"
      | "capacity"
      | "sold"
      | "time_limit"
      | "bonus_reward"
    > & { available: number }
  >
}

type EventListRow = {
  id: string
  title: string
  description: string | null
  date: string
  location: string
  image_url: string | null
  flyer_url: string | null
  status: Event["status"]
  venues: { name: string; location: string } | null
  ticket_tiers: { price: number }[] | null
  profiles: { full_name: string | null } | null
}

type EventDetailRow = {
  id: string
  title: string
  description: string | null
  date: string
  location: string
  image_url: string | null
  flyer_url: string | null
  status: Event["status"]
  venues: Pick<Venue, "id" | "name" | "location" | "capacity"> | null
  ticket_tiers: Array<
    Pick<
      TicketTier,
      | "id"
      | "name"
      | "price"
      | "capacity"
      | "sold"
      | "time_limit"
      | "bonus_reward"
    >
  > | null
}

async function getReadClient() {
  if (TEMP_INCLUDE_DRAFTS) {
    try {
      return createAdminClient()
    } catch {
      return createClient()
    }
  }
  return createClient()
}

function computeStartingPrice(tiers: { price: number }[] | null): number | null {
  if (!tiers?.length) return null
  return Math.min(...tiers.map((tier) => Number(tier.price)))
}

function startOfTodayIso(): string {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now.toISOString()
}

export async function getPublishedEvents(
  search?: string,
): Promise<CatalogEvent[]> {
  const supabase = await getReadClient()

  let query = supabase
    .from("events")
    .select(
      "id, title, description, date, location, image_url, flyer_url, status, venues(name, location), ticket_tiers(price), profiles!events_organizer_id_fkey(full_name)",
    )
    .gte("date", startOfTodayIso())
    .order("date", { ascending: true })

  if (TEMP_INCLUDE_DRAFTS) {
    query = query.in("status", ["published", "draft"])
  } else {
    query = query.eq("status", "published")
  }

  if (search?.trim()) {
    const term = `%${search.trim()}%`
    query = query.or(
      `title.ilike.${term},location.ilike.${term},description.ilike.${term}`,
    )
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`No se pudieron cargar los eventos: ${error.message}`)
  }

  return ((data ?? []) as unknown as EventListRow[]).map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    date: event.date,
    location: event.location,
    imageUrl: event.flyer_url ?? event.image_url,
    status: event.status,
    venueName: event.venues?.name ?? null,
    venueLocation: event.venues?.location ?? null,
    organizerName: event.profiles?.full_name ?? null,
    startingPrice: computeStartingPrice(event.ticket_tiers),
  }))
}

export async function getEventDetails(
  eventId: string,
): Promise<EventDetails | null> {
  const supabase = await getReadClient()

  let query = supabase
    .from("events")
    .select(
      "id, title, description, date, location, image_url, flyer_url, status, venues(id, name, location, capacity), ticket_tiers(id, name, price, capacity, sold, time_limit, bonus_reward)",
    )
    .eq("id", eventId)

  if (!TEMP_INCLUDE_DRAFTS) {
    query = query.eq("status", "published")
  } else {
    query = query.in("status", ["published", "draft"])
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(`No se pudo cargar el evento: ${error.message}`)
  }

  if (!data) return null

  const event = data as unknown as EventDetailRow
  const tiers = [...(event.ticket_tiers ?? [])].sort(
    (a, b) => Number(a.price) - Number(b.price),
  )

  let serviceChargeRate = 0.15
  const { data: rate } = await supabase.rpc("get_event_service_charge_rate", {
    p_event_id: eventId,
  })
  if (typeof rate === "number" && Number.isFinite(rate)) {
    serviceChargeRate = rate
  } else if (rate != null && Number.isFinite(Number(rate))) {
    serviceChargeRate = Number(rate)
  }

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    date: event.date,
    location: event.location,
    imageUrl: event.flyer_url ?? event.image_url,
    status: event.status,
    serviceChargeRate,
    venue: event.venues,
    tiers: tiers.map((tier) => ({
      ...tier,
      price: Number(tier.price),
      available: Math.max(0, tier.capacity - tier.sold),
    })),
  }
}
