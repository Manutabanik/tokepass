import type { EventFormValues } from "@/lib/validations/event-form"

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
      price: tier.price,
    })),
  })
}
