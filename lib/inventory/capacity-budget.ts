import { bundleIncludesSeating } from "@/lib/inventory/flexible-bundles"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import { venueMapCapacity } from "@/lib/seating/venue-map-geometry"
import { isMapBackedTicket } from "@/lib/seating/venue-map-pricing"
import type { EventFormValues } from "@/lib/validations/event-form"
import { parseVenueMap } from "@/types/venue-map"

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

type CapacityTicket = {
  id?: string
  capacity?: number
  tierType?: EventFormValues["tickets"][number]["tierType"]
  layoutType?: EventFormValues["tickets"][number]["layoutType"]
  seatingSectorId?: string | null
  bundleItems?: EventFormValues["tickets"][number]["bundleItems"]
}

export type EventCapacityInput = {
  tickets?: readonly CapacityTicket[] | null
  venueMap?: unknown
  baseVenueCapacity?: number | null
  customMaxCapacity?: number | null
  exceptTicketIndex?: number
}

export type EventCapacitySnapshot = {
  mapAllocatedCapacity: number
  generalAllocatedCapacity: number
  totalAllocated: number
  baseVenueCapacity: number
  customMaxCapacity: number | null
  effectiveMaxCapacity: number
  remaining: number
  overflow: number
  exceeded: boolean
}

function asPositiveInt(value: unknown): number {
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

function componentTierTypes(
  tickets: readonly CapacityTicket[],
): Record<string, string> {
  const types: Record<string, string> = {}
  for (const [index, tier] of tickets.entries()) {
    const type = inferInventoryTierType({
      tierType: tier.tierType,
      layoutType: tier.layoutType,
      bundleItems: tier.bundleItems,
    })
    if (tier.id) types[tier.id] = type
    types[`index:${index}`] = type
  }
  return types
}

/** Stock general/combo de predio. El mapa no entra: es otra cuenta. */
export function occupiesGeneralCapacity(
  tier: CapacityTicket,
  tickets: readonly CapacityTicket[] = [],
): boolean {
  if (isMapBackedTicket(tier)) return false
  const type = inferInventoryTierType({
    tierType: tier.tierType,
    layoutType: tier.layoutType,
    bundleItems: tier.bundleItems,
  })
  if (type === "addon" || type === "seated") return false
  if (type === "bundle") {
    return !bundleIncludesSeating(tier.bundleItems ?? [], componentTierTypes(tickets))
  }
  return type === "general"
}

export function occupiesVenueBudget(
  tier: CapacityTicket,
  tickets: readonly CapacityTicket[] = [],
): boolean {
  return occupiesGeneralCapacity(tier, tickets)
}

export function computeEventCapacity(
  input: EventCapacityInput,
): EventCapacitySnapshot {
  const tickets: readonly CapacityTicket[] = input.tickets ?? []
  const mapAllocatedCapacity = venueMapCapacity(parseVenueMap(input.venueMap))
  const generalAllocatedCapacity = tickets.reduce((sum, tier, index) => {
    if (input.exceptTicketIndex != null && index === input.exceptTicketIndex) {
      return sum
    }
    if (!occupiesGeneralCapacity(tier, tickets)) return sum
    return sum + asPositiveInt(tier.capacity)
  }, 0)
  const totalAllocated = mapAllocatedCapacity + generalAllocatedCapacity
  const baseVenueCapacity = asPositiveInt(input.baseVenueCapacity)
  const customRaw = input.customMaxCapacity
  const customMaxCapacity =
    customRaw == null || customRaw === undefined
      ? null
      : asPositiveInt(customRaw)
  const effectiveMaxCapacity = Math.max(
    baseVenueCapacity,
    customMaxCapacity ?? 0,
  )
  const overflow =
    effectiveMaxCapacity > 0
      ? Math.max(0, totalAllocated - effectiveMaxCapacity)
      : 0
  const remaining =
    effectiveMaxCapacity > 0
      ? Math.max(0, effectiveMaxCapacity - totalAllocated)
      : 0

  return {
    mapAllocatedCapacity,
    generalAllocatedCapacity,
    totalAllocated,
    baseVenueCapacity,
    customMaxCapacity,
    effectiveMaxCapacity,
    remaining,
    overflow,
    exceeded: effectiveMaxCapacity > 0 && totalAllocated > effectiveMaxCapacity,
  }
}

export function computeEventCapacityFromForm(
  values:
    | Pick<EventFormValues, "tickets" | "venue">
    | EventFormValues
    | null
    | undefined,
): EventCapacitySnapshot {
  return computeEventCapacity({
    tickets: values?.tickets,
    venueMap: values?.venue?.venueMap,
    baseVenueCapacity: values?.venue?.capacity,
    customMaxCapacity: values?.venue?.customMaxCapacity,
  })
}

export function eventCapacityOverflowMessage(
  snapshot: EventCapacitySnapshot,
): string {
  return `El stock asignado (${snapshot.totalAllocated}) supera el aforo del recinto (${snapshot.effectiveMaxCapacity}). Excedido por ${snapshot.overflow} lugares.`
}

export function generalRemainingForTicket(
  snapshot: EventCapacitySnapshot,
  tier: CapacityTicket | undefined,
  tickets: readonly CapacityTicket[],
): number {
  if (!tier || !occupiesGeneralCapacity(tier, tickets)) {
    return snapshot.remaining
  }
  const stock = asPositiveInt(tier.capacity)
  return Math.max(
    0,
    snapshot.effectiveMaxCapacity - (snapshot.totalAllocated - stock),
  )
}

export function venueCapacityBudget(
  venueCapacity: number | undefined,
  tickets: readonly CapacityTicket[],
  exceptIndex?: number,
  extras?: {
    venueMap?: unknown
    customMaxCapacity?: number | null
  },
) {
  const snapshot = computeEventCapacity({
    tickets,
    venueMap: extras?.venueMap,
    baseVenueCapacity: venueCapacity,
    customMaxCapacity: extras?.customMaxCapacity,
    exceptTicketIndex: exceptIndex,
  })
  return {
    max: snapshot.effectiveMaxCapacity,
    allocated: snapshot.totalAllocated,
    remaining: snapshot.remaining,
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
