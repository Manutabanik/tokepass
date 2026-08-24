import { eventNeedsInteractiveCanvas } from "@/lib/seating/venue-map-pricing"
import { hasInteractiveVenueMap } from "@/lib/seating/venue-map-geometry"
import { parseScheduleDays } from "@/lib/event-schedule"
import {
  eventAcceptsBankTransfer,
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
  accepts_bank_transfer?: boolean | null
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
    ...(row.accepts_bank_transfer !== undefined
      ? {
          acceptsBankTransfer: eventAcceptsBankTransfer(
            row.accepts_bank_transfer,
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
      event.hasInteractiveMap &&
      eventNeedsInteractiveCanvas(parsed, next.tiers),
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
    const capacity = finiteNumber(row.capacity) ?? 0
    const sold = finiteNumber(row.sold) ?? 0
    const price = finiteNumber(row.price) ?? 0
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
      layout_type: "general" as const,
      seating_sector_id: row.seating_sector_id ?? null,
      capacity_per_unit: 1,
      category: "standard" as const,
      list_price: row.list_price ?? null,
      tier_type: "general" as const,
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
  const nextTiers = [...event.tiers]
  nextTiers[idx] = {
    ...current,
    name: row.name?.trim() || current.name,
    price,
    capacity,
    sold,
    available: Math.max(0, capacity - sold),
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
  }

  return {
    ...event,
    tiers: nextTiers,
    zoneTierPricing: event.zoneTierPricing.map((item) =>
      item.ticketTierId === tierId ? { ...item, price } : item,
    ),
  }
}
