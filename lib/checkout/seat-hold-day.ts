import type { StorefrontSelectedItem } from "@/lib/stores/storefront-seat-store"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Código de hold: no confundir con waiting-room / lock timeout de demanda. */
export const MISSING_EVENT_DATE_ID = "missing_event_date_id"

export const MISSING_EVENT_DATE_ID_MESSAGE =
  "Elegí el día del evento para reservar esa ubicación."

export function asHoldEventDateId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const id = value.trim()
  if (!id || id === "full_pass" || id === "all") return null
  return UUID_RE.test(id) ? id : null
}

export function storefrontSelectionKey(item: {
  id?: string | null
  eventDateId?: string | null
  dateId?: string | null
}): string {
  const id = item.id?.trim() ?? ""
  const date =
    asHoldEventDateId(item.eventDateId) ?? asHoldEventDateId(item.dateId) ?? ""
  return date ? `${id}::${date}` : id
}

export function storefrontItemMatchesSchedule(
  item: { eventDateId?: string | null; dateId?: string | null },
  scheduleId?: string | null,
  options?: { scheduleDayCount?: number },
): boolean {
  const itemDate =
    asHoldEventDateId(item.eventDateId) ?? asHoldEventDateId(item.dateId)
  const active = asHoldEventDateId(scheduleId)
  if (!active) return true
  if (!itemDate) return (options?.scheduleDayCount ?? 0) < 2
  return itemDate === active
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
  options?: { scheduleDayCount?: number },
): boolean {
  if (!eventDateId) return (options?.scheduleDayCount ?? 0) < 2
  const unitDay = asHoldEventDateId(unit.event_date_id) ?? asHoldEventDateId(unit.day_id)
  if (!unitDay) return (options?.scheduleDayCount ?? 0) < 2
  return unitDay === eventDateId
}

export function filterSeatingUnitsForRequestedDay<
  T extends { eventDateId?: string | null },
>(
  units: readonly T[],
  eventDateId?: string | null,
  scheduleDayCount = 0,
): T[] {
  const dateId = asHoldEventDateId(eventDateId)
  if (scheduleDayCount >= 2 && !dateId) return []
  return units.filter((unit) =>
    seatingUnitMatchesEventDate(
      { event_date_id: unit.eventDateId },
      dateId,
      { scheduleDayCount },
    ),
  )
}

export function pickSeatingUnitRowForRequestedDay<
  T extends { event_date_id?: string | null },
>(
  rows: readonly T[],
  eventDateId?: string | null,
  scheduleDayCount = 0,
): T | null {
  const dateId = asHoldEventDateId(eventDateId)
  if (scheduleDayCount >= 2 && !dateId) return null
  const matched = rows.filter((row) =>
    seatingUnitMatchesEventDate(row, dateId, { scheduleDayCount }),
  )
  if (matched.length === 0) return null
  if (!dateId) return matched[0] ?? null
  return (
    matched.find((row) => asHoldEventDateId(row.event_date_id) === dateId) ??
    matched[0] ??
    null
  )
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
