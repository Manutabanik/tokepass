import {
  computeEventCapacity,
  eventCapacityOverflowMessage,
  type EventCapacitySnapshot,
} from "@/lib/inventory/capacity-budget"
import { venueMapCapacity } from "@/lib/seating/venue-map-geometry"
import type { EventFormValues } from "@/lib/validations/event-form"
import { parseVenueMap } from "@/types/venue-map"

export type CapacityThermometerSnapshot = {
  generalStock: number
  mapCapacity: number
  used: number
  venueMax: number
  remaining: number
  ratio: number
  overCapacity: boolean
  overflow: number
}

export function capacityThermometerFromSnapshot(
  snap: EventCapacitySnapshot,
): CapacityThermometerSnapshot {
  const venueMax = snap.effectiveMaxCapacity
  const used = snap.totalAllocated
  return {
    generalStock: snap.generalAllocatedCapacity,
    mapCapacity: snap.mapAllocatedCapacity,
    used,
    venueMax,
    remaining: snap.remaining,
    ratio: venueMax > 0 ? used / venueMax : 0,
    overCapacity: snap.exceeded,
    overflow: snap.overflow,
  }
}

export function computeCapacityThermometer(input: {
  tickets?: EventFormValues["tickets"] | null
  venueMap?: unknown
  venueCapacity?: number | null
  customMaxCapacity?: number | null
  hasSeatingPlan?: boolean
  zones?: EventFormValues["venue"]["zones"] | null
}): CapacityThermometerSnapshot {
  const includeMap = input.hasSeatingPlan !== false
  const snap = computeEventCapacity({
    tickets: input.tickets,
    venueMap: includeMap ? input.venueMap : null,
    zones: includeMap ? input.zones : null,
    hasSeatingPlan: input.hasSeatingPlan,
    baseVenueCapacity: input.venueCapacity,
    customMaxCapacity: input.customMaxCapacity,
  })
  return capacityThermometerFromSnapshot(snap)
}
