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
import { elementBelongsToZone } from "@/lib/seating/venue-map-lod"
import { storefrontLineTotal } from "@/lib/checkout/charge-unit"
import { isValidPublicPrice } from "@/lib/checkout/public-price"
import {
  asHoldEventDateId,
  storefrontSelectionKey,
} from "@/lib/checkout/seat-hold-day"
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
    isMappedSelection: true,
    seatLabel: displayName,
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

export function isTablePurchaseSku(
  element: Pick<VenueMapElement, "type" | "sellMode" | "priceMode">,
): boolean {
  return (
    element.type === "round_table" ||
    element.type === "long_table" ||
    element.type === "vip_box" ||
    element.sellMode === "group" ||
    element.priceMode === "closed_unit"
  )
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
    if (isValidPublicPrice(priced)) return Number(priced)
  }
  return isValidPublicPrice(fallback) ? Number(fallback) : 0
}

/** Sector de agrupación visual: groupId o id del elemento. */
export function storefrontElementSectorId(
  element: Pick<VenueMapElement, "id" | "groupId">,
): string {
  return element.groupId?.trim() || element.id
}

/**
 * Sector de hold/inventario: zona del recinto (`ticket_tiers.seating_sector_id`).
 * Si no hay zona, cae a groupId o al id del elemento.
 */
export function storefrontHoldSectorId(
  element: Pick<VenueMapElement, "id" | "groupId" | "zoneId">,
  map?: InteractiveVenueMap | null,
): string {
  const zoneIds = new Set((map?.zones ?? []).map((zone) => zone.id))
  const zoneId = element.zoneId?.trim()
  if (zoneId && zoneIds.has(zoneId)) return zoneId
  const groupId = element.groupId?.trim()
  if (groupId && zoneIds.has(groupId)) return groupId
  if (map && "x" in element) {
    const zones = belongingZoneIds(element as VenueMapElement, map)
    if (zones.length === 1 && zones[0]) return zones[0]
  }
  return storefrontElementSectorId(element)
}

export function venueElementPriceLookupKeys(
  element: Pick<
    VenueMapElement,
    "ticketTypeId" | "id" | "groupId" | "zoneId"
  >,
  extraKeys: Array<string | null | undefined> = [],
): Array<string | null | undefined> {
  return [
    element.ticketTypeId,
    element.id,
    element.groupId,
    element.zoneId,
    ...extraKeys,
  ]
}

function belongingZoneIds(
  element: VenueMapElement,
  map?: InteractiveVenueMap | null,
): string[] {
  if (!map) return []
  return (map.zones ?? [])
    .filter((zone) => elementBelongsToZone(element, zone))
    .map((zone) => zone.id)
}

function elementOwnPriceKeys(
  element: VenueMapElement,
  map?: InteractiveVenueMap | null,
): Set<string> {
  const keys = new Set<string>()
  for (const key of [
    element.id,
    element.groupId,
    element.zoneId,
    ...belongingZoneIds(element, map),
  ]) {
    const trimmed = key?.trim()
    if (trimmed) keys.add(trimmed)
  }
  return keys
}

export function resolveElementPublicPrice(
  element: VenueMapElement,
  priceBySectorId: Record<string, number> = {},
  map?: InteractiveVenueMap | null,
): number {
  const own =
    element.price === undefined || element.price === null
      ? Number.NaN
      : Number(element.price)
  const ownKeys = elementOwnPriceKeys(element, map)
  const explicitGratis = isValidPublicPrice(own) && own === 0

  for (const key of venueElementPriceLookupKeys(
    element,
    belongingZoneIds(element, map),
  )) {
    const trimmed = key?.trim()
    if (!trimmed || !Object.hasOwn(priceBySectorId, trimmed)) continue
    if (explicitGratis && !ownKeys.has(trimmed)) continue
    const priced = Number(priceBySectorId[trimmed])
    if (isValidPublicPrice(priced)) return priced
  }
  if (isValidPublicPrice(own) && own > 0) return own
  if (map) {
    for (const zone of map.zones ?? []) {
      if (!elementBelongsToZone(element, zone)) continue
      const zonePrice = resolveVenueUnitPrice(
        [zone.id],
        zone.price,
        priceBySectorId,
      )
      if (
        isValidPublicPrice(zonePrice) &&
        (zonePrice > 0 || Object.hasOwn(priceBySectorId, zone.id))
      ) {
        return zonePrice
      }
    }
  }
  return isValidPublicPrice(own) ? own : 0
}

export function storefrontItemFromElement(
  element: VenueMapElement,
  priceBySectorId: Record<string, number> = {},
  map?: InteractiveVenueMap | null,
): StorefrontSelectedItem | null {
  const name = venueElementSelectionName(element)
  if (!name) return null
  const tableSku = isTablePurchaseSku(element)
  const type = tableSku ? "table" : venueElementSelectionType(element)
  return {
    id: element.id,
    name,
    displayName: name,
    type,
    ticketTierId: element.ticketTypeId,
    price: resolveElementPublicPrice(element, priceBySectorId, map),
    capacity: buyerElementCapacity(element),
    sectorId: storefrontHoldSectorId(element, map),
    sectorName: element.sectorName?.trim() || element.groupName?.trim() || undefined,
    color: element.color,
    sellMode: tableSku ? "group" : element.sellMode,
    priceMode: tableSku
      ? "closed_unit"
      : (element.priceMode ?? venuePriceModeFromSellMode(element.sellMode)),
    inventoryType: tableSku
      ? "TABLES"
      : type === "seat"
        ? "SEATED_NUMERATED"
        : "GENERAL_ADMISSION",
    isMappedSelection: true,
    seatLabel: element.customLabel?.trim() || element.label?.trim() || name,
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
    price: resolveVenueUnitPrice([zone.id], zone.price, priceBySectorId),
    capacity: 1,
    sectorId: zone.id,
    sectorName: name,
    color: zone.color,
    sellMode: zone.sellMode,
    priceMode: zone.priceMode ?? venuePriceModeFromSellMode(zone.sellMode),
    inventoryType: "GENERAL_ADMISSION",
    isMappedSelection: true,
    seatLabel: name,
  }
}

export function storefrontItemFromElementSeat(
  element: VenueMapElement,
  seat: VenueMapElement["seats"][number],
  priceBySectorId: Record<string, number> = {},
  map?: InteractiveVenueMap | null,
): StorefrontSelectedItem | null {
  const name = getVenueSeatDisplayName(element, seat)
  if (!name) return null
  const elementPrice = resolveElementPublicPrice(element, priceBySectorId, map)
  return {
    id: seat.id,
    name,
    displayName: name,
    type: "seat",
    ticketTierId: seat.ticketTypeId ?? element.ticketTypeId,
    price: resolveVenueUnitPrice(
      [seat.ticketTypeId],
      seat.price ?? elementPrice,
      priceBySectorId,
    ),
    capacity: 1,
    sectorId: storefrontHoldSectorId(element, map),
    color: element.color,
    row: seat.row ?? element.label,
    number: seat.number,
    sellMode: "per_seat",
    priceMode: "per_person",
    inventoryType: "SEATED_NUMERATED",
    sectorName: element.sectorName?.trim() || undefined,
    isMappedSelection: true,
    seatLabel: name,
  }
}

export function resolveStorefrontItemFromMap(
  map: InteractiveVenueMap,
  selectedId: string,
  priceBySectorId: Record<string, number> = {},
): StorefrontSelectedItem | null {
  const element = (map.elements ?? []).find((item) => item.id === selectedId)
  if (element) return storefrontItemFromElement(element, priceBySectorId, map)
  for (const furniture of map.elements ?? []) {
    const seat = furniture.seats.find((item) => item.id === selectedId)
    if (!seat) continue
    return storefrontItemFromElementSeat(furniture, seat, priceBySectorId, map)
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
      ticketTierId: seat.ticketTypeId,
      price: resolveVenueUnitPrice(
        [seat.ticketTypeId, sector.id],
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
      seatLabel: name,
    }
  }
  return null
}

export function hydrateStorefrontItemsFromMap(
  items: StorefrontSelectedItem[],
  map: InteractiveVenueMap | null | undefined,
  priceBySectorId: Record<string, number> = {},
  activeScheduleId?: string | null,
): StorefrontSelectedItem[] {
  const unique = dedupeStorefrontItemsById(items)
  if (!map) return unique
  const activeDay = asHoldEventDateId(activeScheduleId)
  return unique.map((item) => {
    if (item.comboTierId?.trim()) return item
    const itemDay =
      asHoldEventDateId(item.scheduleId) ??
      asHoldEventDateId(item.eventDateId) ??
      asHoldEventDateId(item.dateId)
    if (itemDay && activeDay && itemDay !== activeDay) return item
    const live = resolveStorefrontItemFromMap(map, item.id, priceBySectorId)
    if (!live) return item
    const liveCapacity = Math.max(0, Math.floor(Number(live.capacity) || 0))
    const selectedCapacity = Math.max(0, Math.floor(Number(item.capacity) || 0))
    const isQuantityZone =
      live.type === "zone" ||
      item.type === "zone" ||
      live.inventoryType === "GENERAL_ADMISSION" ||
      item.inventoryType === "GENERAL_ADMISSION"
    const ticketTierId = item.ticketTierId ?? live.ticketTierId
    const livePrice = Number(live.price)
    const keepGratis = isValidPublicPrice(livePrice) && livePrice === 0
    const stamped =
      Boolean(item.eventDateId || item.dateId || item.scheduleId || item.seatLabel)
    const keepStampedPrice =
      stamped && isValidPublicPrice(item.price)
    return {
      ...item,
      ...live,
      ticketTierId,
      eventDateId: item.eventDateId ?? itemDay ?? undefined,
      dateId: item.dateId ?? item.eventDateId ?? itemDay ?? undefined,
      scheduleId:
        item.scheduleId ?? item.eventDateId ?? item.dateId ?? itemDay ?? undefined,
      dateString: item.dateString,
      dateLabel: item.dateLabel ?? item.dateString,
      seatLabel: item.seatLabel ?? live.seatLabel ?? live.name,
      name: stamped ? item.name || live.name : live.name || item.name,
      displayName: stamped
        ? item.displayName || live.displayName || live.name
        : live.displayName || item.displayName || live.name,
      price: keepGratis
        ? 0
        : keepStampedPrice
          ? Number(item.price)
          : resolveVenueUnitPrice(
              [ticketTierId],
              livePrice,
              priceBySectorId,
            ),
      capacity: isQuantityZone
        ? Math.max(1, selectedCapacity, liveCapacity)
        : liveCapacity || selectedCapacity || 1,
      color: live.color ?? item.color,
      type: live.type,
      sectorId: live.sectorId ?? item.sectorId,
      sectorName: item.sectorName ?? live.sectorName,
      row: live.row ?? item.row,
      number: live.number ?? item.number,
      sellMode: live.sellMode ?? item.sellMode,
      priceMode: live.priceMode ?? item.priceMode,
      inventoryType: live.inventoryType ?? item.inventoryType,
    }
  })
}

export function dedupeStorefrontItemsById(
  items: StorefrontSelectedItem[],
): StorefrontSelectedItem[] {
  const seen = new Set<string>()
  const next: StorefrontSelectedItem[] = []
  for (const item of items) {
    const key = storefrontSelectionKey(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
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
  sectorLabel: string | null
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

function sectorBadgeLabel(sector: string): string | null {
  const trimmed = sector.trim()
  if (!trimmed) return null
  return trimmed
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
    if (item.type === "table" || item.inventoryType === "TABLES") {
      const seats = Math.max(1, Math.floor(item.capacity) || 1)
      const tableLabel = `Mesa completa (Incluye ${seats} accesos)`
      others.push({
        key: item.id,
        label: tableLabel,
        placeLabel: tableLabel,
        sectorLabel: item.sectorName?.trim() || sectorBadgeLabel(splitSelectionName(item).sector),
        color: item.color ?? null,
        chairsLabel: `Incluye ${seats} accesos`,
        ids: [item.id],
        price: linePrice,
      })
      continue
    }
    const split = splitSelectionName(item)
    others.push({
      key: item.id,
      label: item.name,
      placeLabel: split.place,
      sectorLabel: item.sectorName?.trim() || sectorBadgeLabel(split.sector),
      color: item.color ?? null,
      chairsLabel: chairsCopy(item.capacity),
      ids: [item.id],
      price: linePrice,
    })
  }

  const seatLines = [...seatGroups.entries()].map(([key, group]) => {
    const nums = [...group.numbers].sort((a, b) => a - b).join(", ")
    const first = byId.get(group.ids[0] ?? "")
    const sectorLabel =
      first?.sectorName?.trim() || sectorBadgeLabel(group.sector)
    return {
      key,
      label: sectorLabel
        ? `${sectorLabel} - Fila ${group.row}, Sillas ${nums}`
        : `Fila ${group.row}, Sillas ${nums}`,
      placeLabel: `Fila ${group.row}, Sillas ${nums}`,
      sectorLabel,
      color: group.color ?? first?.color ?? null,
      chairsLabel: chairsCopy(group.ids.length),
      ids: group.ids,
      price: group.price,
    }
  })

  return [...seatLines, ...others]
}

export function resolveTicketSectorName(
  tier: { seatingSectorId?: string | null },
  map?: {
    zones?: Array<{ id: string; name?: string | null }>
    sectors?: Array<{ id: string; name?: string | null }>
  } | null,
): string | null {
  const sectorId = tier.seatingSectorId?.trim()
  if (!sectorId) return null
  const zone = (map?.zones ?? []).find((item) => item.id === sectorId)
  const sector = (map?.sectors ?? []).find((item) => item.id === sectorId)
  const name = zone?.name?.trim() || sector?.name?.trim() || ""
  return name || null
}

export function formatStorefrontSelectionLabel(
  items: StorefrontSelectedItem[],
): string {
  return formatStorefrontSelectionGroups(items)
    .map((group) => group.label)
    .join(" · ")
}

function footerSelectionKind(
  item: Pick<StorefrontSelectedItem, "type" | "inventoryType">,
): "table" | "seat" | "place" {
  if (item.type === "table" || item.inventoryType === "TABLES") return "table"
  if (item.type === "seat" || item.inventoryType === "SEATED_NUMERATED") {
    return "seat"
  }
  return "place"
}

/** Resumen corto del footer del modal: no listar cada mesa/asiento. */
export function formatSeatSelectionFooterLabel(
  items: readonly Pick<StorefrontSelectedItem, "type" | "inventoryType">[],
): string {
  const count = items.length
  if (count <= 0) return "Seleccioná un lugar para continuar."
  const kinds = new Set(items.map(footerSelectionKind))
  const homogeneous = kinds.size === 1 ? [...kinds][0] : "mixed"
  if (homogeneous === "table") {
    return count === 1 ? "1 Mesa seleccionada" : `${count} Mesas seleccionadas`
  }
  if (homogeneous === "seat") {
    return count === 1
      ? "1 Asiento seleccionado"
      : `${count} Asientos seleccionados`
  }
  return count === 1 ? "1 Lugar seleccionado" : `${count} Lugares seleccionados`
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
