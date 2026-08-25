import type { StorefrontSelectedItem } from "@/lib/stores/storefront-seat-store"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Código de hold: no confundir con waiting-room / lock timeout de demanda. */
export const MISSING_EVENT_DATE_ID = "missing_event_date_id"

export const MISSING_EVENT_DATE_ID_MESSAGE =
  "[seat-hold] falta event_date_id para reservar un asiento en un evento multidía"

export function asHoldEventDateId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const id = value.trim()
  if (!id || id === "full_pass" || id === "all") return null
  return UUID_RE.test(id) ? id : null
}

export function withCheckoutEventDateId(
  item: StorefrontSelectedItem,
  eventDateId?: string | null,
): StorefrontSelectedItem {
  const id = asHoldEventDateId(eventDateId)
  if (!id) return item
  return { ...item, eventDateId: id, dateId: id }
}

export function seatingUnitMatchesEventDate(
  unit: { event_date_id?: string | null; day_id?: string | null },
  eventDateId: string | null,
): boolean {
  if (!eventDateId) return true
  const unitDay = asHoldEventDateId(unit.event_date_id) ?? asHoldEventDateId(unit.day_id)
  if (!unitDay) return true
  return unitDay === eventDateId
}

export function requireHoldEventDateId(input: {
  eventDateId?: unknown
  scheduleDayIds: readonly string[]
}): { ok: true; eventDateId: string | null } | { ok: false; error: typeof MISSING_EVENT_DATE_ID } {
  const eventDateId = asHoldEventDateId(input.eventDateId)
  const dayIds = input.scheduleDayIds
    .map((id) => asHoldEventDateId(id))
    .filter((id): id is string => Boolean(id))
  const multiDay = dayIds.length >= 2
  if (multiDay && !eventDateId) {
    return { ok: false, error: MISSING_EVENT_DATE_ID }
  }
  if (eventDateId && multiDay && !dayIds.includes(eventDateId)) {
    return { ok: false, error: MISSING_EVENT_DATE_ID }
  }
  return { ok: true, eventDateId }
}
