import type { InteractiveVenueMap, VenueMapElement, VenueMapZone } from "@/types/venue-map"
import { isSellableElement, venueUnitPriceLabel } from "@/types/venue-map"
import {
  parametricZoneSkuUnitCount,
  parametricZoneSkuUnitLabel,
} from "@/lib/seating/adaptive-seating"

export type VenuePriceGroup = {
  key: string
  name: string
  color: string
  count: number
  unit: string
  price: number
  priceHint: string
  match:
    | { kind: "sector"; id: string }
    | { kind: "group"; groupId: string }
    | { kind: "ids"; ids: string[] }
    | { kind: "zone"; id: string }
}

function zonePriceHint(zone: VenueMapZone): string {
  return venueUnitPriceLabel({
    layoutType: zone.layoutType,
    sellMode: zone.sellMode,
    priceMode: zone.priceMode,
  })
}

function furniturePriceHint(elements: VenueMapElement[]): string {
  const head = elements[0]
  if (!head) return "Precio"
  return venueUnitPriceLabel({
    type: head.type,
    sellMode: head.sellMode,
    priceMode: head.priceMode,
  })
}

function furnitureUnit(elements: VenueMapElement[]): { count: number; unit: string } {
  if (elements.every((item) => item.type === "standing_zone")) {
    const count = elements.reduce(
      (sum, item) => sum + Math.max(1, item.capacity || 0),
      0,
    )
    return { count, unit: count === 1 ? "lugar" : "lugares" }
  }
  if (elements.every((item) => item.type === "vip_chair")) {
    const count = elements.reduce(
      (sum, item) =>
        sum + item.seats.filter((seat) => seat.status !== "blocked").length,
      0,
    )
    return { count, unit: count === 1 ? "butaca" : "butacas" }
  }
  if (elements.every((item) => item.type === "vip_box")) {
    return {
      count: elements.length,
      unit: elements.length === 1 ? "box" : "boxes",
    }
  }
  if (
    elements.every(
      (item) => item.type === "round_table" || item.type === "long_table",
    )
  ) {
    return {
      count: elements.length,
      unit: elements.length === 1 ? "mesa" : "mesas",
    }
  }
  const count = elements.length
  return { count, unit: count === 1 ? "lugar" : "lugares" }
}

export function listVenuePriceGroups(
  map: InteractiveVenueMap,
): VenuePriceGroup[] {
  const groups: VenuePriceGroup[] = []

  for (const sector of map.sectors) {
    const count = sector.seats.filter((seat) => seat.status !== "blocked").length
    groups.push({
      key: `sector:${sector.id}`,
      name: sector.name,
      color: sector.color,
      count,
      unit: count === 1 ? "butaca" : "butacas",
      price: sector.price,
      priceHint: "Precio por butaca",
      match: { kind: "sector", id: sector.id },
    })
  }

  for (const zone of map.zones ?? []) {
    const count = parametricZoneSkuUnitCount(zone)
    groups.push({
      key: `zone:${zone.id}`,
      name: zone.name,
      color: zone.color,
      count,
      unit: parametricZoneSkuUnitLabel(zone, count),
      price: zone.price,
      priceHint: zonePriceHint(zone),
      match: { kind: "zone", id: zone.id },
    })
  }

  const buckets = new Map<string, VenueMapElement[]>()
  for (const element of map.elements ?? []) {
    if (!isSellableElement(element)) continue
    const grouped = element.groupId?.trim()
    const key = grouped
      ? `group:${grouped}`
      : `solo:${element.type}:${element.color}:${element.sectorName}`
    const list = buckets.get(key) ?? []
    list.push(element)
    buckets.set(key, list)
  }

  for (const [key, members] of buckets) {
    const head = members[0]!
    const { count, unit } = furnitureUnit(members)
    const grouped = head.groupId?.trim()
    groups.push({
      key,
      name: grouped
        ? head.groupName?.trim() || head.sectorName
        : head.sectorName || head.label,
      color: head.color,
      count,
      unit,
      price: head.price,
      priceHint: furniturePriceHint(members),
      match: grouped
        ? { kind: "group", groupId: grouped }
        : { kind: "ids", ids: members.map((item) => item.id) },
    })
  }

  return groups
}

export function applyVenuePriceGroup(
  map: InteractiveVenueMap,
  group: VenuePriceGroup,
  price: number,
): InteractiveVenueMap {
  const nextPrice = Math.max(0, Number.isFinite(price) ? price : 0)
  if (group.match.kind === "sector") {
    const sectorId = group.match.id
    return {
      ...map,
      sectors: map.sectors.map((sector) =>
        sector.id === sectorId ? { ...sector, price: nextPrice } : sector,
      ),
    }
  }

  if (group.match.kind === "zone") {
    const zoneId = group.match.id
    return {
      ...map,
      zones: (map.zones ?? []).map((zone) =>
        zone.id === zoneId ? { ...zone, price: nextPrice } : zone,
      ),
    }
  }

  const ids =
    group.match.kind === "ids"
      ? new Set(group.match.ids)
      : null
  const groupId = group.match.kind === "group" ? group.match.groupId : null

  return {
    ...map,
    elements: (map.elements ?? []).map((element) => {
      const hit = groupId
        ? element.groupId === groupId
        : ids?.has(element.id)
      return hit ? { ...element, price: nextPrice } : element
    }),
  }
}
