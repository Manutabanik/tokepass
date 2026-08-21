import type { EventSeat, EventTable } from "@/types/event-map"
import {
  eventSeatFromElementSeat,
  eventTableFromElement,
} from "@/types/event-map"
import type { VenueMapElement, VenueMapElementSeat } from "@/types/venue-map"
import {
  generalAdmissionLabel,
  reservedPlaceLabel,
} from "@/lib/seating/seating-type"

export function venueElementTicketLabel(
  element: Pick<VenueMapElement, "customLabel" | "label">,
): string {
  return element.customLabel?.trim() || element.label?.trim() || ""
}

export function venueSeatTicketLabel(
  seat: Pick<VenueMapElementSeat, "customLabel" | "label">,
): string {
  return seat.customLabel?.trim() || seat.label?.trim() || ""
}

/**
 * Nombre que viaja al carrito y se imprime en el boleto.
 * Si hay etiqueta personalizada, se usa tal cual.
 */
function tableDisplayPart(table?: EventTable): string {
  if (!table) return ""
  const custom = table.custom_label?.trim() || table.display_name?.trim()
  if (custom) return custom
  const raw = String(table.table_number ?? "").trim()
  if (!raw) return ""
  if (/^(mesa|tablón|tablon|palco|box|butaca|silla)\b/i.test(raw)) return raw
  return `Mesa ${raw}`
}

export function getSeatDisplayName(
  seat: EventSeat,
  table?: EventTable,
  sectorName?: string,
): string {
  const customSeat = seat.custom_label?.trim() || seat.display_name?.trim()
  if (customSeat) return customSeat

  const tablePart = tableDisplayPart(table)
  const seatPart = `Silla ${seat.seat_number}`
  const sectorPart = sectorName ? `Sector ${sectorName}` : ""

  return [sectorPart, tablePart, seatPart].filter(Boolean).join(" - ")
}

export function getTableDisplayName(
  table: EventTable,
  sectorName?: string,
): string {
  const custom = table.custom_label?.trim() || table.display_name?.trim()
  if (custom) return custom
  const tablePart = tableDisplayPart(table)
  const sectorPart = sectorName ? `Sector ${sectorName}` : ""
  return [sectorPart, tablePart].filter(Boolean).join(" - ")
}

export function getVenueSeatDisplayName(
  element: VenueMapElement,
  seat: VenueMapElementSeat,
  sectorName?: string,
): string {
  return getSeatDisplayName(
    eventSeatFromElementSeat(seat, {
      tableId: element.id,
      sectorId: element.zoneId || element.groupId,
      fallbackPrice: element.price,
    }),
    eventTableFromElement(element),
    sectorName ?? element.sectorName ?? element.groupName,
  )
}

export function getVenueElementDisplayName(
  element: Pick<
    VenueMapElement,
    "customLabel" | "label" | "sectorName" | "groupName" | "type"
  >,
): string {
  const custom = element.customLabel?.trim()
  if (custom) return custom

  const sector = element.sectorName?.trim() || element.groupName?.trim() || ""
  const label = element.label?.trim() || ""
  if (element.type === "standing_zone") {
    return generalAdmissionLabel(sector || label)
  }
  if (sector && label && sector !== label && !label.startsWith(`${sector} `)) {
    return reservedPlaceLabel({
      sectorName: sector,
      tableName: label,
    })
  }
  return label || sector
}
