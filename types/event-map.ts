import type {
  VenueMapElement,
  VenueMapElementSeat,
  VenueMapSeat,
  VenueMapZone,
} from "@/types/venue-map"

/**
 * Clasificación de clic en el lienzo. No reemplaza `VenueMapZone` /
 * `VenueMapElement`; es la vista de dominio para el handler unificado.
 */
export const MAP_ELEMENT_TYPES = [
  "SECTOR_GENERAL",
  "SECTOR_NUMERADO",
  "ASIENTO_LIBRE",
  "MESA_LIBRE",
] as const

export type MapElementType = (typeof MAP_ELEMENT_TYPES)[number]

export type MapClickTarget =
  | { type: "SECTOR_GENERAL"; zone: VenueMapZone }
  | { type: "SECTOR_NUMERADO"; zone: VenueMapZone }
  | { type: "ASIENTO_LIBRE"; element: VenueMapElement; seatId?: string }
  | { type: "MESA_LIBRE"; element: VenueMapElement }

/**
 * Vista de silla para carrito / boleto. Persistencia: `VenueMapElementSeat`
 * o `VenueMapSeat` dentro de `VenueMapElement`.
 */
export interface EventSeat {
  id: string
  sector_id?: string
  table_id?: string
  row_label?: string
  seat_number: string | number
  custom_label?: string
  display_name?: string
  price: number
  ticket_type_id?: string
  is_available: boolean
}

/**
 * Vista de mesa para carrito / boleto. Persistencia: `VenueMapElement`.
 */
export interface EventTable {
  id: string
  sector_id?: string
  table_number: string | number
  custom_label?: string
  display_name?: string
  price_per_seat?: number
  ticket_type_id?: string
  seats: EventSeat[]
}

export function eventSeatFromElementSeat(
  seat: VenueMapElementSeat,
  extras: {
    tableId?: string
    sectorId?: string
    fallbackPrice?: number
  } = {},
): EventSeat {
  const custom = seat.customLabel?.trim() || undefined
  return {
    id: seat.id,
    sector_id: extras.sectorId,
    table_id: extras.tableId,
    row_label: seat.row,
    seat_number: seat.number,
    custom_label: custom,
    display_name: custom,
    price: seat.price ?? extras.fallbackPrice ?? 0,
    ticket_type_id: seat.ticketTypeId,
    is_available: seat.status === "available",
  }
}

export function eventSeatFromVenueSeat(
  seat: VenueMapSeat,
  extras: { sectorId?: string; fallbackPrice?: number } = {},
): EventSeat {
  const custom = seat.customLabel?.trim() || seat.label?.trim() || undefined
  return {
    id: seat.id,
    sector_id: extras.sectorId,
    row_label: seat.row,
    seat_number: seat.number,
    custom_label: custom,
    display_name: custom,
    price: seat.price ?? extras.fallbackPrice ?? 0,
    ticket_type_id: seat.ticketTypeId,
    is_available: seat.status === "available",
  }
}

export function eventTableFromElement(element: VenueMapElement): EventTable {
  const custom = element.customLabel?.trim() || undefined
  const sectorId = element.zoneId || element.groupId || undefined
  return {
    id: element.id,
    sector_id: sectorId,
    table_number: element.label,
    custom_label: custom,
    display_name: custom,
    price_per_seat: element.price,
    ticket_type_id: element.ticketTypeId,
    seats: element.seats.map((seat) =>
      eventSeatFromElementSeat(seat, {
        tableId: element.id,
        sectorId,
        fallbackPrice: element.price,
      }),
    ),
  }
}
