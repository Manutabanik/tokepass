import { canPersistCatalogVenueName } from "@/lib/venues/venue-identity"
import type {
  DraftEventFormValues,
  EventFormValues,
} from "@/lib/validations/event-form"

type InventoryOrVenueForm = Pick<
  EventFormValues | DraftEventFormValues,
  "tickets" | "venue"
>

function ticketLooksConfigured(
  tier:
    | EventFormValues["tickets"][number]
    | DraftEventFormValues["tickets"][number]
    | null
    | undefined,
): boolean {
  if (!tier) return false
  if ((tier.name ?? "").trim().length >= 2) return true
  if (Number(tier.price) > 0) return true
  if ((tier.seatingSectorId ?? "").trim()) return true
  if (tier.layoutType === "table_combo" || tier.layoutType === "numbered_seat") {
    return true
  }
  const capacity = Number(tier.capacity)
  return Number.isFinite(capacity) && capacity > 1
}

function venueMapLooksConfigured(venueMap: unknown): boolean {
  if (!venueMap || typeof venueMap !== "object") return false
  const raw = venueMap as {
    elements?: unknown[]
    zones?: unknown[]
    sectors?: unknown[]
  }
  return (
    (Array.isArray(raw.elements) && raw.elements.length > 0) ||
    (Array.isArray(raw.zones) && raw.zones.length > 0) ||
    (Array.isArray(raw.sectors) && raw.sectors.length > 0)
  )
}

/** True si el organizador ya cargó recinto o entradas: no recortar a identity-only. */
export function formHasInventoryOrVenue(
  values: InventoryOrVenueForm | null | undefined,
): boolean {
  if (!values) return false
  const venue = values.venue
  if (venue) {
    if ((venue.existingVenueId ?? "").trim()) return true
    if (canPersistCatalogVenueName(venue.venueName)) return true
    if (venue.includesSeatingMap) return true
    if ((venue.zones ?? []).length > 0) return true
    if (venueMapLooksConfigured(venue.venueMap)) return true
  }
  return (values.tickets ?? []).some((tier) => ticketLooksConfigured(tier))
}

export function eventInventoryFingerprint(values: EventFormValues): string {
  return JSON.stringify({
    venueMap: values.venue?.venueMap ?? null,
    seatingLayout: values.venue?.seatingLayout ?? null,
    existingVenueId: values.venue?.existingVenueId ?? null,
    zones: values.venue?.zones ?? null,
    includesSeatingMap: Boolean(values.venue?.includesSeatingMap),
    tickets: (values.tickets ?? []).map((tier) => ({
      id: tier.id ?? null,
      seatingSectorId: tier.seatingSectorId ?? null,
      layoutType: tier.layoutType,
      capacityPerUnit: tier.capacityPerUnit,
      capacity: tier.capacity,
      name: tier.name,
      price: Number.isFinite(Number(tier.price)) ? Number(tier.price) : 0,
      visibility: tier.visibility ?? "public",
      dayId: tier.dayId ?? null,
      tierType: tier.tierType ?? null,
      bundleType: tier.bundleType ?? null,
    })),
  })
}
