import type {
  UseFieldArrayAppend,
  UseFieldArrayRemove,
  UseFieldArrayUpdate,
} from "react-hook-form"

import { defaultInventoryDayId, normalizeDayId } from "@/lib/event-schedule"
import {
  eventHasActiveSeatingMap,
} from "@/lib/inventory/map-enablement"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import { parametricZoneCapacity } from "@/lib/seating/adaptive-seating"
import type { VenuePricingMap } from "@/lib/seating/venue-adapter"
import {
  flattenSeatsForAvailability,
  venueMapHasInventory,
} from "@/lib/seating/venue-map-geometry"
import {
  listVenuePriceGroups,
  type VenuePriceGroup,
} from "@/lib/seating/venue-price-groups"
import type { EventFormValues } from "@/lib/validations/event-form"
import {
  resolveEffectiveSeatingType,
  resolveSeatingType,
} from "@/lib/seating/seating-type"
import { parseVenueMap, type InteractiveVenueMap } from "@/types/venue-map"

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
  tier: Parameters<typeof isMapBackedTicket>[0] & {
    seatingType?: string | null
    seating_type?: string | null
    map?: InteractiveVenueMap | null
    sectors?: Array<{ id: string; type?: string; kind?: string }>
  },
): boolean {
  return sectorUsesNumberedMap({
    seatingSectorId: tier.seatingSectorId ?? tier.seating_sector_id,
    layoutType: tier.layoutType ?? tier.layout_type,
    seatingType: tier.seatingType ?? tier.seating_type,
    map: tier.map,
    sectors: tier.sectors,
  })
}

function mapHasReservedInventory(map: InteractiveVenueMap): boolean {
  if (
    (map.zones ?? []).some(
      (zone) => resolveEffectiveSeatingType(zone, map) === "RESERVED",
    )
  ) {
    return true
  }
  return flattenSeatsForAvailability(map).length > 0
}

/** Mesas/butacas van al modal. Zonas GA suman al carrito. */
export function sectorUsesNumberedMap(input: {
  seatingSectorId?: string | null
  layoutType?: string | null
  seatingType?: string | null
  seating_type?: string | null
  map?: InteractiveVenueMap | null
  sectors?: Array<{ id: string; type?: string; kind?: string }>
}): boolean {
  const sectorId = (input.seatingSectorId ?? "").trim()
  if (isLogicalGeneralSectorId(sectorId)) return false
  const zone = input.map?.zones?.find((item) => item.id === sectorId)
  const listed = input.sectors?.find((sector) => sector.id === sectorId)
  const modality = resolveEffectiveSeatingType(
    {
      id: sectorId || zone?.id,
      seatingType: zone?.seatingType ?? input.seatingType ?? input.seating_type,
      layoutType: zone?.layoutType ?? input.layoutType,
      type: listed?.type,
      kind: listed?.kind,
    },
    input.map,
  )
  if (input.map) {
    if (sectorId) return modality === "RESERVED"
    const layout = (input.layoutType ?? "").trim()
    if (layout === "general") return false
    return mapHasReservedInventory(input.map)
  }
  if (modality === "RESERVED") return true
  const layout = (input.layoutType ?? zone?.layoutType ?? "").trim()
  if (layout === "general") return false
  if (layout === "numbered_seat" || layout === "table_combo") return true
  if (!sectorId) return false
  if (listed) {
    if (listed.type === "numbered" || listed.kind === "numbered") return true
    if (listed.type === "general" || listed.kind === "ga") return false
  }
  return false
}

export function eventNeedsInteractiveCanvas(
  venueMap: InteractiveVenueMap | null | undefined,
  tickets: ReadonlyArray<Parameters<typeof isMapBackedTicket>[0]>,
  options?: { hasSeatingPlan?: boolean | null },
): boolean {
  if (!venueMapHasInventory(venueMap)) return false
  const needsReservedCanvas = tickets.some((ticket) =>
    ticketRequiresInteractiveMap({
      ...ticket,
      map: venueMap,
    }),
  )
  if (needsReservedCanvas) return true
  if (options?.hasSeatingPlan === false) return false
  return tickets.some(isMapBackedTicket)
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

export function layoutTypeForMapSectorId(
  map: InteractiveVenueMap,
  sectorId: string,
): EventFormValues["tickets"][number]["layoutType"] | null {
  const id = sectorId.trim()
  if (!id) return null
  const group = listVenuePriceGroups(map).find(
    (item) => priceGroupSectorId(item) === id,
  )
  if (group) return layoutTypeFromGroup(group, map)
  const zone = (map.zones ?? []).find((item) => item.id === id)
  if (zone) {
    if (resolveSeatingType(zone) === "GENERAL") return "general"
    if (zone.layoutType === "table_combo") return "table_combo"
    if (zone.layoutType === "numbered_seat") return "numbered_seat"
    return "general"
  }
  if (map.sectors.some((sector) => sector.id === id)) return "numbered_seat"
  return null
}

function layoutTypeFromGroup(
  group: VenuePriceGroup,
  map: InteractiveVenueMap,
): EventFormValues["tickets"][number]["layoutType"] {
  if (group.match.kind === "zone") {
    const zoneId = group.match.id
    const zone = (map.zones ?? []).find((item) => item.id === zoneId)
    if (!zone || resolveSeatingType(zone) === "GENERAL") return "general"
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

export function mapGroupGeneratedPlaces(
  group: VenuePriceGroup,
  map: InteractiveVenueMap,
): number {
  if (group.match.kind === "zone") {
    const zoneId = group.match.id
    const zone = (map.zones ?? []).find((item) => item.id === zoneId)
    if (zone) return Math.max(1, parametricZoneCapacity(zone))
  }
  const layoutType = layoutTypeFromGroup(group, map)
  const perUnit = capacityPerUnitFromGroup(group, map)
  if (layoutType === "table_combo") {
    return Math.max(1, group.count * perUnit)
  }
  return Math.max(1, group.count)
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
    basePrice: 0,
    feeStrategy: "pass_to_customer",
    calculationMode: "net_income",
    capacity: 1,
    timeLimit: "",
    saleStartsAt: "",
    saleEndsAt: "",
    bonusReward: "",
    dayId,
    visibility: "public",
    layoutType: "numbered_seat",
    seatingSectorId: null,
    capacityPerUnit: 1,
    minPurchaseLimit: 1,
    maxPurchaseLimit: null,
    admitCount: 1,
    tierType: "seated",
    listPrice: null,
    bundleItems: [],
    bundleType: null,
    promoDiscountType: null,
    promoDiscountValue: 0,
    promoRequiredQty: 1,
    promoPayQty: 1,
    description: "",
    highlightBadge: null,
    phases: [],
  }
}

export function syncMapBackedTickets(
  tickets: EventFormValues["tickets"],
  map: InteractiveVenueMap,
  options?: { defaultDayId?: string | null; dayIds?: readonly string[] },
): EventFormValues["tickets"] {
  const groups = listVenuePriceGroups(map)
  const liveSectorIds = new Set(groups.map((group) => priceGroupSectorId(group)))
  const commercial = tickets.filter((tier) => !isMapBackedTicket(tier))
  const existingMap = tickets.filter((tier) => isMapBackedTicket(tier))
  const defaultDayId = options?.defaultDayId ?? null
  const dayIds = (options?.dayIds ?? []).map((id) => id.trim()).filter(Boolean)
  const expandDays = dayIds.length >= 2
  const daySlots: Array<string | null> = expandDays ? dayIds : [defaultDayId]
  const claimed = new Set<number>()

  function takeExisting(sectorId: string, dayId: string | null, slotIndex: number) {
    const exact = existingMap.findIndex((tier, index) => {
      if (claimed.has(index) || tier.seatingSectorId !== sectorId) return false
      if (!dayId) return true
      return normalizeDayId(tier.dayId) === dayId
    })
    if (exact >= 0) {
      claimed.add(exact)
      return existingMap[exact]
    }
    if (slotIndex === 0 || !expandDays) {
      const any = existingMap.findIndex(
        (tier, index) =>
          !claimed.has(index) && tier.seatingSectorId === sectorId,
      )
      if (any >= 0) {
        claimed.add(any)
        return existingMap[any]
      }
    }
    return undefined
  }

  const nextMap = groups.flatMap((group) => {
    const sectorId = priceGroupSectorId(group)
    return daySlots.map((dayId, slotIndex) => {
      const existing = takeExisting(sectorId, dayId, slotIndex)
      const inheritedId =
        existing?.id && existing.isNew !== true ? existing.id : undefined
      const base = existing ?? blankMapTicket(dayId ?? defaultDayId)
      const layoutType = layoutTypeFromGroup(group, map)
      const seatingType = resolveSeatingType({
        layoutType,
        seatingType: (map.zones ?? []).find((zone) => zone.id === sectorId)
          ?.seatingType,
      })
      const mapPrice = Number.isFinite(Number(group.price))
        ? Number(group.price)
        : 0
      return {
        ...base,
        id: inheritedId,
        isNew: inheritedId ? false : true,
        name: group.name || existing?.name || "Zona",
        price: mapPrice,
        basePrice: mapPrice,
        capacity: mapGroupGeneratedPlaces(group, map),
        seatingSectorId: sectorId,
        layoutType,
        dayId: dayId ?? base.dayId ?? defaultDayId,
        tierType:
          seatingType === "GENERAL" ? ("general" as const) : ("seated" as const),
        capacityPerUnit: capacityPerUnitFromGroup(group, map),
      }
    })
  })

  const orphanSold = existingMap.filter(
    (tier) =>
      (tier.sold ?? 0) > 0 &&
      Boolean(tier.seatingSectorId) &&
      !liveSectorIds.has(tier.seatingSectorId as string),
  )

  return [...nextMap, ...orphanSold, ...commercial]
}

/** Combina inventario libre + entradas derivadas de sectores del mapa. */
export function consolidateEventTicketsForPersist(
  data: Pick<EventFormValues, "tickets" | "basics" | "venue">,
): EventFormValues["tickets"] {
  const customTickets = data.tickets ?? []
  if (
    !eventHasActiveSeatingMap({
      hasSeatingPlan: data.basics.hasSeatingPlan,
      includesSeatingMap: data.venue.includesSeatingMap,
      venueMap: data.venue.venueMap,
    })
  ) {
    return customTickets
  }
  return syncMapBackedTickets(
    customTickets,
    parseVenueMap(data.venue.venueMap),
    {
      defaultDayId: defaultInventoryDayId(data.basics.scheduleDays),
      dayIds: (data.basics.scheduleDays ?? []).map((day) => day.id),
    },
  )
}

export function mapTicketSyncKey(tier: {
  seatingSectorId?: string | null
  dayId?: string | null
}): string {
  return `${(tier.seatingSectorId ?? "").trim()}::${normalizeDayId(tier.dayId) ?? ""}`
}

function tierSoldCount(
  ticket: Pick<EventFormValues["tickets"][number], "sold"> | null | undefined,
): number {
  const parsed = Math.floor(Number(ticket?.sold))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function mapBackedTicketFieldsMatch(
  current: EventFormValues["tickets"][number],
  desired: EventFormValues["tickets"][number],
): boolean {
  return (
    current.name === desired.name &&
    current.price === desired.price &&
    current.basePrice === desired.basePrice &&
    current.capacity === desired.capacity &&
    current.layoutType === desired.layoutType &&
    current.capacityPerUnit === desired.capacityPerUnit &&
    current.tierType === desired.tierType &&
    current.seatingSectorId === desired.seatingSectorId &&
    normalizeDayId(current.dayId) === normalizeDayId(desired.dayId)
  )
}

/** Aplica sync mapa -> tickets con append/update/remove (preserva IDs persistidos). */
export function syncMapToTickets(input: {
  getTickets: () => EventFormValues["tickets"]
  map: InteractiveVenueMap
  append: UseFieldArrayAppend<EventFormValues, "tickets">
  update: UseFieldArrayUpdate<EventFormValues, "tickets">
  remove: UseFieldArrayRemove
  options?: { defaultDayId?: string | null; dayIds?: readonly string[] }
}): boolean {
  const current = input.getTickets()
  const target = syncMapBackedTickets(current, input.map, input.options)
  const desiredMapBacked = target.filter(isMapBackedTicket)
  const desiredByKey = new Map(
    desiredMapBacked.map((tier) => [mapTicketSyncKey(tier), tier]),
  )
  let changed = false

  const removeIndices = current
    .map((tier, index) => ({ tier, index }))
    .filter(
      ({ tier }) =>
        isMapBackedTicket(tier) &&
        !desiredByKey.has(mapTicketSyncKey(tier)) &&
        tierSoldCount(tier) === 0,
    )
    .map(({ index }) => index)
    .sort((a, b) => b - a)

  for (const index of removeIndices) {
    input.remove(index)
    changed = true
  }

  const afterRemove = input.getTickets()
  for (let index = 0; index < afterRemove.length; index += 1) {
    const tier = afterRemove[index]
    if (!tier || !isMapBackedTicket(tier)) continue
    const desired = desiredByKey.get(mapTicketSyncKey(tier))
    if (!desired) continue
    const merged: EventFormValues["tickets"][number] = {
      ...tier,
      ...desired,
      id: tier.id,
      sold: tier.sold,
      isNew: tier.isNew,
    }
    if (!mapBackedTicketFieldsMatch(tier, merged)) {
      input.update(index, merged)
      changed = true
    }
    desiredByKey.delete(mapTicketSyncKey(tier))
  }

  for (const desired of desiredByKey.values()) {
    input.append(desired)
    changed = true
  }

  return changed
}

export function applyMapCapacityToTickets<
  T extends {
    seatingSectorId?: string | null
    seating_sector_id?: string | null
    layoutType?: string | null
    layout_type?: string | null
    capacity?: number | null
    sold?: number | null
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
    const generated = mapGroupGeneratedPlaces(group, map)
    const sold = Math.max(0, Number(tier.sold) || 0)
    return {
      ...tier,
      seatingSectorId: sectorId,
      layoutType,
      layout_type: layoutType,
      capacityPerUnit,
      capacity_per_unit: capacityPerUnit,
      capacity: Math.max(generated, sold),
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
