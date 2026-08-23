import { listVenuePriceGroups } from "@/lib/seating/venue-price-groups"
import { parseVenueMap } from "@/types/venue-map"

export const EMPTY_MAP_ENABLE_ERROR =
  "Debes dibujar al menos un sector en el mapa para habilitarlo."

export function venueMapHasConfiguredSectors(map: unknown): boolean {
  return listVenuePriceGroups(parseVenueMap(map)).length > 0
}

export function seatingMapIsEnabled(input: {
  hasSeatingPlan?: boolean | null
  includesSeatingMap?: boolean | null
}): boolean {
  return Boolean(input.hasSeatingPlan) && Boolean(input.includesSeatingMap)
}
