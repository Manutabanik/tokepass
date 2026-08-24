import { eventHasActiveSeatingMap } from "@/lib/inventory/map-enablement"
import {
  venueMapHasInventory,
  venueMapToSeatingLayout,
} from "@/lib/seating/venue-map-geometry"
import {
  emptyVenueMap,
  parseVenueMap,
  type InteractiveVenueMap,
} from "@/types/venue-map"

export type ResolvedVenueSeatingArtifacts = {
  mapActive: boolean
  venueMap: InteractiveVenueMap
  seatingLayout: ReturnType<typeof venueMapToSeatingLayout> | []
}

/**
 * Fuente de verdad para persistir mapa/layout: solo cuando el mapa está activo
 * (flags + sectores). Si el usuario lo desactivó, vaciamos mapa y layout aunque
 * el formulario aún traiga geometría hidratada de ediciones anteriores.
 */
export function resolveVenueSeatingArtifactsForPersist(input: {
  hasSeatingPlan?: boolean | null
  includesSeatingMap?: boolean | null
  venueMap?: unknown
  seatingLayout?: unknown
}): ResolvedVenueSeatingArtifacts {
  const mapActive = eventHasActiveSeatingMap(input)
  if (!mapActive) {
    return {
      mapActive: false,
      venueMap: emptyVenueMap(),
      seatingLayout: [],
    }
  }

  const venueMap = parseVenueMap(input.venueMap)
  return {
    mapActive: true,
    venueMap,
    seatingLayout: venueMapHasInventory(venueMap)
      ? venueMapToSeatingLayout(venueMap)
      : [],
  }
}
