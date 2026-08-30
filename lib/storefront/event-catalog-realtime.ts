import { resolveTicketCommerceType } from "@/lib/events/ticket-commerce-type"
import { eventNeedsInteractiveCanvas } from "@/lib/seating/venue-map-pricing"
import { hasInteractiveVenueMap } from "@/lib/seating/venue-map-geometry"
import { parseScheduleDays } from "@/lib/event-schedule"
import {
  eventAcceptsMercadoPago,
  eventAcceptsPosPayments,
} from "@/lib/events/checkout-policy"
import { parseEventRefundPolicy } from "@/lib/validations/event-form"
import { parseVenueMap } from "@/types/venue-map"
import type { EventDetails } from "@/app/actions/public-events"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"

export type EventCatalogEventRow = {
  id?: string
  slug?: string | null
  title?: string
  description?: string | null
  status?: EventDetails["status"]
  location?: string
  date?: string
  ends_at?: string | null
  image_url?: string | null
  flyer_url?: string | null
  schedule_days?: unknown
  venue_map?: unknown
  accepts_mercado_pago?: boolean | null
  accepts_pos_payments?: boolean | null
  refund_policy?: unknown
}

export type EventCatalogTierRow = {
  id?: string
  event_id?: string
  name?: string
  price?: number
  capacity?: number
  sold?: number
  visibility?: "public" | "private" | string
  list_price?: number | null
  seating_sector_id?: string | null
  day_id?: string | null
  ticket_type?: string | null
  tier_type?: string | null
  category?: string | null
  layout_type?: string | null
}

export type EventCatalogTierChange = "INSERT" | "UPDATE" | "DELETE"

function finiteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function ticketSelectorPatchFromRow(
  row: EventCatalogTierRow,
): Partial<TicketSelectorTier> | null {
  if (!row.id?.trim()) return null
  const capacity = finiteNumber(row.capacity)
  const sold = finiteNumber(row.sold)
  const price = finiteNumber(row.price)
  const listPrice = row.list_price === undefined ? undefined : finiteNumber(row.list_price)
  const available =
    capacity != null && sold != null ? Math.max(0, capacity - sold) : undefined
  const isActive =
    row.visibility === undefined ? undefined : row.visibility !== "private"
  return {
    ...(row.name?.trim() ? { name: row.name.trim() } : {}),
    ...(price != null ? { price } : {}),
    ...(capacity != null ? { capacity } : {}),
    ...(sold != null ? { sold } : {}),
    ...(available != null ? { available } : {}),
    ...(isActive !== undefined ? { isActive, ...(isActive ? {} : { available: 0 }) } : {}),
    ...(listPrice !== undefined ? { listPrice } : {}),
    ...(row.seating_sector_id !== undefined
      ? { seatingSectorId: row.seating_sector_id }
      : {}),
  }
}

export function applyEventCatalogRow(
  event: EventDetails,
  row: EventCatalogEventRow,
): EventDetails {
  const title = row.title?.trim()
  const flyerChanged =
    row.flyer_url !== undefined || row.image_url !== undefined
  const next: EventDetails = {
    ...event,
    ...(row.slug?.trim() ? { slug: row.slug.trim() } : {}),
    ...(title ? { title } : {}),
    ...(row.description !== undefined ? { description: row.description } : {}),
    ...(typeof row.location === "string" ? { location: row.location } : {}),
    ...(typeof row.date === "string" && row.date.trim()
      ? { date: row.date }
      : {}),
    ...(row.ends_at !== undefined ? { endsAt: row.ends_at } : {}),
    ...(flyerChanged
      ? { imageUrl: row.flyer_url ?? row.image_url ?? event.imageUrl }
      : {}),
    ...(row.schedule_days !== undefined
      ? { scheduleDays: parseScheduleDays(row.schedule_days) }
      : {}),
    ...(row.status ? { status: row.status } : {}),
    ...(row.accepts_mercado_pago !== undefined
      ? {
          acceptsMercadoPago: eventAcceptsMercadoPago(
            row.accepts_mercado_pago,
          ),
        }
      : {}),
    ...(row.accepts_pos_payments !== undefined
      ? {
          acceptsPosPayments: eventAcceptsPosPayments(
            row.accepts_pos_payments,
          ),
        }
      : {}),
    ...(row.refund_policy !== undefined
      ? { refundPolicy: parseEventRefundPolicy(row.refund_policy) }
      : {}),
  }

  if (row.venue_map === undefined || !event.venue) return next
  const parsed = parseVenueMap(row.venue_map)
  if (!hasInteractiveVenueMap(parsed) && event.venue.venue_map) {
    return next
  }
  return {
    ...next,
    hasInteractiveMap:
      event.hasSeatingPlan &&
      event.hasInteractiveMap &&
      eventNeedsInteractiveCanvas(parsed, next.tiers, {
        hasSeatingPlan: event.hasSeatingPlan,
      }),
    venue: {
      ...event.venue,
      venue_map: parsed,
    },
  }
}

export function applyTicketTierCatalogRow(
  event: EventDetails,
  change: EventCatalogTierChange,
  row: EventCatalogTierRow,
): EventDetails {
  const tierId = row.id?.trim()
  if (!tierId) return event

  if (change === "DELETE" || row.visibility === "private") {
    return {
      ...event,
      tiers: event.tiers.filter((tier) => tier.id !== tierId),
      zoneTierPricing: event.zoneTierPricing.filter(
        (item) => item.ticketTierId !== tierId,
      ),
    }
  }

  const idx = event.tiers.findIndex((tier) => tier.id === tierId)
  if (idx < 0) {
    if (change !== "INSERT") return event
    const hasCommerceHint =
      row.ticket_type != null ||
      row.tier_type != null ||
      row.category != null ||
      row.layout_type != null
    // A partial realtime row must not appear as a new General admission.
    if (!hasCommerceHint) return event
    const capacity = finiteNumber(row.capacity) ?? 0
    const sold = finiteNumber(row.sold) ?? 0
    const price = finiteNumber(row.price) ?? 0
    const commerceType = resolveTicketCommerceType({
      ticket_type: row.ticket_type,
      tier_type: row.tier_type,
      category: row.category,
      layout_type: row.layout_type,
      name: row.name,
    })
    const inserted = {
      id: tierId,
      name: row.name?.trim() || "Entrada",
      price,
      capacity,
      sold,
      time_limit: null,
      bonus_reward: null,
      day_id: row.day_id ?? null,
      visibility: "public" as const,
      layout_type: (row.layout_type === "numbered_seat" ||
      row.layout_type === "table_combo"
        ? row.layout_type
        : "general") as "general" | "numbered_seat" | "table_combo",
      seating_sector_id: row.seating_sector_id ?? null,
      capacity_per_unit: 1,
      category: (row.category ??
        (commerceType === "extra" ? "special" : "standard")) as
        | "standard"
        | "special"
        | "bundle",
      list_price: row.list_price ?? null,
      tier_type: (row.tier_type ??
        (commerceType === "extra"
          ? "addon"
          : commerceType === "combo"
            ? "bundle"
            : "general")) as "general" | "seated" | "bundle" | "addon",
      ticket_type: commerceType,
      bundle_items: [],
      bundle_type: null,
      description: null,
      highlight_badge: null,
      sale_starts_at: null,
      sale_ends_at: null,
      available: Math.max(0, capacity - sold),
      phases: [],
    }
    return {
      ...event,
      tiers: [...event.tiers, inserted],
    }
  }

  const current = event.tiers[idx]!
  const capacity = finiteNumber(row.capacity) ?? current.capacity
  const sold = finiteNumber(row.sold) ?? current.sold
  const price = finiteNumber(row.price) ?? current.price
  const skuRemaining = Math.max(0, capacity - sold)
  const previousSku = Math.max(0, current.capacity - current.sold)
  const soldDelta = sold - current.sold
  const nextTiers = [...event.tiers]
  nextTiers[idx] = {
    ...current,
    name: row.name?.trim() || current.name,
    price,
    capacity,
    sold,
    available:
      current.available < previousSku
        ? Math.max(0, current.available - Math.max(0, soldDelta))
        : skuRemaining,
    visibility:
      row.visibility === "public" || row.visibility === "private"
        ? row.visibility
        : current.visibility,
    day_id: row.day_id === undefined ? current.day_id : row.day_id,
    list_price:
      row.list_price === undefined ? current.list_price : row.list_price,
    seating_sector_id:
      row.seating_sector_id === undefined
        ? current.seating_sector_id
        : row.seating_sector_id,
    ticket_type:
      row.ticket_type === undefined &&
      row.tier_type === undefined &&
      row.category === undefined
        ? current.ticket_type
        : resolveTicketCommerceType({
            ticket_type: row.ticket_type ?? current.ticket_type,
            tier_type: row.tier_type ?? current.tier_type,
            category: row.category ?? current.category,
            layout_type: row.layout_type ?? current.layout_type,
            name: row.name ?? current.name,
          }),
    tier_type:
      row.tier_type === undefined
        ? current.tier_type
        : (row.tier_type as typeof current.tier_type),
    category:
      row.category === undefined
        ? current.category
        : (row.category as typeof current.category),
    layout_type:
      row.layout_type === undefined
        ? current.layout_type
        : row.layout_type === "numbered_seat" ||
            row.layout_type === "table_combo"
          ? row.layout_type
          : current.layout_type,
  }

  return {
    ...event,
    tiers: nextTiers,
    zoneTierPricing: event.zoneTierPricing.map((item) =>
      item.ticketTierId === tierId ? { ...item, price } : item,
    ),
  }
}
