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

export function eventHasActiveSeatingMap(input: {
  hasSeatingPlan?: boolean | null
  includesSeatingMap?: boolean | null
  venueMap?: unknown
}): boolean {
  return (
    seatingMapIsEnabled(input) && venueMapHasConfiguredSectors(input.venueMap)
  )
}

/** Deriva flags de mapa solo cuando hay sectores dibujados; si no, venta general. */
export function resolveActiveSeatingMapFlags(input: {
  hasSeatingPlan?: boolean | null
  includesSeatingMap?: boolean | null
  venueMap?: unknown
}): { hasSeatingPlan: boolean; includesSeatingMap: boolean } {
  const active = eventHasActiveSeatingMap(input)
  return {
    hasSeatingPlan: active,
    includesSeatingMap: active,
  }
}

export function ticketsReferenceMapSectors(
  tickets:
    | Array<{ seatingSectorId?: string | null } | null>
    | null
    | undefined,
): boolean {
  return Boolean(
    tickets?.some((tier) => Boolean(tier?.seatingSectorId?.trim())),
  )
}

/** SKU mapa↔entradas deshabilitado: no bloquear guardado por desajuste mapa/tickets. */
export function shouldEnforceVenueMapSku(_input: {
  hasSeatingPlan?: boolean | null
  includesSeatingMap?: boolean | null
  venueMap?: unknown
  tickets?: Array<{ seatingSectorId?: string | null } | null> | null
}): boolean {
  return false
}
