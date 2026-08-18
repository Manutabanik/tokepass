import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import type { VenuePricingMap } from "@/lib/seating/venue-adapter"
import { venueMapHasInventory } from "@/lib/seating/venue-map-geometry"
import {
  listVenuePriceGroups,
  type VenuePriceGroup,
} from "@/lib/seating/venue-price-groups"
import type { EventFormValues } from "@/lib/validations/event-form"
import type { InteractiveVenueMap } from "@/types/venue-map"

export function priceGroupSectorId(group: VenuePriceGroup): string {
  if (group.match.kind === "sector" || group.match.kind === "zone") {
    return group.match.id
  }
  if (group.match.kind === "group") {
    return group.match.groupId
  }
  return group.match.ids[0] ?? group.key
}

export function venueMapToPricingMap(
  map: InteractiveVenueMap,
): VenuePricingMap {
  const pricing: VenuePricingMap = {}
  for (const group of listVenuePriceGroups(map)) {
    const id = priceGroupSectorId(group)
    pricing[id] = group.price
    const name = group.name.trim()
    if (name) pricing[name] = group.price
  }
  return pricing
}

export function isLogicalGeneralSectorId(sectorId?: string | null): boolean {
  return (sectorId ?? "").trim().startsWith("general:")
}

export function isMapBackedTicket(tier: {
  seatingSectorId?: string | null
  seating_sector_id?: string | null
  tierType?: string | null
  tier_type?: string | null
  layoutType?: string | null
  layout_type?: string | null
  category?: string | null
  bundleItems?: EventFormValues["tickets"][number]["bundleItems"]
}): boolean {
  const sectorId = (tier.seatingSectorId ?? tier.seating_sector_id ?? "").trim()
  if (isLogicalGeneralSectorId(sectorId)) return false
  if (sectorId) return true
  return (
    inferInventoryTierType({
      tierType: tier.tierType ?? tier.tier_type,
      layoutType: tier.layoutType ?? tier.layout_type,
      category: tier.category,
      bundleItems: tier.bundleItems,
    }) === "seated"
  )
}

export function ticketRequiresInteractiveMap(
  tier: Parameters<typeof isMapBackedTicket>[0],
): boolean {
  return isMapBackedTicket(tier)
}

export function eventNeedsInteractiveCanvas(
  venueMap: InteractiveVenueMap | null | undefined,
  tickets: ReadonlyArray<Parameters<typeof isMapBackedTicket>[0]>,
): boolean {
  if (!venueMapHasInventory(venueMap)) return false
  return tickets.some(ticketRequiresInteractiveMap)
}

function groupElements(
  group: VenuePriceGroup,
  map: InteractiveVenueMap,
) {
  const ids = group.match.kind === "ids" ? group.match.ids : []
  const groupId = group.match.kind === "group" ? group.match.groupId : null
  return (map.elements ?? []).filter((item) =>
    groupId ? item.groupId === groupId : ids.includes(item.id),
  )
}

function furnitureChairCount(element: NonNullable<InteractiveVenueMap["elements"]>[number]): number {
  const active = element.seats.filter((seat) => seat.status !== "blocked")
  if (active.length > 0) return active.length
  if (element.type === "long_table") {
    return Math.max(
      1,
      (element.sideA || 0) + (element.sideB || 0) || element.chairCount || 1,
    )
  }
  return Math.max(1, element.chairCount || element.capacity || 1)
}

function layoutTypeFromGroup(
  group: VenuePriceGroup,
  map: InteractiveVenueMap,
): EventFormValues["tickets"][number]["layoutType"] {
  if (group.match.kind === "zone") {
    const zoneId = group.match.id
    const zone = (map.zones ?? []).find((item) => item.id === zoneId)
    if (!zone || zone.layoutType === "general") return "general"
    return zone.sellMode === "group" || zone.layoutType === "table_combo"
      ? "table_combo"
      : "numbered_seat"
  }
  if (group.match.kind === "sector") return "numbered_seat"
  const members = groupElements(group, map)
  if (members.length > 0 && members.every((item) => item.type === "standing_zone")) {
    return "general"
  }
  const furniture = members.filter(
    (item) =>
      item.type === "round_table" ||
      item.type === "long_table" ||
      item.type === "vip_box",
  )
  if (furniture.length > 0 && furniture.every((item) => item.sellMode === "group")) {
    return "table_combo"
  }
  return "numbered_seat"
}

function capacityPerUnitFromGroup(
  group: VenuePriceGroup,
  map: InteractiveVenueMap,
): number {
  if (group.match.kind === "zone") {
    const zoneId = group.match.id
    const zone = (map.zones ?? []).find((item) => item.id === zoneId)
    if (!zone || zone.layoutType === "general") return 1
    if (zone.sellMode === "group" || zone.layoutType === "table_combo") {
      return Math.max(1, zone.capacityPerUnit || 1)
    }
    return 1
  }
  if (group.match.kind === "sector") return 1
  const furniture = groupElements(group, map).filter(
    (item) =>
      item.type === "round_table" ||
      item.type === "long_table" ||
      item.type === "vip_box",
  )
  if (furniture.length > 0 && furniture.every((item) => item.sellMode === "group")) {
    return furnitureChairCount(furniture[0]!)
  }
  return 1
}

function blankMapTicket(
  dayId: string | null = null,
): EventFormValues["tickets"][number] {
  return {
    isNew: true,
    name: "Ubicación",
    price: 0,
    capacity: 1,
    timeLimit: "",
    bonusReward: "",
    dayId,
    visibility: "public",
    layoutType: "numbered_seat",
    seatingSectorId: null,
    capacityPerUnit: 1,
    admitCount: 1,
    tierType: "seated",
    listPrice: null,
    bundleItems: [],
    description: "",
    highlightBadge: null,
    phases: [],
  }
}

export function syncMapBackedTickets(
  tickets: EventFormValues["tickets"],
  map: InteractiveVenueMap,
  options?: { defaultDayId?: string | null },
): EventFormValues["tickets"] {
  const groups = listVenuePriceGroups(map)
  const liveSectorIds = new Set(groups.map((group) => priceGroupSectorId(group)))
  const commercial = tickets.filter((tier) => !isMapBackedTicket(tier))
  const existingMap = tickets.filter((tier) => isMapBackedTicket(tier))
  const defaultDayId = options?.defaultDayId ?? null
  const nextMap = groups.map((group) => {
    const sectorId = priceGroupSectorId(group)
    const existing = existingMap.find(
      (tier) => tier.seatingSectorId === sectorId,
    )
    const inheritedId =
      existing?.id && existing.isNew !== true ? existing.id : undefined
    const base = existing ?? blankMapTicket(defaultDayId)
    return {
      ...base,
      id: inheritedId,
      isNew: inheritedId ? false : true,
      name: group.name || existing?.name || "Zona",
      price: group.price,
      capacity: Math.max(1, group.count),
      seatingSectorId: sectorId,
      layoutType: layoutTypeFromGroup(group, map),
      tierType: "seated" as const,
      capacityPerUnit: capacityPerUnitFromGroup(group, map),
    }
  })

  const orphanSold = existingMap.filter(
    (tier) =>
      (tier.sold ?? 0) > 0 &&
      Boolean(tier.seatingSectorId) &&
      !liveSectorIds.has(tier.seatingSectorId as string),
  )

  return [...nextMap, ...orphanSold, ...commercial]
}

export function applyMapCapacityToTickets<
  T extends {
    seatingSectorId?: string | null
    seating_sector_id?: string | null
    layoutType?: string | null
    layout_type?: string | null
    capacityPerUnit?: number | null
    capacity_per_unit?: number | null
  },
>(tickets: T[], map: InteractiveVenueMap): T[] {
  const groups = listVenuePriceGroups(map)
  const bySector = new Map(
    groups.map((group) => [priceGroupSectorId(group), group]),
  )
  return tickets.map((tier) => {
    const sectorId = (tier.seatingSectorId ?? tier.seating_sector_id ?? "").trim()
    if (!sectorId) return tier
    const group = bySector.get(sectorId)
    if (!group) return tier
    const layoutType = layoutTypeFromGroup(group, map)
    const capacityPerUnit = capacityPerUnitFromGroup(group, map)
    return {
      ...tier,
      seatingSectorId: sectorId,
      layoutType,
      layout_type: layoutType,
      capacityPerUnit,
      capacity_per_unit: capacityPerUnit,
    }
  })
}

export function mapBackedTicketsUnchanged(
  previous: EventFormValues["tickets"],
  next: EventFormValues["tickets"],
): boolean {
  const left = previous.filter(isMapBackedTicket)
  const right = next.filter(isMapBackedTicket)
  if (left.length !== right.length) return false
  return left.every((tier, index) => {
    const other = right[index]
    return (
      other != null &&
      tier.seatingSectorId === other.seatingSectorId &&
      tier.name === other.name &&
      tier.price === other.price &&
      tier.capacity === other.capacity &&
      tier.layoutType === other.layoutType &&
      tier.capacityPerUnit === other.capacityPerUnit
    )
  })
}

/** Old 5-step drafts: 2 zonas → 1 mapa, 3 entradas → 2 tickets, 4 cobros → 3. */
export function migrateLegacyWizardStep(step: unknown): number {
  const value = typeof step === "number" && Number.isFinite(step) ? step : 0
  if (value <= 1) return Math.max(0, value)
  if (value === 2) return 1
  if (value === 3) return 2
  return 3
}
