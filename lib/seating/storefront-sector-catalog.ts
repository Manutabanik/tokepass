import { firstValidPublicPrice } from "@/lib/checkout/public-price"
import {
  isTablePurchaseSku,
  resolveElementPublicPrice,
  resolveVenueUnitPrice,
  storefrontElementSectorId,
  venueElementSelectionName,
} from "@/lib/seating/storefront-selection"
import { elementBelongsToZone } from "@/lib/seating/venue-map-lod"
import {
  lookupOccupancyStatus,
  resolveLiveVenueSeatStatus,
} from "@/lib/seating/venue-map-occupancy"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import type { StorefrontSelectedItem } from "@/lib/stores/storefront-seat-store"
import {
  isSellableElement,
  type InteractiveVenueMap,
  type VenueMapElement,
} from "@/types/venue-map"

export type StorefrontSectorOptionKind = "table" | "seat" | "ga"

export type StorefrontSectorOption = {
  id: string
  kind: StorefrontSectorOptionKind
  label: string
  price: number
  selected: boolean
  available: boolean
}

export type StorefrontSectorCatalog = {
  id: string
  name: string
  color: string
  kind: "reserved" | "ga"
  price: number
  options: StorefrontSectorOption[]
}

function isSelected(
  selectedIds: Set<string>,
  id: string,
): boolean {
  return selectedIds.has(id)
}

function optionStatus(input: {
  mapStatus?: string
  occupancy?: SeatStatus
  selected: boolean
}): { selected: boolean; available: boolean } {
  const live = resolveLiveVenueSeatStatus({
    mapStatus: input.mapStatus === "blocked" ? "blocked" : "available",
    occupancy: input.occupancy,
    selected: input.selected,
  })
  return {
    selected: live === "selected" || input.selected,
    available: live === "available" || live === "selected",
  }
}

function optionFromElement(input: {
  element: VenueMapElement
  map: InteractiveVenueMap
  priceBySectorId: Record<string, number>
  occupancyBySeatId: Record<string, SeatStatus>
  selectedIds: Set<string>
}): StorefrontSectorOption | null {
  const { element } = input
  if (element.type === "standing_zone") return null
  const selected = isSelected(input.selectedIds, element.id)
  const status = optionStatus({
    occupancy: lookupOccupancyStatus(
      input.occupancyBySeatId,
      element.id,
      ...element.seats.map((seat) => seat.id),
    ),
    selected,
  })
  const tableSku = isTablePurchaseSku(element)
  return {
    id: element.id,
    kind: tableSku ? "table" : "seat",
    label: venueElementSelectionName(element) || element.label,
    price: resolveElementPublicPrice(
      element,
      input.priceBySectorId,
      input.map,
    ),
    selected: status.selected,
    available: status.available,
  }
}

function chairOptionsFromElement(input: {
  element: VenueMapElement
  map: InteractiveVenueMap
  priceBySectorId: Record<string, number>
  occupancyBySeatId: Record<string, SeatStatus>
  selectedIds: Set<string>
}): StorefrontSectorOption[] {
  const { element } = input
  if (isTablePurchaseSku(element) || element.type === "standing_zone") {
    return []
  }
  if (element.seats.length === 0) {
    const option = optionFromElement(input)
    return option ? [option] : []
  }
  return element.seats
    .filter((seat) => seat.status !== "blocked")
    .map((seat) => {
      const selected = isSelected(input.selectedIds, seat.id)
      const status = optionStatus({
        mapStatus: seat.status,
        occupancy: lookupOccupancyStatus(
          input.occupancyBySeatId,
          seat.id,
          element.id,
        ),
        selected,
      })
      return {
        id: seat.id,
        kind: "seat" as const,
        label:
          seat.customLabel?.trim() ||
          seat.label?.trim() ||
          `${element.label} · ${seat.number}`,
        price: resolveVenueUnitPrice(
          [seat.ticketTypeId, element.ticketTypeId],
          resolveElementPublicPrice(element, input.priceBySectorId, input.map),
          input.priceBySectorId,
        ),
        selected: status.selected,
        available: status.available,
      }
    })
}

function elementsInZone(
  map: InteractiveVenueMap,
  zoneId: string,
): VenueMapElement[] {
  const zone = (map.zones ?? []).find((item) => item.id === zoneId)
  return (map.elements ?? []).filter((element) => {
    if (!isSellableElement(element)) return false
    if (
      element.id === zoneId ||
      element.groupId === zoneId ||
      element.zoneId === zoneId
    ) {
      return true
    }
    return zone ? elementBelongsToZone(element, zone) : false
  })
}

function reservedOptionsForElements(input: {
  elements: VenueMapElement[]
  map: InteractiveVenueMap
  priceBySectorId: Record<string, number>
  occupancyBySeatId: Record<string, SeatStatus>
  selectedIds: Set<string>
}): StorefrontSectorOption[] {
  const options: StorefrontSectorOption[] = []
  const seen = new Set<string>()
  for (const element of input.elements) {
    if (element.type === "standing_zone") continue
    const next = isTablePurchaseSku(element)
      ? (() => {
          const option = optionFromElement({ ...input, element })
          return option ? [option] : []
        })()
      : chairOptionsFromElement({ ...input, element })
    for (const option of next) {
      if (seen.has(option.id)) continue
      seen.add(option.id)
      options.push(option)
    }
  }
  return options
}

function leftoverElementGroups(
  map: InteractiveVenueMap,
  claimedIds: Set<string>,
): Map<string, VenueMapElement[]> {
  const groups = new Map<string, VenueMapElement[]>()
  for (const element of map.elements ?? []) {
    if (!isSellableElement(element) || claimedIds.has(element.id)) continue
    const key = storefrontElementSectorId(element)
    const list = groups.get(key) ?? []
    list.push(element)
    groups.set(key, list)
  }
  return groups
}

export function listStorefrontSectorCatalog(input: {
  map: InteractiveVenueMap
  occupancyBySeatId?: Record<string, SeatStatus>
  selectedItems?: StorefrontSelectedItem[]
  priceBySectorId?: Record<string, number>
}): StorefrontSectorCatalog[] {
  const occupancyBySeatId = input.occupancyBySeatId ?? {}
  const priceBySectorId = input.priceBySectorId ?? {}
  const selectedIds = new Set((input.selectedItems ?? []).map((item) => item.id))
  const claimed = new Set<string>()
  const sectors: StorefrontSectorCatalog[] = []
  const seen = new Set<string>()

  for (const zone of input.map.zones ?? []) {
    seen.add(zone.id)
    const elements = elementsInZone(input.map, zone.id)
    for (const element of elements) claimed.add(element.id)
    const options = reservedOptionsForElements({
      elements,
      map: input.map,
      priceBySectorId,
      occupancyBySeatId,
      selectedIds,
    })
    const zonePrice = resolveVenueUnitPrice(
      [zone.id],
      zone.price,
      priceBySectorId,
    )
    sectors.push({
      id: zone.id,
      name: zone.name,
      color: zone.color || "#22d3ee",
      kind: options.length > 0 ? "reserved" : "ga",
      price: firstValidPublicPrice(options[0]?.price, zonePrice),
      options,
    })
  }

  for (const sector of input.map.sectors) {
    if (seen.has(sector.id)) continue
    seen.add(sector.id)
    const options = sector.seats
      .filter((seat) => seat.status !== "blocked")
      .map((seat) => {
        const selected = isSelected(selectedIds, seat.id)
        const status = optionStatus({
          mapStatus: seat.status,
          occupancy: occupancyBySeatId[seat.id],
          selected,
        })
        return {
          id: seat.id,
          kind: "seat" as const,
          label:
            seat.customLabel?.trim() ||
            seat.label?.trim() ||
            `${seat.row}-${seat.number}`,
          price: resolveVenueUnitPrice(
            [seat.ticketTypeId, sector.id],
            seat.price ?? sector.price,
            priceBySectorId,
          ),
          selected: status.selected,
          available: status.available,
        }
      })
    sectors.push({
      id: sector.id,
      name: sector.name,
      color: sector.color,
      kind: options.length > 0 ? "reserved" : "ga",
      price: firstValidPublicPrice(options[0]?.price, sector.price),
      options,
    })
  }

  for (const [groupId, members] of leftoverElementGroups(input.map, claimed)) {
    if (seen.has(groupId)) continue
    seen.add(groupId)
    const head = members[0]
    if (!head) continue
    const standingOnly = members.every((item) => item.type === "standing_zone")
    const options = reservedOptionsForElements({
      elements: members,
      map: input.map,
      priceBySectorId,
      occupancyBySeatId,
      selectedIds,
    })
    sectors.push({
      id: groupId,
      name:
        head.groupName?.trim() ||
        head.sectorName?.trim() ||
        head.label ||
        "Sector",
      color: head.color || "#22d3ee",
      kind: standingOnly || options.length === 0 ? "ga" : "reserved",
      price: firstValidPublicPrice(
        options[0]?.price,
        resolveElementPublicPrice(head, priceBySectorId, input.map),
      ),
      options,
    })
  }

  return sectors
}
