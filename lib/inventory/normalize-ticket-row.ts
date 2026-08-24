import type { EventFormValues } from "@/lib/validations/event-form"

export function normalizeTicketRow(
  ticket: EventFormValues["tickets"][number],
): EventFormValues["tickets"][number] {
  const capacity = Number(ticket.capacity)
  const price = Number(ticket.price)
  const basePrice = Number(ticket.basePrice)
  const minPurchaseLimit = Number(ticket.minPurchaseLimit)
  const maxPurchaseLimit =
    ticket.maxPurchaseLimit == null ? null : Number(ticket.maxPurchaseLimit)

  return {
    ...ticket,
    name: (ticket.name ?? "").trim(),
    capacity: Number.isFinite(capacity) ? capacity : 0,
    price: Number.isFinite(price) ? price : 0,
    basePrice: Number.isFinite(basePrice) ? basePrice : 0,
    minPurchaseLimit: Number.isFinite(minPurchaseLimit)
      ? Math.max(1, Math.floor(minPurchaseLimit))
      : 1,
    maxPurchaseLimit:
      maxPurchaseLimit != null && Number.isFinite(maxPurchaseLimit)
        ? Math.max(1, Math.floor(maxPurchaseLimit))
        : null,
  }
}
