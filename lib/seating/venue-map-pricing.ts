import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import type { VenuePricingMap } from "@/lib/seating/venue-adapter"
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

export function isMapBackedTicket(
  tier: EventFormValues["tickets"][number],
): boolean {
  if (tier.seatingSectorId?.trim()) return true
  return (
    inferInventoryTierType({
      tierType: tier.tierType,
      layoutType: tier.layoutType,
      bundleItems: tier.bundleItems,
    }) === "seated"
  )
}

function layoutTypeFromGroup(
  group: VenuePriceGroup,
  map: InteractiveVenueMap,
): EventFormValues["tickets"][number]["layoutType"] {
  if (group.match.kind === "zone") {
    const zone = (map.zones ?? []).find((item) => item.id === group.match.id)
    return zone?.layoutType ?? "numbered_seat"
  }
  if (group.match.kind === "sector") return "numbered_seat"
  const ids = group.match.kind === "ids" ? group.match.ids : []
  const groupId = group.match.kind === "group" ? group.match.groupId : null
  const element = (map.elements ?? []).find((item) =>
    groupId ? item.groupId === groupId : ids.includes(item.id),
  )
  if (element?.type === "standing_zone") return "general"
  if (
    element?.type === "round_table" ||
    element?.type === "long_table" ||
    element?.type === "vip_box"
  ) {
    return "table_combo"
  }
  return "numbered_seat"
}

function blankMapTicket(): EventFormValues["tickets"][number] {
  return {
    name: "Ubicación",
    price: 0,
    capacity: 1,
    timeLimit: "",
    bonusReward: "",
    dayId: null,
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
): EventFormValues["tickets"] {
  const commercial = tickets.filter((tier) => !isMapBackedTicket(tier))
  const existingMap = tickets.filter((tier) => isMapBackedTicket(tier))
  const nextMap = listVenuePriceGroups(map).map((group) => {
    const sectorId = priceGroupSectorId(group)
    const existing = existingMap.find(
      (tier) => tier.seatingSectorId === sectorId,
    )
    const zone =
      group.match.kind === "zone"
        ? (map.zones ?? []).find((item) => item.id === group.match.id)
        : undefined
    return {
      ...(existing ?? blankMapTicket()),
      name: group.name || existing?.name || "Zona",
      price: group.price,
      capacity: Math.max(1, group.count),
      seatingSectorId: sectorId,
      layoutType: layoutTypeFromGroup(group, map),
      tierType: "seated" as const,
      capacityPerUnit:
        zone?.capacityPerUnit ?? existing?.capacityPerUnit ?? 1,
    }
  })

  const used = new Set(nextMap.map((tier) => tier.seatingSectorId))
  const orphanSold = existingMap.filter(
    (tier) => (tier.sold ?? 0) > 0 && !used.has(tier.seatingSectorId),
  )

  return [...nextMap, ...orphanSold, ...commercial]
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
      tier.layoutType === other.layoutType
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
