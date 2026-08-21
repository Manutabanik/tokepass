import type {
  StorefrontSelectedItem,
  StorefrontSelectedItemType,
} from "@/lib/stores/storefront-seat-store"
import type {
  InteractiveVenueMap,
  VenueMapElement,
  VenueMapZone,
} from "@/types/venue-map"
import { venuePriceModeFromSellMode } from "@/types/venue-map"
import { storefrontLineTotal } from "@/lib/checkout/charge-unit"
import {
  getSeatDisplayName,
  getVenueElementDisplayName,
  getVenueSeatDisplayName,
} from "@/lib/map-utils"
import type { EventSeat, EventTable } from "@/types/event-map"
import {
  generalAdmissionLabel,
  reservedPlaceLabel,
  resolveSeatingType,
} from "@/lib/seating/seating-type"

/** Guarda en el carrito la etiqueta que después se imprime en el boleto. */
export function addSelectedSeatToCartItem(
  seat: EventSeat,
  table?: EventTable,
  sectorName?: string,
): StorefrontSelectedItem {
  const displayName = getSeatDisplayName(seat, table, sectorName)
  return {
    id: seat.id,
    name: displayName,
    displayName,
    type: "seat",
    price: seat.price,
    capacity: 1,
    sectorId: seat.sector_id || table?.sector_id,
    row: seat.row_label,
    number:
      typeof seat.seat_number === "number"
        ? seat.seat_number
        : Number(seat.seat_number) || undefined,
    sellMode: "per_seat",
    priceMode: "per_person",
  }
}

export function venueElementSelectionName(
  element: Pick<
    VenueMapElement,
    "customLabel" | "label" | "sectorName" | "groupName" | "type"
  >,
): string {
  return getVenueElementDisplayName(element)
}

export function venueElementSelectionType(
  element: Pick<VenueMapElement, "type">,
): StorefrontSelectedItemType {
  if (element.type === "standing_zone") return "standing"
  if (element.type === "vip_chair") return "seat"
  return "table"
}

export function resolveVenueUnitPrice(
  keys: Array<string | null | undefined>,
  fallback: number,
  priceBySectorId: Record<string, number> = {},
): number {
  for (const key of keys) {
    const trimmed = key?.trim()
    if (!trimmed) continue
    const priced = priceBySectorId[trimmed]
    if (Number.isFinite(priced)) return Number(priced)
  }
  return Number.isFinite(fallback) ? Number(fallback) : 0
}

export function storefrontItemFromElement(
  element: VenueMapElement,
  priceBySectorId: Record<string, number> = {},
): StorefrontSelectedItem | null {
  const name = venueElementSelectionName(element)
  if (!name) return null
  return {
    id: element.id,
    name,
    displayName: name,
    type: venueElementSelectionType(element),
    price: resolveVenueUnitPrice(
      [element.id, element.groupId, element.sectorName, element.groupName],
      element.price,
      priceBySectorId,
    ),
    capacity: buyerElementCapacity(element),
    sectorId: element.groupId?.trim() || element.id,
    color: element.color,
    sellMode: element.sellMode,
    priceMode: element.priceMode ?? venuePriceModeFromSellMode(element.sellMode),
  }
}

export function storefrontItemFromZone(
  zone: VenueMapZone,
  priceBySectorId: Record<string, number> = {},
): StorefrontSelectedItem | null {
  const name = zone.name?.trim()
  if (!name) return null
  const cartName =
    resolveSeatingType(zone) === "GENERAL"
      ? generalAdmissionLabel(name)
      : name
  return {
    id: zone.id,
    name: cartName,
    displayName: cartName,
    type: "zone",
    price: resolveVenueUnitPrice([zone.id, zone.name], zone.price, priceBySectorId),
    capacity: 1,
    sectorId: zone.id,
    color: zone.color,
    sellMode: zone.sellMode,
    priceMode: zone.priceMode ?? venuePriceModeFromSellMode(zone.sellMode),
  }
}

export function storefrontItemFromElementSeat(
  element: VenueMapElement,
  seat: VenueMapElement["seats"][number],
  priceBySectorId: Record<string, number> = {},
): StorefrontSelectedItem | null {
  const name = getVenueSeatDisplayName(element, seat)
  if (!name) return null
  return {
    id: seat.id,
    name,
    displayName: name,
    type: "seat",
    price: resolveVenueUnitPrice(
      [
        seat.ticketTypeId,
        element.ticketTypeId,
        element.id,
        element.groupId,
        element.sectorName,
        element.groupName,
      ],
      seat.price ?? element.price,
      priceBySectorId,
    ),
    capacity: 1,
    sectorId: element.groupId?.trim() || element.id,
    color: element.color,
    row: seat.row ?? element.label,
    number: seat.number,
    sellMode: "per_seat",
    priceMode: "per_person",
  }
}

export function resolveStorefrontItemFromMap(
  map: InteractiveVenueMap,
  selectedId: string,
  priceBySectorId: Record<string, number> = {},
): StorefrontSelectedItem | null {
  const element = (map.elements ?? []).find((item) => item.id === selectedId)
  if (element) return storefrontItemFromElement(element, priceBySectorId)
  for (const furniture of map.elements ?? []) {
    const seat = furniture.seats.find((item) => item.id === selectedId)
    if (!seat) continue
    return storefrontItemFromElementSeat(furniture, seat, priceBySectorId)
  }
  const zone = (map.zones ?? []).find((item) => item.id === selectedId)
  if (zone) return storefrontItemFromZone(zone, priceBySectorId)
  for (const sector of map.sectors) {
    const seat = sector.seats.find((item) => item.id === selectedId)
    if (!seat) continue
    const sectorName = sector.name?.trim()
    const row = seat.row?.trim()
    if (!sectorName || !row) return null
    const name =
      seat.customLabel?.trim() ||
      reservedPlaceLabel({
        sectorName,
        row,
        number: seat.number,
      })
    return {
      id: seat.id,
      name,
      displayName: name,
      type: "seat",
      price: resolveVenueUnitPrice(
        [seat.ticketTypeId, sector.id, sector.name],
        seat.price ?? sector.price,
        priceBySectorId,
      ),
      capacity: 1,
      sectorId: sector.id,
      color: sector.color,
      row,
      number: seat.number,
      sellMode: "per_seat",
      priceMode: "per_person",
    }
  }
  return null
}

export function hydrateStorefrontItemsFromMap(
  items: StorefrontSelectedItem[],
  map: InteractiveVenueMap | null | undefined,
  priceBySectorId: Record<string, number> = {},
): StorefrontSelectedItem[] {
  const unique = dedupeStorefrontItemsById(items)
  if (!map) return unique
  return unique.map((item) => {
    const live = resolveStorefrontItemFromMap(map, item.id, priceBySectorId)
    if (!live) return item
    return {
      ...item,
      name: live.name,
      displayName: live.displayName ?? live.name,
      price: live.price,
      capacity: live.capacity || item.capacity,
      color: live.color ?? item.color,
      type: live.type,
      sectorId: live.sectorId ?? item.sectorId,
      row: live.row ?? item.row,
      number: live.number ?? item.number,
      sellMode: live.sellMode ?? item.sellMode,
      priceMode: live.priceMode ?? item.priceMode,
    }
  })
}

export function dedupeStorefrontItemsById(
  items: StorefrontSelectedItem[],
): StorefrontSelectedItem[] {
  const seen = new Set<string>()
  const next: StorefrontSelectedItem[] = []
  for (const item of items) {
    const id = item.id?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    next.push(item)
  }
  return next
}

function sectorLabelFromItem(item: StorefrontSelectedItem): string {
  const parts = item.name
    .split(/\s[·-]\s/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length >= 2 && !/^fila\b/i.test(parts[0] ?? "")) {
    return parts[0] ?? item.name
  }
  return item.name.trim()
}

function isNumberedSeat(item: StorefrontSelectedItem): boolean {
  return (
    item.type === "seat" &&
    typeof item.number === "number" &&
    Number.isFinite(item.number) &&
    item.number > 0 &&
    Boolean(item.row?.trim())
  )
}

export type StorefrontSelectionGroup = {
  key: string
  label: string
  placeLabel: string
  sectorLabel: string
  color: string | null
  chairsLabel: string | null
  ids: string[]
  price: number
}

function chairsCopy(count: number): string | null {
  const seats = Math.max(0, Math.floor(count) || 0)
  if (seats <= 1) return seats === 1 ? "Incluye 1 silla / butaca" : null
  return `Incluye ${seats} sillas / butacas`
}

function splitSelectionName(item: StorefrontSelectedItem): {
  sector: string
  place: string
} {
  const parts = item.name
    .split(/\s[·-]\s/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    return { sector: parts[0] ?? item.name, place: parts.slice(1).join(" · ") }
  }
  return { sector: sectorLabelFromItem(item), place: item.name }
}

function sectorBadgeLabel(sector: string): string {
  const trimmed = sector.trim()
  if (!trimmed) return "Sector"
  return /^sector\b/i.test(trimmed) ? trimmed : `Sector ${trimmed}`
}

export function formatStorefrontSelectionGroups(
  items: StorefrontSelectedItem[],
): StorefrontSelectionGroup[] {
  const unique = dedupeStorefrontItemsById(items)
  const byId = new Map(unique.map((item) => [item.id, item]))
  const seatGroups = new Map<
    string,
    {
      sector: string
      row: string
      numbers: Set<number>
      ids: string[]
      price: number
      color: string | null
    }
  >()
  const others: StorefrontSelectionGroup[] = []

  for (const item of unique) {
    const linePrice = storefrontLineTotal(item)
    if (isNumberedSeat(item) && item.row && item.number != null) {
      const sector = sectorLabelFromItem(item)
      const row = item.row.trim()
      const key = `${item.sectorId ?? sector}::${row}`
      const group = seatGroups.get(key) ?? {
        sector,
        row,
        numbers: new Set<number>(),
        ids: [],
        price: 0,
        color: item.color ?? null,
      }
      group.numbers.add(item.number)
      if (!group.ids.includes(item.id)) group.ids.push(item.id)
      group.price += linePrice
      if (!group.color && item.color) group.color = item.color
      seatGroups.set(key, group)
      continue
    }
    const split = splitSelectionName(item)
    others.push({
      key: item.id,
      label: item.name,
      placeLabel: split.place,
      sectorLabel: sectorBadgeLabel(split.sector),
      color: item.color ?? null,
      chairsLabel: chairsCopy(item.capacity),
      ids: [item.id],
      price: linePrice,
    })
  }

  const seatLines = [...seatGroups.entries()].map(([key, group]) => {
    const nums = [...group.numbers].sort((a, b) => a - b).join(", ")
    const first = byId.get(group.ids[0] ?? "")
    return {
      key,
      label: `${sectorBadgeLabel(group.sector)} - Fila ${group.row}, Sillas ${nums}`,
      placeLabel: `Fila ${group.row}, Sillas ${nums}`,
      sectorLabel: sectorBadgeLabel(group.sector),
      color: group.color ?? first?.color ?? null,
      chairsLabel: chairsCopy(group.ids.length),
      ids: group.ids,
      price: group.price,
    }
  })

  return [...seatLines, ...others]
}

export function formatStorefrontSelectionLabel(
  items: StorefrontSelectedItem[],
): string {
  return formatStorefrontSelectionGroups(items)
    .map((group) => group.label)
    .join(" · ")
}

export function buyerElementTypeName(
  element: Pick<VenueMapElement, "type">,
): string {
  if (element.type === "round_table") return "Mesa"
  if (element.type === "long_table") return "Tablón"
  if (element.type === "vip_box") return "Palco"
  if (element.type === "vip_chair") return "Butaca"
  if (element.type === "standing_zone") return "Zona"
  return "Lugar"
}

export function buyerElementCapacity(element: VenueMapElement): number {
  if (element.type === "standing_zone") {
    return Math.max(1, Math.floor(element.capacity) || 1)
  }
  if (element.type === "long_table") {
    return Math.max(
      1,
      element.sideA + element.sideB ||
        element.chairCount ||
        element.seats?.length ||
        element.capacity ||
        1,
    )
  }
  return Math.max(
    1,
    element.chairCount || element.seats?.length || element.capacity || 1,
  )
}

export function buyerElementTitle(
  element: Pick<VenueMapElement, "type" | "label" | "customLabel">,
): string {
  const type = buyerElementTypeName(element)
  const label = element.customLabel?.trim() || element.label?.trim() || ""
  if (!label) return type
  if (label.toLowerCase().includes(type.toLowerCase())) return label
  if (/^\d+$/.test(label)) return `${type} ${label}`
  return label
}

export type StorefrontFocusCard = {
  title: string
  sector: string
  capacityLabel: string
  price: number
}

function capacityCopy(count: number, standing = false): string {
  if (standing) return `Cupo ${count}`
  return `${count} ${count === 1 ? "Asiento" : "Asientos"}`
}

export function storefrontFocusCard(
  item: StorefrontSelectedItem,
  map: InteractiveVenueMap | null | undefined,
): StorefrontFocusCard {
  const element = (map?.elements ?? []).find((entry) => entry.id === item.id)
  if (element) {
    const capacity = buyerElementCapacity(element)
    const sector =
      element.sectorName?.trim() ||
      element.groupName?.trim() ||
      item.name.split(" · ")[0] ||
      "Sector"
    return {
      title: element.customLabel?.trim() || buyerElementTitle(element),
      sector: sector.toLowerCase().startsWith("sector")
        ? sector
        : `Sector ${sector}`,
      capacityLabel: capacityCopy(capacity, element.type === "standing_zone"),
      price: item.price,
    }
  }

  const zone = (map?.zones ?? []).find((entry) => entry.id === item.id)
  if (zone) {
    const capacity = Math.max(1, Math.floor(zone.capacity) || 1)
    return {
      title: zone.name.trim() || item.name,
      sector: "Zona de acceso",
      capacityLabel: capacityCopy(capacity, zone.layoutType === "general"),
      price: item.price,
    }
  }

  const row = item.row?.trim()
  const number = item.number
  const title =
    number && number > 0
      ? row
        ? `Fila ${row} · Asiento ${number}`
        : `Asiento ${number}`
      : item.name.split(" · ").slice(-1)[0] || item.name
  const sector = item.name.split(" · ")[0] || "Sector"
  return {
    title,
    sector: sector.toLowerCase().startsWith("sector")
      ? sector
      : `Sector ${sector}`,
    capacityLabel: capacityCopy(Math.max(1, Math.floor(item.capacity) || 1)),
    price: item.price,
  }
}
