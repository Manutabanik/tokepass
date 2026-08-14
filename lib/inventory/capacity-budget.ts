import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import { isMapBackedTicket } from "@/lib/seating/venue-map-pricing"
import type { EventFormValues } from "@/lib/validations/event-form"

export type TicketPhaseDraft = {
  id?: string
  name: string
  price: number
  capacityLimit: number
  startTime?: string | null
  endTime?: string | null
  status: "scheduled" | "active" | "sold_out"
  sold?: number
}

export function occupiesVenueBudget(
  tier: EventFormValues["tickets"][number],
): boolean {
  if (isMapBackedTicket(tier)) return true
  const type = inferInventoryTierType({
    tierType: tier.tierType,
    layoutType: tier.layoutType,
    bundleItems: tier.bundleItems,
  })
  return type === "general" || type === "seated"
}

export function venueCapacityBudget(
  venueCapacity: number | undefined,
  tickets: EventFormValues["tickets"],
  exceptIndex?: number,
) {
  const max = Math.max(0, Number(venueCapacity) || 0)
  const allocated = tickets.reduce((sum, tier, index) => {
    if (exceptIndex != null && index === exceptIndex) return sum
    if (!occupiesVenueBudget(tier)) return sum
    return sum + Math.max(0, Number(tier.capacity) || 0)
  }, 0)
  return {
    max,
    allocated,
    remaining: Math.max(0, max - allocated),
  }
}

export function phaseLimitSum(
  phases: TicketPhaseDraft[] | undefined,
  exceptIndex?: number,
) {
  return (phases ?? []).reduce((sum, phase, index) => {
    if (exceptIndex != null && index === exceptIndex) return sum
    return sum + Math.max(0, Number(phase.capacityLimit) || 0)
  }, 0)
}

export function createBlankPhase(
  index: number,
  remaining: number,
  price: number,
): TicketPhaseDraft {
  return {
    name: index === 0 ? "Preventa 1" : `Preventa ${index + 1}`,
    price: Math.max(0, price),
    capacityLimit: Math.max(1, remaining),
    startTime: null,
    endTime: null,
    status: index === 0 ? "active" : "scheduled",
    sold: 0,
  }
}
