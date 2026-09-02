/**
 * Fixtures de mapa de sala para los tests unitarios.
 *
 * Los tipos de `types/venue-map.ts` fueron creciendo (`labelPrefix`,
 * `showAestheticChairs`, `sideA`/`sideB`, `opacity`) y cada literal suelto en
 * un test quedaba desactualizado por su cuenta. Estas factories devuelven una
 * entidad completa y valida, y el test declara solo los campos que le
 * importan, que ademas es lo que hace legible la intencion del caso.
 */

import {
  emptyVenueMap,
  type InteractiveVenueMap,
  type VenueMapElement,
  type VenueMapSector,
  type VenueMapZone,
} from "@/types/venue-map"

export function venueZone(overrides: Partial<VenueMapZone> = {}): VenueMapZone {
  return {
    id: "zone-1",
    name: "Zona 1",
    color: "#111111",
    price: 0,
    polygon: [],
    layoutType: "general",
    sellMode: "per_seat",
    rows: 1,
    itemsPerRow: 1,
    capacityPerUnit: 1,
    capacity: 10,
    labelPrefix: "",
    ...overrides,
  }
}

export function venueElement(
  overrides: Partial<VenueMapElement> = {},
): VenueMapElement {
  return {
    id: "element-1",
    type: "round_table",
    label: "Mesa 1",
    category: "commercial",
    sectorName: "",
    x: 0,
    y: 0,
    width: 80,
    height: 80,
    rotation: 0,
    price: 0,
    color: "#111111",
    opacity: 1,
    chairCount: 0,
    sideA: 0,
    sideB: 0,
    sellMode: "per_seat",
    capacity: 1,
    seats: [],
    ...overrides,
  }
}

export function venueSector(
  overrides: Partial<VenueMapSector> = {},
): VenueMapSector {
  return {
    id: "sector-1",
    name: "Sector 1",
    color: "#111111",
    price: 0,
    x: 0,
    y: 0,
    rows: 1,
    seatsPerRow: 1,
    curvature: 0,
    aisle: false,
    seats: [],
    ...overrides,
  }
}

export function venueMap(
  overrides: Partial<InteractiveVenueMap> = {},
): InteractiveVenueMap {
  return { ...emptyVenueMap(), ...overrides }
}
