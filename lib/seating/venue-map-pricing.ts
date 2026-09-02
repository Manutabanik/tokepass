import { defaultInventoryDayId, normalizeDayId } from "@/lib/event-schedule"
import {
  eventHasActiveSeatingMap,
  ticketsReferenceMapSectors,
} from "@/lib/inventory/map-enablement"
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
import {
  collectNamedMapSectorIds,
  healTicketsSeatingSectors,
  normalizeMapSectorLabel,
} from "@/lib/seating/stabilize-venue-map-ids"
import { reservedFurnitureLayoutType } from "@/lib/seating/reconcile-map-seating-units"
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
  source?: string | null
  ticketType?: string | null
  ticket_type?: string | null
  seatingSectorId?: string | null
  seating_sector_id?: string | null
  tierType?: string | null
  tier_type?: string | null
  layoutType?: string | null
  layout_type?: string | null
  category?: string | null
  bundleItems?: EventFormValues["tickets"][number]["bundleItems"]
}): boolean {
  if (tier.source === "general") return false
  if (tier.ticketType === "extra" || tier.ticket_type === "extra") return false
  const sectorId = (tier.seatingSectorId ?? tier.seating_sector_id ?? "").trim()
  if (!sectorId || isLogicalGeneralSectorId(sectorId)) return false
  return true
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
  if (options?.hasSeatingPlan === false) return false
  if (!venueMapHasInventory(venueMap)) return false
  const needsReservedCanvas = tickets.some((ticket) =>
    ticketRequiresInteractiveMap({
      ...ticket,
      map: venueMap,
    }),
  )
  if (needsReservedCanvas) return true
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
    const furniture = reservedFurnitureLayoutType(map, id)
    if (furniture) return furniture
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
    const furniture = reservedFurnitureLayoutType(map, zoneId)
    if (furniture) return furniture
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

  function takeExisting(
    sectorId: string,
    dayId: string | null,
    slotIndex: number,
    groupName: string,
  ) {
    const name = normalizeMapSectorLabel(groupName)
    const exact = existingMap.findIndex((tier, index) => {
      if (claimed.has(index)) return false
      const sameSector =
        tier.seatingSectorId === sectorId ||
        (name && normalizeMapSectorLabel(tier.name) === name)
      if (!sameSector) return false
      if (!dayId) return true
      return normalizeDayId(tier.dayId) === dayId
    })
    if (exact >= 0) {
      claimed.add(exact)
      return existingMap[exact]
    }
    if (slotIndex === 0 || !expandDays) {
      const any = existingMap.findIndex((tier, index) => {
        if (claimed.has(index)) return false
        return (
          tier.seatingSectorId === sectorId ||
          Boolean(name && normalizeMapSectorLabel(tier.name) === name)
        )
      })
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
      const existing = takeExisting(sectorId, dayId, slotIndex, group.name)
      const inheritedId =
        existing?.id && existing.isNew !== true ? existing.id : undefined
      const base = existing ?? blankMapTicket(dayId ?? defaultDayId)
      const layoutType = layoutTypeFromGroup(group, map)
      const seatingType = resolveSeatingType({
        layoutType,
        seatingType: (map.zones ?? []).find((zone) => zone.id === sectorId)
          ?.seatingType,
      })
      return {
        ...base,
        id: inheritedId,
        isNew: inheritedId ? false : true,
        name: group.name || existing?.name || "Zona",
        price:
          existing != null && Number.isFinite(Number(existing.price))
            ? Number(existing.price)
            : group.price,
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

  return [...commercial, ...nextMap, ...orphanSold]
}

/** Combina inventario libre + entradas derivadas de sectores del mapa. */
function persistableTicketSectorId(tier: {
  source?: string | null
  seatingSectorId?: string | null
  seating_sector_id?: string | null
  sectorId?: string | null
}): string {
  if (tier.source === "general") return ""
  const persistId =
    (typeof tier.seating_sector_id === "string"
      ? tier.seating_sector_id.trim()
      : "") ||
    (typeof tier.seatingSectorId === "string" ? tier.seatingSectorId.trim() : "")
  if (persistId) return persistId
  if (tier.source === "map" && typeof tier.sectorId === "string") {
    return tier.sectorId.trim()
  }
  return ""
}

function liveVenueSectorIds(venueMap: unknown): Set<string> {
  const map = parseVenueMap(venueMap)
  const ids = new Set<string>()
  for (const sector of map.sectors) {
    const id = sector.id?.trim()
    if (id) ids.add(id)
  }
  for (const zone of map.zones ?? []) {
    const id = zone.id?.trim()
    if (id) ids.add(id)
  }
  return ids
}

function keepTicketWithLiveSector<
  T extends {
    source?: string | null
    seatingSectorId?: string | null
    seating_sector_id?: string | null
    sectorId?: string | null
    sold?: number | null
  },
>(tier: T, validSectorIds: Set<string>): boolean {
  const seating_sector_id = persistableTicketSectorId(tier)
  if (!seating_sector_id || tier.source === "general") return true
  if (validSectorIds.has(seating_sector_id)) return true
  return (Number(tier.sold) || 0) > 0
}

/**
 * Declara solo los campos que lee. Pedir `EventFormValues` entero obligaba a
 * cada caller a armar un formulario completo (o a castear) para decidir algo
 * que depende del mapa, la jornada y los tiers.
 */
export function consolidateEventTicketsForPersist(data: {
  tickets: EventFormValues["tickets"]
  basics: Pick<EventFormValues["basics"], "hasSeatingPlan" | "scheduleDays">
  venue: Pick<EventFormValues["venue"], "venueMap" | "includesSeatingMap">
}): EventFormValues["tickets"] {
  const venueMap = parseVenueMap(data.venue.venueMap)
  const liveSectors = collectNamedMapSectorIds(venueMap)
  const mapActive = eventHasActiveSeatingMap({
    hasSeatingPlan: data.basics.hasSeatingPlan,
    includesSeatingMap: data.venue.includesSeatingMap,
    venueMap: data.venue.venueMap,
  })
  const customTickets = mapActive
    ? healTicketsSeatingSectors(data.tickets ?? [], liveSectors)
    : (data.tickets ?? [])
  const liveSectorIds = liveVenueSectorIds(data.venue.venueMap)
  if (!mapActive) {
    const ticketsToKeep = customTickets.filter((tier) =>
      keepTicketWithLiveSector(tier, new Set()),
    )
    return ticketsToKeep.map((tier) => ({
      ...tier,
      seatingSectorId: null,
      seating_sector_id: null,
      sectorId: "",
    }))
  }
  const next =
    !ticketsReferenceMapSectors(customTickets)
      ? customTickets
      : syncMapBackedTickets(
          customTickets,
          parseVenueMap(data.venue.venueMap),
          {
            defaultDayId: defaultInventoryDayId(data.basics.scheduleDays),
            dayIds: (data.basics.scheduleDays ?? []).map((day) => day.id),
          },
        )
  const ticketsToKeep = next.filter((tier) =>
    keepTicketWithLiveSector(tier, liveSectorIds),
  )
  return ticketsToKeep
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
