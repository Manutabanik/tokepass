import { parametricZoneCapacity } from "@/lib/seating/adaptive-seating"
import { venueMapCapacity, venueMapHasInventory } from "@/lib/seating/venue-map-geometry"
import { listVenuePriceGroups, type VenuePriceGroup } from "@/lib/seating/venue-price-groups"
import {
  isSellableElement,
  type InteractiveVenueMap,
  type VenueMapElement,
} from "@/types/venue-map"

export type VenueInventorySectorRow = {
  id: string
  name: string
  color: string
  unitCount: number
  unitLabel: string
  people: number
  price: number
}

export type VenueInventoryDashboard = {
  hasInventory: boolean
  capacity: number
  elementCount: number
  elementLabel: string
  sectorCount: number
  sectorLabel: string
  sectors: VenueInventorySectorRow[]
}

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many
}

function elementPeople(element: VenueMapElement): number {
  if (element.type === "standing_zone") {
    return Math.max(0, Math.floor(element.capacity) || 0)
  }
  const seats = element.seats.filter((seat) => seat.status !== "blocked").length
  if (element.sellMode === "group") {
    return Math.max(1, seats || Math.floor(element.capacity) || 0)
  }
  return seats
}

function peopleForGroup(
  map: InteractiveVenueMap,
  group: VenuePriceGroup,
): number {
  if (group.match.kind === "sector") {
    const sectorId = group.match.id
    const sector = map.sectors.find((item) => item.id === sectorId)
    return sector
      ? sector.seats.filter((seat) => seat.status !== "blocked").length
      : 0
  }
  if (group.match.kind === "zone") {
    const zoneId = group.match.id
    const zone = (map.zones ?? []).find((item) => item.id === zoneId)
    return zone ? parametricZoneCapacity(zone) : 0
  }
  const ids =
    group.match.kind === "ids" ? new Set(group.match.ids) : null
  const groupId = group.match.kind === "group" ? group.match.groupId : null
  return (map.elements ?? []).reduce((sum, element) => {
    if (!isSellableElement(element)) return sum
    const hit = groupId
      ? element.groupId === groupId
      : Boolean(ids?.has(element.id))
    return hit ? sum + elementPeople(element) : sum
  }, 0)
}

function physicalElements(map: InteractiveVenueMap) {
  const sellable = (map.elements ?? []).filter(isSellableElement)
  const tables = sellable.filter(
    (item) => item.type === "round_table" || item.type === "long_table",
  )
  const chairs = sellable.filter((item) => item.type === "vip_chair")
  if (sellable.length === 0) {
    return { count: 0, label: "Elementos" }
  }
  if (tables.length === sellable.length) {
    return { count: tables.length, label: plural(tables.length, "Mesa", "Mesas") }
  }
  if (chairs.length === sellable.length) {
    return {
      count: chairs.length,
      label: plural(chairs.length, "Butaca", "Butacas"),
    }
  }
  return {
    count: sellable.length,
    label: plural(sellable.length, "Elemento", "Elementos"),
  }
}

export function summarizeVenueInventory(
  map: InteractiveVenueMap | null | undefined,
): VenueInventoryDashboard {
  if (!map || !venueMapHasInventory(map)) {
    return {
      hasInventory: false,
      capacity: 0,
      elementCount: 0,
      elementLabel: "Elementos",
      sectorCount: 0,
      sectorLabel: "Sectores",
      sectors: [],
    }
  }

  const groups = listVenuePriceGroups(map)
  const elements = physicalElements(map)
  const zoneOnly =
    groups.length > 0 && groups.every((group) => group.match.kind === "zone")

  return {
    hasInventory: true,
    capacity: venueMapCapacity(map),
    elementCount: elements.count,
    elementLabel: elements.label,
    sectorCount: groups.length,
    sectorLabel: zoneOnly
      ? plural(groups.length, "Zona", "Zonas")
      : plural(groups.length, "Sector", "Sectores"),
    sectors: groups.map((group) => ({
      id: group.key,
      name: group.name,
      color: group.color,
      unitCount: group.count,
      unitLabel: group.unit,
      people: peopleForGroup(map, group),
      price: group.price,
    })),
  }
}
