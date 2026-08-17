import { priceGroupSectorId } from "@/lib/seating/venue-map-pricing"
import { listVenuePriceGroups } from "@/lib/seating/venue-price-groups"
import {
  isSellableElement,
  type InteractiveVenueMap,
  type VenueMapElement,
  type VenueSellMode,
} from "@/types/venue-map"

export type VenueSkuLayoutType = "general" | "table_combo" | "numbered_seat"

export type VenueMapSkuTicketRef = {
  name?: string | null
  seatingSectorId?: string | null
  seating_sector_id?: string | null
  layoutType?: string | null
  layout_type?: string | null
  capacityPerUnit?: number | null
  capacity_per_unit?: number | null
}

export type VenueMapSkuMismatch = {
  sectorId: string
  label: string
  sellMode: VenueSellMode
  expectedLayoutType: VenueSkuLayoutType
  actualLayoutType: string | null
  expectedCapacityPerUnit: number | null
  actualCapacityPerUnit: number | null
  message: string
}

export type VenueMapSkuConsistencyResult =
  | { ok: true; errors: [] }
  | { ok: false; errors: VenueMapSkuMismatch[] }

const FURNITURE_TYPES = new Set(["round_table", "long_table", "vip_box"])

export function expectedLayoutForSellMode(
  sellMode: VenueSellMode,
): Exclude<VenueSkuLayoutType, "general"> {
  return sellMode === "group" ? "table_combo" : "numbered_seat"
}

export function elementChairCount(element: VenueMapElement): number {
  const active = element.seats.filter((seat) => seat.status !== "blocked")
  if (active.length > 0) return active.length
  if (element.type === "long_table") {
    return Math.max(1, (element.sideA || 0) + (element.sideB || 0) || element.chairCount || 1)
  }
  return Math.max(1, element.chairCount || element.capacity || 1)
}

function ticketSectorId(ticket: VenueMapSkuTicketRef): string {
  return (ticket.seatingSectorId ?? ticket.seating_sector_id ?? "").trim()
}

function ticketLayoutType(ticket: VenueMapSkuTicketRef): string | null {
  const value = (ticket.layoutType ?? ticket.layout_type ?? "").trim()
  return value || null
}

function ticketCapacityPerUnit(ticket: VenueMapSkuTicketRef): number | null {
  const raw = ticket.capacityPerUnit ?? ticket.capacity_per_unit
  if (raw == null) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function pushError(
  errors: VenueMapSkuMismatch[],
  error: VenueMapSkuMismatch,
) {
  errors.push(error)
}

function furnitureMembers(
  map: InteractiveVenueMap,
  match:
    | { kind: "group"; groupId: string }
    | { kind: "ids"; ids: string[] },
): VenueMapElement[] {
  const ids = match.kind === "ids" ? new Set(match.ids) : null
  const groupId = match.kind === "group" ? match.groupId : null
  return (map.elements ?? []).filter((element) => {
    if (!isSellableElement(element)) return false
    if (groupId) return element.groupId === groupId
    return ids?.has(element.id) ?? false
  })
}

function mismatch(input: Omit<VenueMapSkuMismatch, "message"> & { message: string }): VenueMapSkuMismatch {
  return input
}

/**
 * Canonical map vs SKU check:
 * - sellMode=group requires layout_type=table_combo and matching capacity_per_unit
 * - sellMode=per_seat requires layout_type=numbered_seat
 * Standing / general-admission inventory is skipped.
 */
export function validateVenueMapSkuConsistency(input: {
  map: InteractiveVenueMap
  tickets?: VenueMapSkuTicketRef[] | null
}): VenueMapSkuConsistencyResult {
  const errors: VenueMapSkuMismatch[] = []
  const tickets = input.tickets ?? []
  const bySector = new Map<string, VenueMapSkuTicketRef[]>()
  for (const ticket of tickets) {
    const sectorId = ticketSectorId(ticket)
    if (!sectorId) continue
    const list = bySector.get(sectorId) ?? []
    list.push(ticket)
    bySector.set(sectorId, list)
  }

  for (const zone of input.map.zones ?? []) {
    if (zone.layoutType === "general") continue
    const expectedLayout = expectedLayoutForSellMode(zone.sellMode)
    if (zone.layoutType !== expectedLayout) {
      pushError(
        errors,
        mismatch({
          sectorId: zone.id,
          label: zone.name || "Zona",
          sellMode: zone.sellMode,
          expectedLayoutType: expectedLayout,
          actualLayoutType: zone.layoutType,
          expectedCapacityPerUnit:
            expectedLayout === "table_combo" ? Math.max(1, zone.capacityPerUnit || 1) : 1,
          actualCapacityPerUnit: zone.capacityPerUnit,
          message: `La zona "${zone.name || zone.id}" vende en modo ${zone.sellMode} y su tipo de inventario debe ser ${expectedLayout}.`,
        }),
      )
    }
    const expectedCapacity =
      expectedLayout === "table_combo" ? Math.max(1, zone.capacityPerUnit || 1) : 1
    const linked = bySector.get(zone.id) ?? []
    for (const ticket of linked) {
      const actualLayout = ticketLayoutType(ticket)
      const actualCapacity = ticketCapacityPerUnit(ticket)
      if (actualLayout !== expectedLayout) {
        pushError(
          errors,
          mismatch({
            sectorId: zone.id,
            label: ticket.name || zone.name || "Zona",
            sellMode: zone.sellMode,
            expectedLayoutType: expectedLayout,
            actualLayoutType: actualLayout,
            expectedCapacityPerUnit: expectedCapacity,
            actualCapacityPerUnit: actualCapacity,
            message: `El ticket "${ticket.name || zone.name}" esta vinculado a una zona ${zone.sellMode} y debe ser ${expectedLayout}.`,
          }),
        )
      } else if (
        expectedLayout === "table_combo" &&
        actualCapacity != null &&
        actualCapacity !== expectedCapacity
      ) {
        pushError(
          errors,
          mismatch({
            sectorId: zone.id,
            label: ticket.name || zone.name || "Zona",
            sellMode: zone.sellMode,
            expectedLayoutType: expectedLayout,
            actualLayoutType: actualLayout,
            expectedCapacityPerUnit: expectedCapacity,
            actualCapacityPerUnit: actualCapacity,
            message: `El ticket "${ticket.name || zone.name}" debe admitir ${expectedCapacity} personas por unidad (capacidad de la mesa/zona).`,
          }),
        )
      }
    }
  }

  for (const group of listVenuePriceGroups(input.map)) {
    if (group.match.kind === "zone" || group.match.kind === "sector") continue
    const members = furnitureMembers(input.map, group.match)
    const furniture = members.filter((item) => FURNITURE_TYPES.has(item.type))
    if (furniture.length === 0) continue

    const modes = new Set(furniture.map((item) => item.sellMode))
    const sectorId = priceGroupSectorId(group)
    if (modes.size > 1) {
      pushError(
        errors,
        mismatch({
          sectorId,
          label: group.name,
          sellMode: "group",
          expectedLayoutType: "table_combo",
          actualLayoutType: null,
          expectedCapacityPerUnit: null,
          actualCapacityPerUnit: null,
          message: `El grupo "${group.name}" mezcla venta por mesa completa y por silla. Unifica el modo de venta.`,
        }),
      )
      continue
    }

    const sellMode = furniture[0]!.sellMode
    const expectedLayout = expectedLayoutForSellMode(sellMode)
    const chairCounts = new Set(furniture.map((item) => elementChairCount(item)))
    if (sellMode === "group" && chairCounts.size > 1) {
      pushError(
        errors,
        mismatch({
          sectorId,
          label: group.name,
          sellMode,
          expectedLayoutType: expectedLayout,
          actualLayoutType: null,
          expectedCapacityPerUnit: null,
          actualCapacityPerUnit: null,
          message: `Las mesas de "${group.name}" tienen distinta cantidad de sillas y no pueden compartir un SKU de mesa completa.`,
        }),
      )
      continue
    }

    const expectedCapacity =
      sellMode === "group" ? elementChairCount(furniture[0]!) : 1
    const linked = bySector.get(sectorId) ?? []
    for (const ticket of linked) {
      const actualLayout = ticketLayoutType(ticket)
      const actualCapacity = ticketCapacityPerUnit(ticket)
      if (actualLayout !== expectedLayout) {
        pushError(
          errors,
          mismatch({
            sectorId,
            label: ticket.name || group.name,
            sellMode,
            expectedLayoutType: expectedLayout,
            actualLayoutType: actualLayout,
            expectedCapacityPerUnit: expectedCapacity,
            actualCapacityPerUnit: actualCapacity,
            message:
              sellMode === "group"
                ? `El mapa vende "${group.name}" como mesa/palco completo (group) pero el SKU es ${actualLayout || "desconocido"}. Debe ser table_combo.`
                : `El mapa vende "${group.name}" por silla (per_seat) pero el SKU es ${actualLayout || "desconocido"}. Debe ser numbered_seat.`,
          }),
        )
      } else if (
        sellMode === "group" &&
        actualCapacity != null &&
        actualCapacity !== expectedCapacity
      ) {
        pushError(
          errors,
          mismatch({
            sectorId,
            label: ticket.name || group.name,
            sellMode,
            expectedLayoutType: expectedLayout,
            actualLayoutType: actualLayout,
            expectedCapacityPerUnit: expectedCapacity,
            actualCapacityPerUnit: actualCapacity,
            message: `El SKU de "${group.name}" debe tener capacity_per_unit = ${expectedCapacity} (sillas del elemento).`,
          }),
        )
      }
    }
  }

  if (errors.length === 0) return { ok: true, errors: [] }
  return { ok: false, errors }
}

export function formatVenueMapSkuErrors(errors: VenueMapSkuMismatch[]): string {
  const lines = errors.map((error) => error.message)
  return [
    "No se puede guardar: el mapa y los tickets no coinciden.",
    ...lines,
  ].join(" ")
}
