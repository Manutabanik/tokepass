import {
  assignableGeneralSectorCapacity,
  listAssignableGeneralSectors,
} from "@/lib/inventory/logical-sectors"
import { inferInventoryTierType, isAddonInventoryTicket } from "@/lib/inventory/unified-inventory"
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
  zones?: EventFormValues["venue"]["zones"] | null
  hasSeatingPlan?: boolean
  baseVenueCapacity?: number | null
  customMaxCapacity?: number | null
  exceptTicketIndex?: number
}

export type EventCapacitySnapshot = {
  mapAllocatedCapacity: number
  generalSectorCapacity: number
  unboundGeneralCapacity: number
  generalAllocatedCapacity: number
  totalAllocated: number
  totalCapacity: number
  baseVenueCapacity: number
  customMaxCapacity: number | null
  effectiveMaxCapacity: number
  remaining: number
  overflow: number
  exceeded: boolean
}

/** Firma reactiva: cambia cuando se edita el cupo, no cuando solo cambia el length del array. */
export function ticketInventorySignature(
  tickets: readonly CapacityTicket[] | null | undefined,
): string {
  return (tickets ?? [])
    .map((tier) =>
      [
        asPositiveInt(tier.capacity),
        tier.tierType ?? "",
        tier.layoutType ?? "",
        (tier.seatingSectorId ?? "").trim(),
      ].join(":"),
    )
    .join("|")
}

export function asPositiveInt(value: unknown): number {
  if (value === "" || value == null) return 0
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

export function parseStrictInt(raw: string): number | "" {
  const trimmed = raw.trim()
  if (trimmed === "") return ""
  if (!/^\d+$/.test(trimmed)) return Number.NaN
  const val = Number.parseInt(trimmed, 10)
  return Number.isFinite(val) ? val : Number.NaN
}

export function parseStrictPrice(raw: string): number | "" {
  const trimmed = raw.trim().replace(",", ".")
  if (trimmed === "" || trimmed === ".") return ""
  const val = Number.parseFloat(trimmed)
  return Number.isFinite(val) && val >= 0 ? val : Number.NaN
}

export function ticketPhasesExceedParent(tier: {
  capacity?: unknown
  phases?: TicketPhaseDraft[] | null
}): boolean {
  const phases = tier.phases ?? []
  if (phases.length === 0) return false
  return phaseLimitSum(phases) > asPositiveInt(tier.capacity)
}

export function ticketsHavePhaseOverflow(
  tickets: readonly { capacity?: unknown; phases?: TicketPhaseDraft[] | null }[] = [],
): boolean {
  return tickets.some((tier) => ticketPhasesExceedParent(tier))
}

/** Stock general del predio. Excluye adicionales, combos y mapa. */
export function occupiesGeneralCapacity(
  tier: CapacityTicket,
  _tickets: readonly CapacityTicket[] = [],
): boolean {
  if (isMapBackedTicket(tier)) return false
  if (isAddonInventoryTicket(tier)) return false
  const type = inferInventoryTierType({
    tierType: tier.tierType,
    layoutType: tier.layoutType,
    bundleItems: tier.bundleItems,
  })
  if (type === "addon" || type === "seated" || type === "bundle") return false
  return type === "general"
}

/** Suma de stock que ocupa aforo físico del recinto (solo entradas generales). */
export function sumVenueOccupyingTicketStock(
  tickets: readonly CapacityTicket[] = [],
): number {
  return tickets.reduce((sum, tier) => {
    if (!occupiesGeneralCapacity(tier, tickets)) return sum
    return sum + asPositiveInt(tier.capacity)
  }, 0)
}

export function occupiesVenueBudget(
  tier: CapacityTicket,
  tickets: readonly CapacityTicket[] = [],
): boolean {
  return occupiesGeneralCapacity(tier, tickets)
}

/** Master Manifest: mapa + SKUs sin sector + sectores GA. Espejo de `event_manifest_capacity`. */
export function computeEventCapacity(
  input: EventCapacityInput,
): EventCapacitySnapshot {
  const tickets: readonly CapacityTicket[] = input.tickets ?? []
  const includeMap = input.hasSeatingPlan !== false
  const mapAllocatedCapacity = includeMap
    ? venueMapCapacity(parseVenueMap(input.venueMap))
    : 0
  const declaredSectors = includeMap
    ? listAssignableGeneralSectors(input.zones, input.venueMap)
    : []
  const declaredSectorCapacity = includeMap
    ? assignableGeneralSectorCapacity(input.zones, input.venueMap)
    : 0
  const declaredIds = new Set(declaredSectors.map((sector) => sector.id))

  const generalAllocatedCapacity = sumVenueOccupyingTicketStock(
    input.exceptTicketIndex == null
      ? tickets
      : tickets.filter((_, index) => index !== input.exceptTicketIndex),
  )

  const sectorOverflow = declaredSectors.reduce((sum, sector) => {
    const allocated = tickets.reduce((inner, tier, index) => {
      if (input.exceptTicketIndex != null && index === input.exceptTicketIndex) {
        return inner
      }
      if (!occupiesGeneralCapacity(tier, tickets)) return inner
      if ((tier.seatingSectorId ?? "").trim() !== sector.id) return inner
      return inner + asPositiveInt(tier.capacity)
    }, 0)
    return sum + Math.max(0, allocated - sector.capacity)
  }, 0)

  const unboundGeneral = tickets.reduce((sum, tier, index) => {
    if (input.exceptTicketIndex != null && index === input.exceptTicketIndex) {
      return sum
    }
    if (!occupiesGeneralCapacity(tier, tickets)) return sum
    const sectorId = (tier.seatingSectorId ?? "").trim()
    if (sectorId && declaredIds.has(sectorId)) return sum
    return sum + asPositiveInt(tier.capacity)
  }, 0)

  const generalSectorCapacity = declaredSectorCapacity
  const derivedCapacity =
    mapAllocatedCapacity + declaredSectorCapacity + unboundGeneral
  const declaredVenueCapacity = asPositiveInt(input.baseVenueCapacity)
  const customMaxCapacity = asPositiveInt(input.customMaxCapacity)
  const venueCeiling = customMaxCapacity || declaredVenueCapacity
  const totalAllocated = mapAllocatedCapacity + generalAllocatedCapacity
  const totalCapacity = venueCeiling > 0 ? venueCeiling : derivedCapacity
  const venueOverflow =
    venueCeiling > 0 ? Math.max(0, totalAllocated - venueCeiling) : 0
  const overflow = Math.max(sectorOverflow, venueOverflow)
  const remaining = Math.max(0, totalCapacity - totalAllocated)

  return {
    mapAllocatedCapacity,
    generalSectorCapacity,
    unboundGeneralCapacity: unboundGeneral,
    generalAllocatedCapacity,
    totalAllocated,
    totalCapacity,
    baseVenueCapacity: declaredVenueCapacity || derivedCapacity,
    customMaxCapacity: customMaxCapacity > 0 ? customMaxCapacity : null,
    effectiveMaxCapacity: venueCeiling || derivedCapacity,
    remaining,
    overflow,
    exceeded: overflow > 0,
  }
}

export function computeEventCapacityFromForm(
  values:
    | Pick<EventFormValues, "tickets" | "venue">
    | EventFormValues
    | null
    | undefined,
): EventCapacitySnapshot {
  const hasSeatingPlan =
    values && "basics" in values
      ? Boolean((values as EventFormValues).basics?.hasSeatingPlan)
      : undefined
  return computeEventCapacity({
    tickets: values?.tickets,
    venueMap: hasSeatingPlan === false ? null : values?.venue?.venueMap,
    zones: hasSeatingPlan === false ? null : values?.venue?.zones,
    hasSeatingPlan,
    baseVenueCapacity: values?.venue?.capacity,
    customMaxCapacity: values?.venue?.customMaxCapacity,
  })
}

export function eventCapacityOverflowMessage(
  snapshot: EventCapacitySnapshot,
): string {
  const venueOver =
    snapshot.effectiveMaxCapacity > 0
      ? Math.max(0, snapshot.totalAllocated - snapshot.effectiveMaxCapacity)
      : 0
  if (venueOver > 0 && venueOver >= snapshot.overflow) {
    return `El stock supera el aforo del recinto por ${snapshot.overflow} lugares.`
  }
  return `El stock de un sector supera su cupo (${snapshot.overflow} lugares). Bajá el stock o ampliá ese sector.`
}

export function generalRemainingForTicket(
  snapshot: EventCapacitySnapshot,
  tier: CapacityTicket | undefined,
  tickets: readonly CapacityTicket[],
  sectorCapacity?: number | null,
): number {
  if (!tier || !occupiesGeneralCapacity(tier, tickets)) {
    return snapshot.remaining
  }
  const stock = asPositiveInt(tier.capacity)
  if (sectorCapacity != null && sectorCapacity > 0) {
    const others = tickets.reduce((sum, current) => {
      if (current === tier) return sum
      if (!occupiesGeneralCapacity(current, tickets)) return sum
      if ((current.seatingSectorId ?? "") !== (tier.seatingSectorId ?? "")) {
        return sum
      }
      return sum + asPositiveInt(current.capacity)
    }, 0)
    return Math.max(0, sectorCapacity - others)
  }
  return Math.max(
    0,
    snapshot.effectiveMaxCapacity - (snapshot.totalAllocated - stock),
  )
}

export function venueCapacityBudget(
  _venueCapacity: number | undefined,
  tickets: readonly CapacityTicket[],
  exceptIndex?: number,
  extras?: {
    venueMap?: unknown
    customMaxCapacity?: number | null
    zones?: EventFormValues["venue"]["zones"]
  },
) {
  const snapshot = computeEventCapacity({
    tickets,
    venueMap: extras?.venueMap,
    zones: extras?.zones,
    exceptTicketIndex: exceptIndex,
    baseVenueCapacity: _venueCapacity,
    customMaxCapacity: extras?.customMaxCapacity,
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
