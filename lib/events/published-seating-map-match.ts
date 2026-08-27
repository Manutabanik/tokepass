export type PublishedSeatingMapRow = {
  id: string
  event_date_id: string | null
}

/**
 * Match an unused seating_maps row. Skip ids already claimed so two
 * incoming maps cannot collapse onto the same undated row.
 */
export function pickUnusedPublishedSeatingMapRow(
  rows: readonly PublishedSeatingMapRow[],
  eventDateId: string | null,
  reservedIds: ReadonlySet<string>,
): PublishedSeatingMapRow | undefined {
  return rows.find((row) => {
    if (reservedIds.has(row.id)) return false
    return eventDateId
      ? row.event_date_id === eventDateId
      : row.event_date_id == null
  })
}

/**
 * Bind a map to a live jornada. Unknown UUIDs are not coerced to null
 * when other days exist — that used to overwrite every day onto one row.
 */
export function resolveHardReplaceSeatingMapDay(input: {
  requested: string | null | undefined
  dayIds: ReadonlySet<string>
}): { writeDateId: string | null } | { keepRequested: string } {
  const requested = input.requested?.trim() || null
  if (!requested) return { writeDateId: null }
  if (input.dayIds.has(requested)) return { writeDateId: requested }
  if (input.dayIds.size === 0) return { writeDateId: null }
  return { keepRequested: requested }
}
