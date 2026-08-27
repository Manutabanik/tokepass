import { asHoldEventDateId } from "@/lib/checkout/seat-hold-day"
import { cartPlaceLabel } from "@/lib/checkout/cart-lines"

export type CartDayStamp = {
  scheduleId: string | null
  dateString: string | null
}

/** Reads the jornada stamped on a cart/seat item. Never the active tab. */
export function cartItemScheduleId(item: {
  scheduleId?: string | null
  eventDateId?: string | null
  dateId?: string | null
}): string | null {
  return (
    asHoldEventDateId(item.scheduleId) ??
    asHoldEventDateId(item.eventDateId) ??
    asHoldEventDateId(item.dateId)
  )
}

export function cartItemDateString(item: {
  dateString?: string | null
  dateLabel?: string | null
}): string | null {
  const stamped = item.dateString?.trim() || item.dateLabel?.trim() || ""
  return stamped || null
}

export function cartItemSeatLabel(item: {
  seatLabel?: string | null
  placeLabel?: string | null
  unitName?: string | null
  name?: string | null
  displayName?: string | null
  type?: string | null
  inventoryType?: string | null
  row?: string | null
  number?: number | null
}): string | null {
  const explicit =
    item.seatLabel?.trim() ||
    item.placeLabel?.trim() ||
    item.unitName?.trim() ||
    ""
  if (explicit) return explicit
  const place = cartPlaceLabel(item)
  return place || null
}

export function resolveCartDayStamp(input: {
  scheduleId?: string | null
  eventDateId?: string | null
  dateId?: string | null
  dateString?: string | null
  dateLabel?: string | null
}): CartDayStamp {
  return {
    scheduleId: cartItemScheduleId(input),
    dateString: cartItemDateString(input),
  }
}

export function applyCartDayStamp<T extends object>(
  item: T,
  stamp: CartDayStamp,
): T & {
  scheduleId?: string | null
  eventDateId?: string | null
  dateId?: string | null
  dateString?: string | null
  dateLabel?: string | null
} {
  const current = item as T & {
    scheduleId?: string | null
    eventDateId?: string | null
    dateId?: string | null
    dateString?: string | null
    dateLabel?: string | null
  }
  const scheduleId = stamp.scheduleId ?? cartItemScheduleId(current)
  const dateString = stamp.dateString ?? cartItemDateString(current)
  return {
    ...item,
    ...(scheduleId
      ? {
          scheduleId,
          eventDateId: scheduleId,
          dateId: scheduleId,
        }
      : {}),
    ...(dateString
      ? {
          dateString,
          dateLabel: dateString,
        }
      : {}),
  }
}

export function applyCartSeatLabel<T extends object>(
  item: T,
  seatLabel?: string | null,
): T & { seatLabel?: string; placeLabel?: string } {
  const current = item as T & {
    seatLabel?: string | null
    placeLabel?: string | null
    unitName?: string | null
    name?: string | null
    displayName?: string | null
    type?: string | null
    inventoryType?: string | null
    row?: string | null
    number?: number | null
  }
  const label = seatLabel?.trim() || cartItemSeatLabel(current)
  if (!label) return item
  return {
    ...item,
    seatLabel: label,
    placeLabel: current.placeLabel?.trim() || label,
  }
}
