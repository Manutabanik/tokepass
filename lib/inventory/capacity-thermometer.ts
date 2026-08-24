import {
  asPositiveInt,
  occupiesGeneralCapacity,
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

export function computeCapacityThermometer(input: {
  tickets?: EventFormValues["tickets"] | null
  venueMap?: unknown
  venueCapacity?: number | null
  customMaxCapacity?: number | null
}): CapacityThermometerSnapshot {
  const tickets = input.tickets ?? []
  const mapCapacity = venueMapCapacity(parseVenueMap(input.venueMap))
  const generalStock = tickets.reduce((sum, tier) => {
    if (!occupiesGeneralCapacity(tier, tickets)) return sum
    return sum + asPositiveInt(tier.capacity)
  }, 0)
  const used = mapCapacity + generalStock
  const venueMax =
    asPositiveInt(input.customMaxCapacity) || asPositiveInt(input.venueCapacity)
  const overflow = venueMax > 0 ? Math.max(0, used - venueMax) : 0
  const remaining = venueMax > 0 ? Math.max(0, venueMax - used) : 0
  return {
    generalStock,
    mapCapacity,
    used,
    venueMax,
    remaining,
    ratio: venueMax > 0 ? used / venueMax : 0,
    overCapacity: overflow > 0,
    overflow,
  }
}
