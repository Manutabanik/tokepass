import { eventNeedsInteractiveCanvas } from "@/lib/seating/venue-map-pricing"
import { hasInteractiveVenueMap } from "@/lib/seating/venue-map-geometry"
import { parseVenueMap } from "@/types/venue-map"
import type { EventDetails } from "@/app/actions/public-events"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"

export type EventCatalogEventRow = {
  id?: string
  title?: string
  description?: string | null
  status?: EventDetails["status"]
  location?: string
  image_url?: string | null
  flyer_url?: string | null
  venue_map?: unknown
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
  return {
    ...(row.name?.trim() ? { name: row.name.trim() } : {}),
    ...(price != null ? { price } : {}),
    ...(capacity != null ? { capacity } : {}),
    ...(sold != null ? { sold } : {}),
    ...(available != null ? { available } : {}),
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
  const next: EventDetails = {
    ...event,
    ...(title ? { title } : {}),
    ...(row.description !== undefined ? { description: row.description } : {}),
    ...(typeof row.location === "string" ? { location: row.location } : {}),
    ...(row.image_url !== undefined
      ? { imageUrl: row.image_url ?? row.flyer_url ?? event.imageUrl }
      : {}),
    ...(row.status ? { status: row.status } : {}),
  }

  if (row.venue_map === undefined || !event.venue) return next
  const parsed = parseVenueMap(row.venue_map)
  if (!hasInteractiveVenueMap(parsed) && event.venue.venue_map) {
    return next
  }
  return {
    ...next,
    hasInteractiveMap: eventNeedsInteractiveCanvas(parsed, next.tiers),
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

  if (change === "DELETE") {
    return {
      ...event,
      tiers: event.tiers.filter((tier) => tier.id !== tierId),
      zoneTierPricing: event.zoneTierPricing.filter(
        (item) => item.ticketTierId !== tierId,
      ),
    }
  }

  const idx = event.tiers.findIndex((tier) => tier.id === tierId)
  if (idx < 0) return event

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
