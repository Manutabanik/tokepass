import { mapUnknownError } from "@/lib/errors/error-handler"
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
            message: `La zona "${zone.name || zone.id}" está dibujada de un modo y se vende de otro. Revisá el mapa.`,
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
            message:
              expectedLayout === "table_combo"
                ? `El mapa vende "${ticket.name || zone.name}" como mesa o palco completo, pero la entrada está configurada por silla.`
                : `El mapa vende "${ticket.name || zone.name}" por silla, pero la entrada está configurada como mesa completa.`,
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
            message: `La capacidad del ticket no coincide con la cantidad de sillas del mapa (${ticket.name || zone.name}: ${expectedCapacity} sillas).`,
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
          message: `El grupo "${group.name}" mezcla venta por mesa completa y por silla. Unificá el modo de venta en el mapa.`,
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
          message: `Las mesas de "${group.name}" tienen distinta cantidad de sillas. Igualalas en el mapa o separalas en grupos distintos.`,
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
                ? `El mapa vende "${group.name}" como mesa o palco completo, pero la entrada está configurada por silla.`
                : `El mapa vende "${group.name}" por silla, pero la entrada está configurada como mesa completa.`,
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
            message: `La capacidad del ticket no coincide con la cantidad de sillas del mapa (${group.name}: ${expectedCapacity} sillas).`,
          }),
        )
      }
    }
  }

  if (errors.length === 0) return { ok: true, errors: [] }
  return { ok: false, errors }
}

export function formatVenueMapSkuErrors(errors: VenueMapSkuMismatch[]): string {
  return summarizeVenueMapSkuConflicts(errors).summary
}

export type WizardConflictAction = {
  step: 0 | 1 | 2 | 3 | 4
  label: string
  field?: string
}

export type WizardConflict = {
  summary: string
  actions: WizardConflictAction[]
  sectorId?: string
}

const MAP_ACTION: WizardConflictAction = {
  step: 1,
  label: "Corregir campo",
  field: "venue.venueMap",
}

const TICKETS_ACTION: WizardConflictAction = {
  step: 2,
  label: "Ver detalle",
  field: "tickets",
}

function isCapacityMismatch(error: VenueMapSkuMismatch): boolean {
  return (
    error.expectedCapacityPerUnit != null &&
    error.actualCapacityPerUnit != null &&
    error.expectedCapacityPerUnit !== error.actualCapacityPerUnit
  )
}

function needsMapStep(error: VenueMapSkuMismatch): boolean {
  if (error.actualLayoutType == null) return true
  return /distinta cantidad|mezcla venta|Revisá el mapa/i.test(error.message)
}

function needsTicketsStep(error: VenueMapSkuMismatch): boolean {
  return (
    error.actualCapacityPerUnit != null ||
    Boolean(error.actualLayoutType)
  )
}

export function summarizeVenueMapSkuConflicts(
  errors: VenueMapSkuMismatch[],
): WizardConflict {
  const capacityErrors = errors.filter(isCapacityMismatch)
  const uniqueCapacity = new Map<string, number>()
  for (const error of capacityErrors) {
    uniqueCapacity.set(
      error.label,
      error.expectedCapacityPerUnit as number,
    )
  }

  let summary: string
  if (uniqueCapacity.size > 0) {
    const parts = [...uniqueCapacity.entries()].map(([label, chairs]) => {
      const noun = chairs === 1 ? "silla" : "sillas"
      return `${label}: ${chairs} ${noun}`
    })
    summary = `La capacidad del ticket no coincide con la cantidad de sillas del mapa (${parts.join(", ")}).`
  } else {
    const lines = errors.map((error) => error.message)
    summary = [
      "El mapa y las entradas no coinciden.",
      ...lines,
    ].join(" ")
  }

  const actions: WizardConflictAction[] = []
  if (errors.some(needsMapStep)) actions.push(MAP_ACTION)
  if (errors.some(needsTicketsStep)) actions.push(TICKETS_ACTION)
  if (actions.length === 0) {
    actions.push(MAP_ACTION, TICKETS_ACTION)
  }

  return {
    summary,
    actions,
    sectorId: errors[0]?.sectorId,
  }
}

export function conflictFromPersistError(
  message: string,
): WizardConflict | null {
  const mapped = mapUnknownError(message)
  if (mapped.action) {
    return {
      summary: mapped.message,
      actions: [mapped.action],
    }
  }
  const text = message.trim()
  if (
    !/mapa y las entradas no coinciden|mapa y los tickets no coinciden|sillas del mapa|mesa o palco|por silla|Revisá el mapa/i.test(
      text,
    )
  ) {
    return null
  }
  return {
    summary: text,
    actions: [MAP_ACTION, TICKETS_ACTION],
  }
}
